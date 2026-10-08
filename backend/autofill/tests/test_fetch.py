import socket
import threading
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import pytest

from autofill import fetch as fetch_module
from autofill.fetch import FetchFailed, FetchRefused, fetch

HTML = b"<html><head><title>Scarf</title></head></html>"


class Shop(BaseHTTPRequestHandler):
    """A tiny shop: / is a page, /moved redirects, /private redirects into the LAN, and so on."""

    def do_GET(self) -> None:  # noqa: N802 - the name http.server expects.
        routes: dict[str, tuple[int, dict[str, str], bytes]] = {
            "/": (200, {"Content-Type": "text/html; charset=utf-8"}, HTML),
            "/moved": (302, {"Location": "/"}, b""),
            "/loop": (302, {"Location": "/loop"}, b""),
            "/private": (302, {"Location": "http://192.168.1.1/admin"}, b""),
            "/metadata": (302, {"Location": "http://169.254.169.254/latest/meta-data/"}, b""),
            "/big": (200, {"Content-Type": "text/html"}, b"x" * 5000),
            "/pdf": (200, {"Content-Type": "application/pdf"}, b"%PDF"),
            "/gone": (404, {"Content-Type": "text/html"}, b"no"),
        }
        status, headers, body = routes.get(self.path, (404, {}, b""))
        self.send_response(status)
        for key, value in headers.items():
            self.send_header(key, value)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args: Any) -> None:
        pass


@pytest.fixture
def shop(monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    """Runs the shop on this machine, and lets "shop.test" resolve to it as if it were a public address."""
    server = ThreadingHTTPServer(("127.0.0.1", 0), Shop)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    real = fetch_module.public_addresses

    def fake_public_addresses(host: str, port: int) -> list[str]:
        return ["127.0.0.1"] if host == "shop.test" else real(host, port)

    monkeypatch.setattr(fetch_module, "public_addresses", fake_public_addresses)
    yield f"http://shop.test:{server.server_address[1]}"
    server.shutdown()


def page(url: str, **kwargs: Any) -> Any:
    return fetch(url, accept=("text/html",), max_bytes=kwargs.get("max_bytes", 1000))


def test_fetches_a_page(shop: str) -> None:
    result = page(shop + "/")

    assert result.body == HTML
    assert result.content_type == "text/html"


def test_follows_redirects(shop: str) -> None:
    assert page(shop + "/moved").url == shop + "/"


def test_gives_up_on_redirect_loops(shop: str) -> None:
    with pytest.raises(FetchFailed):
        page(shop + "/loop")


@pytest.mark.parametrize("path", ["/private", "/metadata"])
def test_refuses_redirects_into_private_addresses(shop: str, path: str) -> None:
    with pytest.raises(FetchRefused):
        page(shop + path)


def test_size_cap(shop: str) -> None:
    with pytest.raises(FetchFailed):
        page(shop + "/big", max_bytes=1000)


def test_only_the_expected_kind_of_file(shop: str) -> None:
    with pytest.raises(FetchFailed):
        page(shop + "/pdf")


def test_error_pages_are_failures(shop: str) -> None:
    with pytest.raises(FetchFailed):
        page(shop + "/gone")


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "ftp://example.com/x",
        "gopher://example.com/",
        "javascript:alert(1)",
        "http://localhost/",
        "http://127.0.0.1:8000/api/v1/me/",
        "http://10.0.0.1/",
        "http://172.16.5.4/",
        "http://192.168.1.1/",
        "http://169.254.169.254/latest/meta-data/",
        "http://[::1]/",
        "http://[::ffff:127.0.0.1]/",
        "http://0.0.0.0/",
        "http://100.64.0.1/",
        "http://user:secret@example.com/",
    ],
)
def test_refuses_anything_but_public_web_addresses(url: str) -> None:
    with pytest.raises(FetchRefused):
        page(url)


def test_refuses_names_that_resolve_to_private_addresses(monkeypatch: pytest.MonkeyPatch) -> None:
    def resolve(host: str, port: int, **kwargs: Any) -> list[Any]:
        # A public-looking name whose DNS answer includes a LAN address.
        return [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", port)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("192.168.1.50", port)),
        ]

    monkeypatch.setattr("autofill.fetch.socket.getaddrinfo", resolve)

    with pytest.raises(FetchRefused):
        page("https://sneaky.example.com/")


def test_unknown_hosts_fail_quietly(monkeypatch: pytest.MonkeyPatch) -> None:
    def resolve(*args: Any, **kwargs: Any) -> list[Any]:
        raise socket.gaierror("no such host")

    monkeypatch.setattr("autofill.fetch.socket.getaddrinfo", resolve)

    with pytest.raises(FetchFailed):
        page("https://no-such-shop.example/")
