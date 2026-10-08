from io import BytesIO
from pathlib import Path

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import User
from wishlists.models import Item
from wishlists.tests.helpers import add_item

pytestmark = pytest.mark.django_db


def picture(size: tuple[int, int] = (3200, 1600), fmt: str = "PNG", mode: str = "RGBA") -> SimpleUploadedFile:
    buffer = BytesIO()
    image = Image.new(mode, size, (200, 30, 30, 128) if mode == "RGBA" else (200, 30, 30))
    extra = {}
    if fmt == "JPEG":
        exif = Image.Exif()
        exif[0x010F] = "Camera maker that should not survive"
        extra["exif"] = exif.tobytes()
    image.save(buffer, format=fmt, **extra)
    return SimpleUploadedFile(f"photo.{fmt.lower()}", buffer.getvalue(), content_type=f"image/{fmt.lower()}")


@pytest.fixture
def item(ann: User) -> Item:
    return add_item(ann.wishlists.get(is_default=True), name="Scarf")


def upload(client: APIClient, item: Item, file: SimpleUploadedFile) -> tuple[int, dict[str, object]]:
    response = client.put(reverse("item-image", args=[item.pk]), {"image": file}, format="multipart")
    return response.status_code, response.json()


def stored_files(media_root: Path) -> list[Path]:
    return sorted(path for path in media_root.rglob("*") if path.is_file())


def test_upload_is_resized_and_stored_as_jpeg(client: APIClient, item: Item, media_root: Path) -> None:
    status, body = upload(client, item, picture())

    assert status == 200
    assert str(body["image"]).startswith("http://testserver/media/items/")
    [stored] = stored_files(media_root)
    with Image.open(stored) as saved:
        assert saved.format == "JPEG"
        assert saved.size == (1600, 800)


def test_metadata_is_removed(client: APIClient, item: Item, media_root: Path) -> None:
    upload(client, item, picture(size=(400, 300), fmt="JPEG", mode="RGB"))

    [stored] = stored_files(media_root)
    with Image.open(stored) as saved:
        assert not saved.getexif()


def test_replacing_a_picture_removes_the_old_file(client: APIClient, item: Item, media_root: Path) -> None:
    upload(client, item, picture())
    [first] = stored_files(media_root)

    upload(client, item, picture(size=(200, 200)))

    [second] = stored_files(media_root)
    assert second != first


def test_removing_a_picture(client: APIClient, item: Item, media_root: Path) -> None:
    upload(client, item, picture())

    response = client.delete(reverse("item-image", args=[item.pk]))

    assert response.status_code == 200
    assert response.json()["image"] is None
    assert stored_files(media_root) == []


def test_deleting_the_item_or_account_removes_the_file(
    client: APIClient, item: Item, media_root: Path
) -> None:
    upload(client, item, picture())
    other = add_item(item.owner.wishlists.get(is_default=True), name="Second")
    upload(client, other, picture())
    assert len(stored_files(media_root)) == 2

    client.delete(reverse("item", args=[item.pk]))
    assert len(stored_files(media_root)) == 1

    client.delete(reverse("me"))
    assert stored_files(media_root) == []


def test_files_that_are_not_pictures_are_refused(client: APIClient, item: Item) -> None:
    status, body = upload(client, item, SimpleUploadedFile("notes.txt", b"hello", content_type="text/plain"))

    assert status == 400
    assert "image" in body


def test_large_files_are_refused(client: APIClient, item: Item, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("wishlists.images.MAX_UPLOAD_BYTES", 100)

    status, _body = upload(client, item, picture())

    assert status == 400


def test_upload_needs_a_file(client: APIClient, item: Item) -> None:
    response = client.put(reverse("item-image", args=[item.pk]), {}, format="multipart")

    assert response.status_code == 400


def test_cannot_upload_to_someone_elses_item(client: APIClient, ann: User, bob: User) -> None:
    bobs_item = add_item(bob.wishlists.get(), name="Bike")

    status, _body = upload(client, bobs_item, picture())

    assert status == 404
