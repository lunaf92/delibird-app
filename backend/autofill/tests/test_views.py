from datetime import timedelta
from io import BytesIO
from pathlib import Path
from typing import Any

import pytest
from django.urls import reverse
from PIL import Image
from pytest_django.fixtures import Settings
from rest_framework.test import APIClient

from accounts.models import User
from accounts.tests.helpers import sign_in_as
from autofill import views
from autofill.fetch import Fetched, FetchFailed, FetchRefused
from wishlists.models import Item
from wishlists.tests.helpers import add_item

pytestmark = pytest.mark.django_db
PAGES = Path(__file__).parent / "pages"


@pytest.fixture
def ann(client: APIClient) -> User:
    user = User.objects.create_user("ann@example.com")
    sign_in_as(client, user)
    return user


@pytest.fixture
def media_root(settings: Settings, tmp_path: Path) -> Path:
    settings.MEDIA_ROOT = tmp_path
    return tmp_path


def serve(monkeypatch: pytest.MonkeyPatch, result: Any) -> list[str]:
    """Replaces the network: every fetch returns `result`, or raises it if it's an exception."""
    asked: list[str] = []

    def fake_fetch(url: str, **kwargs: Any) -> Fetched:
        asked.append(url)
        if isinstance(result, Exception):
            raise result
        fetched: Fetched = result(url) if callable(result) else result
        return fetched

    monkeypatch.setattr(views, "fetch", fake_fetch)
    return asked


def autofill(client: APIClient, url: str) -> Any:
    return client.post(reverse("item-autofill"), {"url": url}, format="json")


def test_autofill_reads_the_shop_page(client: APIClient, ann: User, monkeypatch: pytest.MonkeyPatch) -> None:
    body = (PAGES / "shopify_style.html").read_bytes()
    serve(
        monkeypatch,
        lambda url: Fetched(
            url="https://shop.example.com/products/scarf", content_type="text/html", body=body
        ),
    )

    response = autofill(client, "https://shop.example.com/scarf?utm_source=x")

    assert response.status_code == 200
    assert response.json() == {
        "found": True,
        "url": "https://shop.example.com/scarf?utm_source=x",
        "name": "Wool Scarf – Forest Green",
        "description": "Soft merino, 180 cm long.",
        "price": "39.90",
        "currency": "EUR",
        "image_url": "https://shop.example.com/files/scarf-1.jpg",
    }


def test_a_shop_that_blocks_us_still_keeps_the_link(
    client: APIClient, ann: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    serve(monkeypatch, FetchFailed("HTTP 503"))

    response = autofill(client, "https://www.amazon.example/dp/B000")

    assert response.status_code == 200
    assert response.json() == {
        "found": False,
        "url": "https://www.amazon.example/dp/B000",
        "name": "",
        "description": "",
        "price": None,
        "currency": None,
        "image_url": None,
    }


def test_private_addresses_are_refused(client: APIClient, ann: User, monkeypatch: pytest.MonkeyPatch) -> None:
    serve(monkeypatch, FetchRefused("not a public address"))

    response = autofill(client, "http://192.168.1.1/")

    assert response.status_code == 400
    assert response.json() == {"url": ["This link can't be read: it isn't a public web address."]}


@pytest.mark.parametrize("url", ["not a link", "ftp://example.com/x", ""])
def test_only_web_links(client: APIClient, ann: User, url: str, monkeypatch: pytest.MonkeyPatch) -> None:
    asked = serve(monkeypatch, FetchFailed("should not be called"))

    assert autofill(client, url).status_code == 400
    assert asked == []


def test_autofill_is_rate_limited(client: APIClient, ann: User, monkeypatch: pytest.MonkeyPatch) -> None:
    serve(monkeypatch, FetchFailed("x"))
    monkeypatch.setattr(views, "RATE_LIMIT", (2, timedelta(minutes=10)))

    statuses = [autofill(client, "https://shop.example.com/").status_code for _ in range(3)]

    assert statuses == [200, 200, 429]


def test_autofill_needs_a_session(db: None) -> None:
    assert autofill(APIClient(), "https://shop.example.com/").status_code == 401


def png() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (1200, 900), (10, 120, 60)).save(buffer, format="PNG")
    return buffer.getvalue()


def test_picture_from_a_link(
    client: APIClient, ann: User, media_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    item = add_item(ann.wishlists.get(), name="Scarf")
    serve(monkeypatch, Fetched(url="https://cdn.example.com/a.png", content_type="image/png", body=png()))

    response = client.post(
        reverse("item-image-from-url", args=[item.pk]),
        {"url": "https://cdn.example.com/a.png"},
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["image"].startswith("http://testserver/media/items/")
    [stored] = list((media_root / "items").iterdir())
    with Image.open(stored) as saved:
        assert (saved.format, saved.size) == ("JPEG", (1200, 900))


@pytest.mark.parametrize("error", [FetchFailed("404"), FetchRefused("private")])
def test_pictures_that_cannot_be_fetched(
    client: APIClient, ann: User, monkeypatch: pytest.MonkeyPatch, error: Exception
) -> None:
    item = add_item(ann.wishlists.get(), name="Scarf")
    serve(monkeypatch, error)

    response = client.post(
        reverse("item-image-from-url", args=[item.pk]),
        {"url": "https://cdn.example.com/a.png"},
        format="json",
    )

    assert response.status_code == 400
    item.refresh_from_db()
    assert not item.image


def test_a_link_that_is_not_a_picture(client: APIClient, ann: User, monkeypatch: pytest.MonkeyPatch) -> None:
    item = add_item(ann.wishlists.get(), name="Scarf")
    serve(monkeypatch, Fetched(url="https://cdn.example.com/a.png", content_type="image/png", body=b"<html>"))

    response = client.post(
        reverse("item-image-from-url", args=[item.pk]),
        {"url": "https://cdn.example.com/a.png"},
        format="json",
    )

    assert response.status_code == 400


def test_cannot_set_a_picture_on_someone_elses_item(
    client: APIClient, ann: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    bob = User.objects.create_user("bob@example.com")
    item = add_item(bob.wishlists.get(), name="Bike")
    asked = serve(monkeypatch, FetchFailed("should not be called"))

    response = client.post(
        reverse("item-image-from-url", args=[item.pk]),
        {"url": "https://cdn.example.com/a.png"},
        format="json",
    )

    assert response.status_code == 404
    assert asked == []
    assert not Item.objects.get(pk=item.pk).image
