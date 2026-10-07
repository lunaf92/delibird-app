from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import User
from wishlists.models import Item, Wishlist
from wishlists.services import add_item, create_wishlist

pytestmark = pytest.mark.django_db


@pytest.fixture
def christmas(ann: User) -> Wishlist:
    return create_wishlist(ann, "Christmas")


def test_add_an_item_with_only_a_name(client: APIClient, christmas: Wishlist) -> None:
    response = client.post(reverse("list-items", args=[christmas.pk]), {"name": "Book"}, format="json")

    assert response.status_code == 201
    body = response.json()
    assert {k: body[k] for k in ("wishlist", "name", "url", "description", "rating", "image", "price")} == {
        "wishlist": christmas.pk,
        "name": "Book",
        "url": "",
        "description": "",
        "rating": None,
        "image": None,
        "price": None,
    }
    assert body["currency"] == "EUR"


def test_add_an_item_with_every_field(client: APIClient, christmas: Wishlist) -> None:
    response = client.post(
        reverse("list-items", args=[christmas.pk]),
        {
            "name": "Wool scarf",
            "url": "https://shop.example.com/scarf",
            "description": "The green one, not the grey one.",
            "rating": 5,
            "price": "39.90",
            "currency": "GBP",
        },
        format="json",
    )

    assert response.status_code == 201
    item = Item.objects.get()
    assert (item.url, item.rating, item.price, item.currency) == (
        "https://shop.example.com/scarf",
        5,
        Decimal("39.90"),
        "GBP",
    )


def test_new_items_go_to_the_end(client: APIClient, christmas: Wishlist) -> None:
    add_item(christmas, name="Book")
    client.post(reverse("list-items", args=[christmas.pk]), {"name": "Scarf"}, format="json")

    response = client.get(reverse("list-items", args=[christmas.pk]))

    assert [item["name"] for item in response.json()] == ["Book", "Scarf"]


@pytest.mark.parametrize(
    "fields",
    [
        {"name": ""},
        {"name": "Book", "rating": 0},
        {"name": "Book", "rating": 6},
        {"name": "Book", "price": "-1"},
        {"name": "Book", "price": "123456789.00"},
        {"name": "Book", "currency": "eur"},
        {"name": "Book", "currency": "EURO"},
        {"name": "Book", "url": "not a link"},
        {"name": "x" * 201},
    ],
)
def test_invalid_items_are_refused(client: APIClient, christmas: Wishlist, fields: dict[str, object]) -> None:
    response = client.post(reverse("list-items", args=[christmas.pk]), fields, format="json")

    assert response.status_code == 400
    assert not Item.objects.exists()


def test_edit_an_item(client: APIClient, christmas: Wishlist) -> None:
    item = add_item(christmas, name="Book", rating=3)

    response = client.patch(
        reverse("item", args=[item.pk]), {"name": "Hardback book", "rating": None}, format="json"
    )

    assert response.status_code == 200
    item.refresh_from_db()
    assert (item.name, item.rating) == ("Hardback book", None)


def test_move_an_item_to_the_end_of_another_list(client: APIClient, ann: User, christmas: Wishlist) -> None:
    default = ann.wishlists.get(is_default=True)
    add_item(default, name="Already there")
    item = add_item(christmas, name="Book")

    response = client.patch(reverse("item", args=[item.pk]), {"wishlist": default.pk}, format="json")

    assert response.status_code == 200
    assert [i.name for i in default.items.all()] == ["Already there", "Book"]
    assert not christmas.items.exists()


def test_cannot_move_an_item_to_someone_elses_list(client: APIClient, christmas: Wishlist, bob: User) -> None:
    item = add_item(christmas, name="Book")

    response = client.patch(
        reverse("item", args=[item.pk]), {"wishlist": bob.wishlists.get().pk}, format="json"
    )

    assert response.status_code == 400
    item.refresh_from_db()
    assert item.wishlist_id == christmas.pk


def test_delete_an_item(client: APIClient, christmas: Wishlist) -> None:
    item = add_item(christmas, name="Book")

    assert client.delete(reverse("item", args=[item.pk])).status_code == 204
    assert not Item.objects.exists()


def test_reorder_items(client: APIClient, christmas: Wishlist) -> None:
    book, scarf, bike = (add_item(christmas, name=n) for n in ("Book", "Scarf", "Bike"))

    response = client.post(
        reverse("list-items-reorder", args=[christmas.pk]),
        {"ids": [bike.pk, book.pk, scarf.pk]},
        format="json",
    )

    assert response.status_code == 204
    assert [i.name for i in christmas.items.all()] == ["Bike", "Book", "Scarf"]


def test_reorder_items_needs_exactly_the_lists_items(
    client: APIClient, ann: User, christmas: Wishlist
) -> None:
    book = add_item(christmas, name="Book")
    elsewhere = add_item(ann.wishlists.get(is_default=True), name="Elsewhere")

    response = client.post(
        reverse("list-items-reorder", args=[christmas.pk]), {"ids": [book.pk, elsewhere.pk]}, format="json"
    )

    assert response.status_code == 400


def test_other_peoples_items_look_missing(client: APIClient, ann: User, bob: User) -> None:
    bobs_item = add_item(bob.wishlists.get(), name="Bike")
    url = reverse("item", args=[bobs_item.pk])

    assert client.get(url).status_code == 404
    assert client.patch(url, {"name": "Mine"}, format="json").status_code == 404
    assert client.delete(url).status_code == 404
    assert (
        client.post(reverse("list-items-reorder", args=[bob.wishlists.get().pk]), {"ids": []}).status_code
        == 404
    )
    bobs_item.refresh_from_db()
    assert bobs_item.name == "Bike"
