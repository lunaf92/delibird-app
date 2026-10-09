"""Fetching pages and pictures from shops, safely.

Any user can make the server fetch a link, from inside Federico's home network, so a link must never reach
anything but the public internet: only http and https, every address the host resolves to must be public,
the connection goes to the address that was checked (so DNS can't swap in a private one afterwards), every
redirect is checked again, and there is a short timeout and a size cap.
"""

import http.client
import ipaddress
import socket
import ssl
import zlib
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit

USER_AGENT = "Mozilla/5.0 (compatible; Strena/1.0; wishlist link preview)"
TIMEOUT_SECONDS = 6
MAX_REDIRECTS = 5


class FetchRefused(Exception):
    """The link points somewhere the server must not go (not http(s), or not a public address)."""


class FetchFailed(Exception):
    """The shop didn't answer usefully: unreachable, an error status, too big, or the wrong kind of file.

    `reason` says which, in the words the app shows: "unreachable", "timeout", "blocked" (the shop refused
    us) or "unreadable" (anything else)."""

    def __init__(self, message: str, reason: str = "unreadable") -> None:
        super().__init__(message)
        self.reason = reason


# Statuses shops answer with when they turn away automated visitors.
BLOCKED_STATUSES = {401, 403, 429, 503}


@dataclass
class Fetched:
    url: str
    content_type: str
    body: bytes


def public_addresses(host: str, port: int) -> list[str]:
    """Resolves `host` and returns its addresses, refusing if any of them is not on the public internet."""
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except (socket.gaierror, UnicodeError) as error:
        raise FetchFailed("unknown host", "unreachable") from error
    addresses = sorted({str(info[4][0]) for info in infos})
    for address in addresses:
        ip = ipaddress.ip_address(address.split("%")[0])
        if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
            ip = ip.ipv4_mapped
        if not ip.is_global or ip.is_multicast:
            raise FetchRefused("not a public address")
    if not addresses:
        raise FetchFailed("unknown host", "unreachable")
    return addresses


def check_url(url: str) -> tuple[str, str, int, str]:
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise FetchRefused("only http and https links")
    if parts.username or parts.password:
        raise FetchRefused("links with a user name or password")
    try:
        port = parts.port or (443 if parts.scheme == "https" else 80)
    except ValueError as error:
        raise FetchRefused("bad port") from error
    path = parts.path or "/"
    if parts.query:
        path += "?" + parts.query
    return parts.scheme, parts.hostname, port, path


def open_connection(scheme: str, host: str, port: int) -> http.client.HTTPConnection:
    """Connects to a checked public address of `host`, keeping the host name for TLS and the Host header."""
    address = public_addresses(host, port)[0]
    try:
        sock = socket.create_connection((address, port), timeout=TIMEOUT_SECONDS)
    except TimeoutError as error:
        raise FetchFailed("timed out", "timeout") from error
    except OSError as error:
        raise FetchFailed("unreachable", "unreachable") from error
    if scheme == "https":
        try:
            sock = ssl.create_default_context().wrap_socket(sock, server_hostname=host)
        except (ssl.SSLError, OSError) as error:
            sock.close()
            raise FetchFailed("TLS failed") from error
        connection: http.client.HTTPConnection = http.client.HTTPSConnection(
            host, port, timeout=TIMEOUT_SECONDS
        )
    else:
        connection = http.client.HTTPConnection(host, port, timeout=TIMEOUT_SECONDS)
    connection.sock = sock
    return connection


def decompress(body: bytes, encoding: str | None, max_bytes: int) -> bytes:
    """Unpacks gzip or deflate bodies, refusing anything that unpacks to more than `max_bytes`."""
    encoding = (encoding or "").strip().lower()
    if encoding in ("", "identity"):
        return body
    if encoding not in ("gzip", "x-gzip", "deflate"):
        raise FetchFailed("unsupported encoding")
    wbits = 16 + zlib.MAX_WBITS if "gzip" in encoding else zlib.MAX_WBITS
    try:
        unpacker = zlib.decompressobj(wbits)
        data = unpacker.decompress(body, max_bytes + 1)
    except zlib.error as error:
        raise FetchFailed("broken compression") from error
    if len(data) > max_bytes or unpacker.unconsumed_tail:
        raise FetchFailed("too big")
    return data


def fetch(url: str, *, accept: tuple[str, ...], max_bytes: int) -> Fetched:
    """GETs `url`, following up to five redirects, and returns the body if its type starts with `accept`."""
    for _ in range(MAX_REDIRECTS + 1):
        scheme, host, port, path = check_url(url)
        connection = open_connection(scheme, host, port)
        try:
            connection.request(
                "GET",
                path,
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept": ", ".join(f"{a}*" if a.endswith("/") else a for a in accept)
                    + ";q=0.9, */*;q=0.1",
                    "Accept-Language": "en,it;q=0.8,es;q=0.7",
                    # Many shops compress whether asked or not, so ask for gzip and unpack it below.
                    "Accept-Encoding": "gzip, deflate",
                },
            )
            response = connection.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                location = response.getheader("Location")
                if not location:
                    raise FetchFailed("redirect without a location")
                url = urljoin(url, location)
                continue
            if response.status != 200:
                reason = "blocked" if response.status in BLOCKED_STATUSES else "unreadable"
                raise FetchFailed(f"HTTP {response.status}", reason)
            content_type = (response.getheader("Content-Type") or "").split(";")[0].strip().lower()
            if not content_type.startswith(accept):
                raise FetchFailed("wrong kind of file")
            body = response.read(max_bytes + 1)
            if len(body) > max_bytes:
                raise FetchFailed("too big")
            body = decompress(body, response.getheader("Content-Encoding"), max_bytes)
            return Fetched(url=url, content_type=content_type, body=body)
        except TimeoutError as error:
            raise FetchFailed("timed out", "timeout") from error
        except (OSError, http.client.HTTPException) as error:
            raise FetchFailed("connection failed") from error
        finally:
            connection.close()
    raise FetchFailed("too many redirects")
