import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import User
from accounts.tests.helpers import sign_in_as
from sharing.models import Reservation
from sharing.services import NewShare, join, share_list
from wishlists.models import Item, Wishlist
from wishlists.services import add_item

pytestmark = pytest.mark.django_db


@pytest.fixture
def carol(christmas: Wishlist) -> APIClient:
    user = User.objects.create_user("carol@example.com", display_name="")
    join(share_list(christmas, "carol@example.com").share, user)
    client = APIClient()
    sign_in_as(client, user)
    return client


def viewer_items(client: APIClient, wishlist: Wishlist) -> dict[str, object]:
    response = client.get(reverse("shared-with-me-list", args=[wishlist.pk]))
    assert response.status_code == 200
    return {item["name"]: item["reservation"] for item in response.json()["items"]}


def test_reserving_and_what_everyone_sees(
    christmas: Wishlist, scarf: Item, bob_share: NewShare, bob_client: APIClient, carol: APIClient
) -> None:
    add_item(christmas, name="Bike")

    response = bob_client.post(reverse("item-reservation", args=[scarf.pk]))

    assert response.status_code == 204
    assert viewer_items(bob_client, christmas) == {
        "Wool scarf": {"status": "mine", "by": None},
        "Bike": {"status": "free", "by": None},
    }
    assert viewer_items(carol, christmas)["Wool scarf"] == {"status": "taken", "by": "Bob"}


def test_taken_by_shows_the_email_when_there_is_no_display_name(
    christmas: Wishlist, scarf: Item, bob_share: NewShare, bob_client: APIClient, carol: APIClient
) -> None:
    carol.post(reverse("item-reservation", args=[scarf.pk]))

    assert viewer_items(bob_client, christmas)["Wool scarf"] == {"status": "taken", "by": "carol@example.com"}


def test_cannot_reserve_what_someone_else_reserved(
    scarf: Item, bob_share: NewShare, bob_client: APIClient, carol: APIClient
) -> None:
    carol.post(reverse("item-reservation", args=[scarf.pk]))

    response = bob_client.post(reverse("item-reservation", args=[scarf.pk]))

    assert response.status_code == 409
    assert Reservation.objects.get().buyer.email == "carol@example.com"


def test_reserving_twice_is_fine(scarf: Item, bob_share: NewShare, bob_client: APIClient) -> None:
    bob_client.post(reverse("item-reservation", args=[scarf.pk]))

    assert bob_client.post(reverse("item-reservation", args=[scarf.pk])).status_code == 204
    assert Reservation.objects.count() == 1


def test_the_buyer_can_cancel(
    scarf: Item, bob_share: NewShare, bob_client: APIClient, carol: APIClient
) -> None:
    bob_client.post(reverse("item-reservation", args=[scarf.pk]))

    assert carol.delete(reverse("item-reservation", args=[scarf.pk])).status_code == 404
    assert bob_client.delete(reverse("item-reservation", args=[scarf.pk])).status_code == 204
    assert not Reservation.objects.exists()


def test_only_people_who_joined_can_reserve(christmas: Wishlist, scarf: Item) -> None:
    invited = User.objects.create_user("dave@example.com")
    share_list(christmas, "dave@example.com")  # Invited, but never accepted the link.
    stranger = APIClient()
    sign_in_as(stranger, invited)

    assert stranger.post(reverse("item-reservation", args=[scarf.pk])).status_code == 404
    assert stranger.get(reverse("shared-with-me-list", args=[christmas.pk])).status_code == 404
    assert APIClient().post(reverse("item-reservation", args=[scarf.pk])).status_code == 401


def test_revoked_viewers_lose_access_but_their_reservation_stays(
    client: APIClient, scarf: Item, bob_share: NewShare, bob_client: APIClient
) -> None:
    bob_client.post(reverse("item-reservation", args=[scarf.pk]))

    client.delete(reverse("share", args=[bob_share.share.pk]))

    assert bob_client.get(reverse("shared-with-me-list", args=[scarf.wishlist_id])).status_code == 404
    assert bob_client.delete(reverse("item-reservation", args=[scarf.pk])).status_code == 404
    assert Reservation.objects.count() == 1


def test_deleting_the_buyer_account_releases_their_reservations(
    scarf: Item, bob_share: NewShare, bob_client: APIClient, carol: APIClient
) -> None:
    bob_client.post(reverse("item-reservation", args=[scarf.pk]))

    bob_client.delete(reverse("me"))

    assert not Reservation.objects.exists()
    assert viewer_items(carol, scarf.wishlist)["Wool scarf"] == {"status": "free", "by": None}


def test_deleting_a_reserved_item_removes_the_reservation(
    client: APIClient, scarf: Item, bob_share: NewShare, bob_client: APIClient
) -> None:
    bob_client.post(reverse("item-reservation", args=[scarf.pk]))

    assert client.delete(reverse("item", args=[scarf.pk])).status_code == 204
    assert not Reservation.objects.exists()


def test_reserving_does_not_touch_the_item(scarf: Item, bob_share: NewShare, bob_client: APIClient) -> None:
    before = Item.objects.filter(pk=scarf.pk).values().get()

    bob_client.post(reverse("item-reservation", args=[scarf.pk]))
    bob_client.delete(reverse("item-reservation", args=[scarf.pk]))
    bob_client.post(reverse("item-reservation", args=[scarf.pk]))

    assert Item.objects.filter(pk=scarf.pk).values().get() == before
