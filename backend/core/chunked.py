"""Uploads sent in chunks, without a Content-Length.

Phones (Android's networking library, used by React Native) send file uploads with
`Transfer-Encoding: chunked`. gunicorn decodes the chunks, but Django treats a request without a
Content-Length as having no body: it answered "Choose a picture to upload" before the phone had finished
sending, closed the connection, and the app only saw the connection drop ("can't reach the server").
This reads such a body first and hands it to Django with its length.
"""

import io
from collections.abc import Callable, Iterable
from typing import Any

# The largest body read this way: pictures are at most 10 MB (wishlists/images.py), plus the form around them.
MAX_CHUNKED_BODY = 16 * 1024 * 1024

WSGIApp = Callable[[dict[str, Any], Callable[..., Any]], Iterable[bytes]]


def accept_chunked_bodies(app: WSGIApp) -> WSGIApp:
    def wrapped(environ: dict[str, Any], start_response: Callable[..., Any]) -> Iterable[bytes]:
        chunked = "chunked" in environ.get("HTTP_TRANSFER_ENCODING", "").lower()
        # Only servers that decode the chunks themselves (gunicorn does) say the input ends on its own.
        if chunked and not environ.get("CONTENT_LENGTH") and environ.get("wsgi.input_terminated"):
            body = environ["wsgi.input"].read(MAX_CHUNKED_BODY + 1)
            if len(body) > MAX_CHUNKED_BODY:
                start_response(
                    "413 Content Too Large",
                    [("Content-Type", "application/json"), ("Connection", "close")],
                )
                # No message: the app says it in the person's language.
                return [b"{}"]
            environ["wsgi.input"] = io.BytesIO(body)
            environ["CONTENT_LENGTH"] = str(len(body))
        return app(environ, start_response)

    return wrapped
