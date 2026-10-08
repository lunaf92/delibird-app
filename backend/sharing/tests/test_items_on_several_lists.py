import pytest
from django.core import mail
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import User
from accounts.tests.helpers import sign_in_as
from notifications.tasks import notify_buyers
from sharing.models import Reservation
from sharing.services import NewShare, join, share_list
from wishlists.models import Item, Wishlist
from wishlists.services import create_wishlist, put_on_list
from wishlists.tests.helpers import add_item

pytestmark = pytest.mark.django_db


@pytest.fixture
def birthday(ann: User) -> Wishlist:
    return create_wishlist(ann, "Birthday")


@pytest.fixture
def carol(birthday: Wishlist) -> APIClient:
    """Carol can see the Birthday list only."""
    user = User.objects.create_user("carol@example.com", display_name="Carol")
    join(share_list(birthday, "carol@example.com").share, user)
    client = APIClient()
    sign_in_as(client, user)
    return client


def viewer_items(client: APIClient, wishlist: Wishlist) -> dict[str, object]:
    response = client.get(reverse("shared-with-me-list", args=[wishlist.pk]))
    return {item["name"]: item["reservation"] for item in response.json()["items"]}


def test_a_reservation_shows_on_every_shared_list_with_the_item(
    christmas: Wishlist,
    birthday: Wishlist,
    scarf: Item,
    bob_share: NewShare,
    bob_client: APIClient,
    carol: APIClient,
) -> None:
    put_on_list(scarf, birthday)

    bob_client.post(reverse("item-reservation", args=[scarf.pk]))

    assert viewer_items(bob_client, christmas)["Wool scarf"] == {"status": "mine", "by": None}
    assert viewer_items(carol, birthday)["Wool scarf"] == {"status": "taken", "by": "Bob"}
    assert carol.post(reverse("item-reservation", args=[scarf.pk])).status_code == 409


def test_viewers_only_see_items_on_lists_shared_with_them(
    ann: User,
    christmas: Wishlist,
    birthday: Wishlist,
    scarf: Item,
    bob_share: NewShare,
    bob_client: APIClient,
) -> None:
    cake = add_item(birthday, name="Cake")
    socks = add_item(ann.wishlists.get(is_default=True), name="Socks")

    assert list(viewer_items(bob_client, christmas)) == ["Wool scarf"]
    assert (
        APIClient().get(reverse("shared", args=[bob_share.token])).json()["items"][0]["name"] == "Wool scarf"
    )
    for item in (cake, socks):
        assert bob_client.post(reverse("item-reservation", args=[item.pk])).status_code == 404


def test_a_buyer_who_can_no_longer_see_the_item_is_told_and_released(
    client: APIClient, christmas: Wishlist, scarf: Item, bob_share: NewShare, bob_client: APIClient
) -> None:
    bob_client.post(reverse("item-reservation", args=[scarf.pk]))
    mail.outbox.clear()

    client.delete(reverse("list-item", args=[christmas.pk, scarf.pk]))
    notify_buyers.apply()

    [message] = mail.outbox
    assert message.to == ["bob@example.com"]
    assert message.subject == "“Wool scarf” was removed"
    assert not Reservation.objects.exists()
    assert Item.objects.filter(pk=scarf.pk).exists()  # Still on the owner's default list.


def test_a_buyer_who_still_sees_the_item_elsewhere_is_not_bothered(
    client: APIClient,
    ann: User,
    christmas: Wishlist,
    birthday: Wishlist,
    scarf: Item,
    bob_share: NewShare,
    bob_client: APIClient,
) -> None:
    put_on_list(scarf, birthday)
    join(share_list(birthday, "bob@example.com").share, User.objects.get(email="bob@example.com"))
    bob_client.post(reverse("item-reservation", args=[scarf.pk]))
    mail.outbox.clear()

    client.delete(reverse("list-item", args=[christmas.pk, scarf.pk]))
    notify_buyers.apply()

    assert mail.outbox == []
    assert Reservation.objects.count() == 1


def test_deleting_a_shared_list_releases_buyers_who_lose_sight_of_items(
    client: APIClient, christmas: Wishlist, scarf: Item, bob_share: NewShare, bob_client: APIClient
) -> None:
    bob_client.post(reverse("item-reservation", args=[scarf.pk]))
    mail.outbox.clear()

    client.delete(reverse("list", args=[christmas.pk]))
    notify_buyers.apply()

    assert [m.subject for m in mail.outbox] == ["“Wool scarf” was removed"]
    assert not Reservation.objects.exists()


def test_an_item_on_two_shared_lists_changes_once_for_its_buyer(
    client: APIClient,
    christmas: Wishlist,
    birthday: Wishlist,
    scarf: Item,
    bob_share: NewShare,
    bob_client: APIClient,
    carol: APIClient,
) -> None:
    put_on_list(scarf, birthday)
    carol.post(reverse("item-reservation", args=[scarf.pk]))
    mail.outbox.clear()

    client.patch(reverse("item", args=[scarf.pk]), {"price": "45.00"}, format="json")
    notify_buyers.apply()

    [message] = mail.outbox
    assert message.to == ["carol@example.com"]
    assert message.subject == "“Wool scarf” changed"
    # The link opens the list Carol can see.
    assert f"/shared-with-me/{birthday.pk}" in message.body
