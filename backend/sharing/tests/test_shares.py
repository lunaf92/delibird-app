import pytest
from django.urls import reverse
from pytest_django.fixtures import Settings
from rest_framework.test import APIClient

from accounts.models import User
from accounts.tests.helpers import sign_in_as
from sharing.models import ItemChange, Share
from sharing.services import NewShare, share_list
from wishlists.models import Item, Wishlist
from wishlists.tests.helpers import add_item

pytestmark = pytest.mark.django_db


def test_sharing_a_list_returns_a_personal_link_once(
    client: APIClient, christmas: Wishlist, settings: Settings
) -> None:
    settings.APP_URL = "http://192.168.1.50:8081"

    response = client.post(
        reverse("list-shares", args=[christmas.pk]), {"email": "Bob@Example.com"}, format="json"
    )

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "bob@example.com"
    assert body["joined"] is False
    assert body["link"].startswith("http://192.168.1.50:8081/shared/")
    token = body["link"].rsplit("/", 1)[1]
    assert token not in Share.objects.get().token_hash
    listed = client.get(reverse("list-shares", args=[christmas.pk])).json()
    assert [s["email"] for s in listed] == ["bob@example.com"]
    assert "link" not in listed[0]


def test_each_person_gets_their_own_link(client: APIClient, christmas: Wishlist) -> None:
    first = client.post(
        reverse("list-shares", args=[christmas.pk]), {"email": "bob@example.com"}, format="json"
    )
    second = client.post(
        reverse("list-shares", args=[christmas.pk]), {"email": "carol@example.com"}, format="json"
    )

    assert first.json()["link"] != second.json()["link"]


def test_cannot_share_twice_with_the_same_address(client: APIClient, christmas: Wishlist) -> None:
    client.post(reverse("list-shares", args=[christmas.pk]), {"email": "bob@example.com"}, format="json")

    response = client.post(
        reverse("list-shares", args=[christmas.pk]), {"email": "BOB@example.com"}, format="json"
    )

    assert response.status_code == 400


def test_lists_say_whether_they_are_shared(client: APIClient, christmas: Wishlist, ann: User) -> None:
    client.post(reverse("list-shares", args=[christmas.pk]), {"email": "bob@example.com"}, format="json")

    lists = {w["name"]: w["is_shared"] for w in client.get(reverse("lists")).json()}

    assert lists == {"My wishlist": False, "Christmas": True}
    assert client.get(reverse("list", args=[christmas.pk])).json()["is_shared"] is True


def test_stopping_a_share_kills_the_link(
    client: APIClient, bob_share: NewShare, bob_client: APIClient
) -> None:
    response = client.delete(reverse("share", args=[bob_share.share.pk]))

    assert response.status_code == 204
    assert APIClient().get(reverse("shared", args=[bob_share.token])).status_code == 404
    assert bob_client.get(reverse("shared-with-me")).json() == []
    assert client.get(reverse("list-shares", args=[bob_share.share.wishlist_id])).json() == []
    # The same person can be invited again, with a new link.
    again = client.post(
        reverse("list-shares", args=[bob_share.share.wishlist_id]),
        {"email": "bob@example.com"},
        format="json",
    )
    assert again.status_code == 201


def test_only_the_owner_manages_shares(
    bob_client: APIClient, christmas: Wishlist, bob_share: NewShare
) -> None:
    assert bob_client.get(reverse("list-shares", args=[christmas.pk])).status_code == 404
    assert (
        bob_client.post(reverse("list-shares", args=[christmas.pk]), {"email": "x@example.com"}).status_code
        == 404
    )
    assert bob_client.delete(reverse("share", args=[bob_share.share.pk])).status_code == 404


def test_signed_out_link_shows_the_list_without_reservations(
    christmas: Wishlist, scarf: Item, bob_share: NewShare
) -> None:
    response = APIClient().get(reverse("shared", args=[bob_share.token]))

    assert response.status_code == 200
    body = response.json()
    assert (body["name"], body["owner_name"], body["role"]) == ("Christmas", "Ann", "anonymous")
    assert body["items"] == [
        {
            "id": scarf.pk,
            "name": "Wool scarf",
            "url": "",
            "shop_url": "",
            "affiliate": False,
            "description": "",
            "rating": None,
            "image": None,
            "price": "39.90",
            "currency": "EUR",
        }
    ]


