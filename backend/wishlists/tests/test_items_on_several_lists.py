import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import User
from wishlists.models import Item, ListEntry, Wishlist
from wishlists.services import create_wishlist
from wishlists.tests.helpers import add_item

pytestmark = pytest.mark.django_db


@pytest.fixture
def default(ann: User) -> Wishlist:
    return ann.wishlists.get(is_default=True)


@pytest.fixture
def christmas(ann: User) -> Wishlist:
    return create_wishlist(ann, "Christmas")


@pytest.fixture
def birthday(ann: User) -> Wishlist:
    return create_wishlist(ann, "Birthday")


def names_on(client: APIClient, wishlist: Wishlist) -> list[str]:
    return [item["name"] for item in client.get(reverse("list", args=[wishlist.pk])).json()["items"]]


def test_new_items_also_go_on_the_default_list(
    client: APIClient, default: Wishlist, christmas: Wishlist
) -> None:
    client.post(reverse("list-items", args=[christmas.pk]), {"name": "Scarf"}, format="json")

    assert names_on(client, christmas) == ["Scarf"]
    assert names_on(client, default) == ["Scarf"]


def test_a_new_item_can_go_on_several_lists_at_once(
    client: APIClient, default: Wishlist, christmas: Wishlist, birthday: Wishlist
) -> None:
    response = client.post(
        reverse("list-items", args=[christmas.pk]), {"name": "Scarf", "lists": [birthday.pk]}, format="json"
    )

    assert response.json()["lists"] == sorted([default.pk, christmas.pk, birthday.pk])


def test_putting_an_existing_item_on_another_list(
    client: APIClient, default: Wishlist, christmas: Wishlist, birthday: Wishlist
) -> None:
    add_item(birthday, name="Book")
    scarf = add_item(christmas, name="Scarf")

    response = client.put(reverse("list-item", args=[birthday.pk, scarf.pk]))

    assert response.status_code == 200
    assert response.json()["lists"] == sorted([default.pk, christmas.pk, birthday.pk])
    assert names_on(client, birthday) == ["Book", "Scarf"]
    # Doing it twice changes nothing.
    client.put(reverse("list-item", args=[birthday.pk, scarf.pk]))
    assert names_on(client, birthday) == ["Book", "Scarf"]


def test_editing_an_item_changes_it_on_every_list(
    client: APIClient, christmas: Wishlist, birthday: Wishlist
) -> None:
    scarf = add_item(christmas, name="Scarf")
    client.put(reverse("list-item", args=[birthday.pk, scarf.pk]))

    client.patch(reverse("item", args=[scarf.pk]), {"name": "Green scarf"}, format="json")

    assert names_on(client, christmas) == names_on(client, birthday) == ["Green scarf"]


def test_choosing_exactly_which_lists_an_item_is_on(
    client: APIClient, default: Wishlist, christmas: Wishlist, birthday: Wishlist
) -> None:
    scarf = add_item(christmas, name="Scarf")

    response = client.patch(reverse("item", args=[scarf.pk]), {"lists": [birthday.pk]}, format="json")

    # Off Christmas, onto Birthday, and still on the default list without asking.
    assert response.json()["lists"] == sorted([default.pk, birthday.pk])
    assert names_on(client, christmas) == []


def test_taking_an_item_off_one_list_keeps_it_elsewhere(
    client: APIClient, default: Wishlist, christmas: Wishlist
) -> None:
    scarf = add_item(christmas, name="Scarf")

    response = client.delete(reverse("list-item", args=[christmas.pk, scarf.pk]))

    assert response.status_code == 204
    assert names_on(client, christmas) == []
    assert names_on(client, default) == ["Scarf"]


def test_taking_an_item_off_the_default_list_deletes_it(
    client: APIClient, default: Wishlist, christmas: Wishlist
) -> None:
    scarf = add_item(christmas, name="Scarf")

    assert client.delete(reverse("list-item", args=[default.pk, scarf.pk])).status_code == 204

    assert not Item.objects.exists()
    assert names_on(client, christmas) == []


def test_deleting_an_item_takes_it_off_every_list(
    client: APIClient, christmas: Wishlist, birthday: Wishlist
) -> None:
    scarf = add_item(christmas, name="Scarf")
    client.put(reverse("list-item", args=[birthday.pk, scarf.pk]))

    client.delete(reverse("item", args=[scarf.pk]))

    assert not ListEntry.objects.exists()


def test_each_list_has_its_own_order(
    client: APIClient, default: Wishlist, christmas: Wishlist, birthday: Wishlist
) -> None:
    book, scarf = add_item(christmas, name="Book"), add_item(christmas, name="Scarf")
    client.put(reverse("list-item", args=[birthday.pk, scarf.pk]))
    client.put(reverse("list-item", args=[birthday.pk, book.pk]))

    client.post(
        reverse("list-items-reorder", args=[christmas.pk]), {"ids": [scarf.pk, book.pk]}, format="json"
    )

    assert names_on(client, christmas) == ["Scarf", "Book"]
    assert names_on(client, birthday) == ["Scarf", "Book"]
    assert names_on(client, default) == ["Book", "Scarf"]


def test_list_counts_count_each_lists_items(
    client: APIClient, christmas: Wishlist, birthday: Wishlist
) -> None:
    scarf = add_item(christmas, name="Scarf")
    add_item(christmas, name="Book")
    client.put(reverse("list-item", args=[birthday.pk, scarf.pk]))

    counts = {w["name"]: w["item_count"] for w in client.get(reverse("lists")).json()}

    assert counts == {"My wishlist": 2, "Christmas": 2, "Birthday": 1}


def test_cannot_touch_someone_elses_items_or_lists(client: APIClient, christmas: Wishlist, bob: User) -> None:
    bobs_list = bob.wishlists.get()
    bobs_item = add_item(bobs_list, name="Bike")
    mine = add_item(christmas, name="Scarf")

    assert client.put(reverse("list-item", args=[christmas.pk, bobs_item.pk])).status_code == 404
    assert client.put(reverse("list-item", args=[bobs_list.pk, mine.pk])).status_code == 404
    assert client.delete(reverse("list-item", args=[bobs_list.pk, bobs_item.pk])).status_code == 404
    assert Item.objects.filter(pk=bobs_item.pk).exists()


def test_taking_off_an_item_that_is_not_on_the_list_is_404(
    client: APIClient, christmas: Wishlist, birthday: Wishlist
) -> None:
    scarf = add_item(christmas, name="Scarf")

    assert client.delete(reverse("list-item", args=[birthday.pk, scarf.pk])).status_code == 404
