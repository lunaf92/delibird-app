import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import User
from wishlists.models import Item, Wishlist
from wishlists.services import create_wishlist
from wishlists.tests.helpers import add_item

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize(
    ("language", "name"),
    [("en", "My wishlist"), ("it", "La mia lista dei desideri"), ("es", "Mi lista de deseos")],
)
def test_new_accounts_get_a_default_list_in_their_language(language: str, name: str) -> None:
    user = User.objects.create_user("new@example.com", language=language)

    [wishlist] = user.wishlists.all()
    assert (wishlist.name, wishlist.is_default) == (name, True)


def test_lists_are_the_owners_own_in_order(client: APIClient, ann: User, bob: User) -> None:
    second = create_wishlist(ann, "Birthday")
    add_item(second, name="Book")
    add_item(second, name="Scarf")
    create_wishlist(bob, "Bob's list")

    response = client.get(reverse("lists"))

    assert response.status_code == 200
    assert [(w["name"], w["is_default"], w["item_count"]) for w in response.json()] == [
        ("My wishlist", True, 2),  # Every item is on the default list.
        ("Birthday", False, 2),
    ]


def test_create_list_goes_to_the_end(client: APIClient, ann: User) -> None:
    create_wishlist(ann, "Birthday")

    response = client.post(reverse("lists"), {"name": "Christmas"}, format="json")

    assert response.status_code == 201
    assert response.json()["name"] == "Christmas"
    assert response.json()["is_default"] is False
    assert response.json()["item_count"] == 0
    assert [w.name for w in Wishlist.objects.filter(owner=ann)] == ["My wishlist", "Birthday", "Christmas"]


def test_create_list_needs_a_name(client: APIClient, ann: User) -> None:
    assert client.post(reverse("lists"), {"name": ""}, format="json").status_code == 400


def test_list_detail_includes_its_items_in_order(client: APIClient, ann: User) -> None:
    wishlist = create_wishlist(ann, "Christmas")
    add_item(wishlist, name="Book")
    add_item(wishlist, name="Scarf")

    response = client.get(reverse("list", args=[wishlist.pk]))

    assert response.status_code == 200
    assert response.json()["name"] == "Christmas"
    assert [item["name"] for item in response.json()["items"]] == ["Book", "Scarf"]


def test_rename_a_list_including_the_default(client: APIClient, ann: User) -> None:
    default = ann.wishlists.get(is_default=True)

    response = client.patch(reverse("list", args=[default.pk]), {"name": "Ideas"}, format="json")

    assert response.status_code == 200
    default.refresh_from_db()
    assert (default.name, default.is_default) == ("Ideas", True)


def test_is_default_cannot_be_changed(client: APIClient, ann: User) -> None:
    other = create_wishlist(ann, "Christmas")

    client.patch(reverse("list", args=[other.pk]), {"is_default": True}, format="json")

    other.refresh_from_db()
    assert not other.is_default


def test_deleting_a_list_keeps_its_items_on_the_default_list(client: APIClient, ann: User) -> None:
    wishlist = create_wishlist(ann, "Christmas")
    add_item(wishlist, name="Book")

    response = client.delete(reverse("list", args=[wishlist.pk]))

    assert response.status_code == 204
    assert not Wishlist.objects.filter(pk=wishlist.pk).exists()
    default = ann.wishlists.get(is_default=True)
    assert [i["name"] for i in client.get(reverse("list", args=[default.pk])).json()["items"]] == ["Book"]
    assert Item.objects.count() == 1


def test_default_list_cannot_be_deleted(client: APIClient, ann: User) -> None:
    default = ann.wishlists.get(is_default=True)

    response = client.delete(reverse("list", args=[default.pk]))

    assert response.status_code == 400
    assert response.json() == {"detail": "Your default list can't be deleted."}
    assert Wishlist.objects.filter(pk=default.pk).exists()


def test_reorder_lists(client: APIClient, ann: User) -> None:
    default = ann.wishlists.get(is_default=True)
    birthday = create_wishlist(ann, "Birthday")
    christmas = create_wishlist(ann, "Christmas")

    response = client.post(
        reverse("lists-reorder"), {"ids": [christmas.pk, default.pk, birthday.pk]}, format="json"
    )

    assert response.status_code == 204
    assert [w["name"] for w in client.get(reverse("lists")).json()] == [
        "Christmas",
        "My wishlist",
        "Birthday",
    ]


def test_reorder_needs_every_list_exactly_once(client: APIClient, ann: User, bob: User) -> None:
    default = ann.wishlists.get(is_default=True)
    birthday = create_wishlist(ann, "Birthday")
    bobs = bob.wishlists.get()

    for ids in ([default.pk], [default.pk, birthday.pk, birthday.pk], [default.pk, birthday.pk, bobs.pk]):
        response = client.post(reverse("lists-reorder"), {"ids": ids}, format="json")
        assert response.status_code == 400, ids


def test_other_peoples_lists_look_missing(client: APIClient, ann: User, bob: User) -> None:
    bobs = bob.wishlists.get()
    url = reverse("list", args=[bobs.pk])

    assert client.get(url).status_code == 404
    assert client.patch(url, {"name": "Mine now"}, format="json").status_code == 404
    assert client.delete(url).status_code == 404
    assert client.get(reverse("list-items", args=[bobs.pk])).status_code == 404
    assert client.post(reverse("list-items", args=[bobs.pk]), {"name": "X"}, format="json").status_code == 404
    bobs.refresh_from_db()
    assert bobs.name == "My wishlist"


def test_lists_need_a_session(db: None) -> None:
    assert APIClient().get(reverse("lists")).status_code == 401


def test_deleting_the_account_deletes_its_lists_and_items(client: APIClient, ann: User, bob: User) -> None:
    add_item(create_wishlist(ann, "Christmas"), name="Book")
    add_item(bob.wishlists.get(), name="Bike")

    assert client.delete(reverse("me")).status_code == 204

    assert list(Wishlist.objects.values_list("owner__email", flat=True)) == ["bob@example.com"]
    assert list(Item.objects.values_list("name", flat=True)) == ["Bike"]