def test_link_roles(
    client: APIClient, christmas: Wishlist, bob_share: NewShare, bob_client: APIClient
) -> None:
    carol = APIClient()
    sign_in_as(carol, User.objects.create_user("carol@example.com"))
    url = reverse("shared", args=[bob_share.token])

    assert client.get(url).json()["role"] == "owner"
    assert bob_client.get(url).json()["role"] == "viewer"
    assert carol.get(url).json()["role"] == "invited"


def test_unknown_links_are_404() -> None:
    assert APIClient().get(reverse("shared", args=["nope"])).status_code == 404


def test_joining_puts_the_list_under_shared_with_me(
    christmas: Wishlist, scarf: Item, bob_client: APIClient
) -> None:
    new = share_list(christmas, "bob@example.com")

    response = bob_client.post(reverse("shared-join", args=[new.token]))

    assert response.status_code == 200
    assert response.json() == {"id": christmas.pk, "name": "Christmas", "owner_name": "Ann", "item_count": 1}
    assert bob_client.get(reverse("shared-with-me")).json() == [response.json()]
    # Joining again is fine.
    assert bob_client.post(reverse("shared-join", args=[new.token])).status_code == 200


def test_a_link_accepted_by_someone_else_cannot_be_reused(bob_share: NewShare) -> None:
    carol = APIClient()
    sign_in_as(carol, User.objects.create_user("carol@example.com"))

    response = carol.post(reverse("shared-join", args=[bob_share.token]))

    assert response.status_code == 403
    assert carol.get(reverse("shared-with-me")).json() == []


def test_the_owner_cannot_join_their_own_list(client: APIClient, christmas: Wishlist) -> None:
    new = share_list(christmas, "bob@example.com")

    response = client.post(reverse("shared-join", args=[new.token]))

    assert response.status_code == 400
    assert response.json() == {"detail": "This is your own list."}


def test_joining_needs_a_session(christmas: Wishlist) -> None:
    new = share_list(christmas, "bob@example.com")

    assert APIClient().post(reverse("shared-join", args=[new.token])).status_code == 401


def test_owners_shared_lists_page_shows_who_joined(
    client: APIClient, christmas: Wishlist, bob_share: NewShare
) -> None:
    share_list(christmas, "carol@example.com")

    shares = client.get(reverse("list-shares", args=[christmas.pk])).json()

    assert [(s["email"], s["joined"], s["joined_as"]) for s in shares] == [
        ("bob@example.com", True, "Bob"),
        ("carol@example.com", False, None),
    ]


def test_edits_and_deletions_on_shared_lists_are_recorded(
    client: APIClient, christmas: Wishlist, scarf: Item, bob_share: NewShare, ann: User
) -> None:
    unshared_item = add_item(ann.wishlists.get(is_default=True), name="Socks")

    client.patch(reverse("item", args=[scarf.pk]), {"name": "Red scarf"}, format="json")
    client.delete(reverse("item", args=[scarf.pk]))
    client.patch(reverse("item", args=[unshared_item.pk]), {"name": "Wool socks"}, format="json")

    assert list(ItemChange.objects.values_list("item_name", "kind")) == [
        ("Red scarf", "changed"),
        ("Red scarf", "deleted"),
    ]


def test_deleting_the_owner_account_removes_shares(client: APIClient, bob_share: NewShare) -> None:
    client.delete(reverse("me"))

    assert not Share.objects.exists()


def test_items_say_whether_they_are_on_a_shared_list(
    client: APIClient, ann: User, christmas: Wishlist, scarf: Item, bob_share: NewShare
) -> None:
    only_on_default = add_item(ann.wishlists.get(is_default=True), name="Socks")

    assert client.get(reverse("item", args=[scarf.pk])).json()["on_shared_list"] is True
    assert client.get(reverse("item", args=[only_on_default.pk])).json()["on_shared_list"] is False
