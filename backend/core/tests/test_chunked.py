import io
from typing import Any

from core.chunked import MAX_CHUNKED_BODY, accept_chunked_bodies


class Recorder:
    """A stand-in for Django: remembers what it was given and reads the body as Django would."""

    def __init__(self) -> None:
        self.body: bytes | None = None
        self.content_length: str | None = None

    def __call__(self, environ: dict[str, Any], start_response: Any) -> list[bytes]:
        self.content_length = environ.get("CONTENT_LENGTH")
        self.body = environ["wsgi.input"].read(int(self.content_length or 0))
        start_response("200 OK", [])
        return [b"ok"]


def call(environ: dict[str, Any]) -> tuple[Recorder, list[str], list[bytes]]:
    django = Recorder()
    statuses: list[str] = []
    result = accept_chunked_bodies(django)(environ, lambda status, headers: statuses.append(status))
    return django, statuses, list(result)


def chunked(body: bytes, **extra: Any) -> dict[str, Any]:
    # gunicorn has already decoded the chunks, so wsgi.input yields the plain body and then ends.
    return {
        "HTTP_TRANSFER_ENCODING": "chunked",
        "wsgi.input": io.BytesIO(body),
        "wsgi.input_terminated": True,
        **extra,
    }


def test_a_chunked_upload_reaches_django_with_its_length() -> None:
    picture = b"--b\r\n" + b"\xff\xd8" * 300_000 + b"\r\n--b--\r\n"

    django, statuses, _ = call(chunked(picture))

    assert statuses == ["200 OK"]
    assert django.content_length == str(len(picture))
    assert django.body == picture


def test_an_oversized_chunked_upload_is_refused_without_reading_on() -> None:
    django, statuses, body = call(chunked(b"x" * (MAX_CHUNKED_BODY + 10)))

    assert statuses == ["413 Content Too Large"]
    assert body == [b"{}"]
    assert django.body is None


def test_requests_with_a_length_are_passed_on_untouched() -> None:
    django, _, _ = call(
        {"CONTENT_LENGTH": "5", "wsgi.input": io.BytesIO(b"hello"), "wsgi.input_terminated": True}
    )

    assert (django.content_length, django.body) == ("5", b"hello")


def test_chunked_bodies_are_left_alone_when_the_server_does_not_decode_them() -> None:
    django, _, _ = call(chunked(b"5\r\nhello\r\n0\r\n\r\n", **{"wsgi.input_terminated": False}))

    assert django.content_length is None
