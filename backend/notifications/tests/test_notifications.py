from collections.abc import Callable
from datetime import timedelta
from typing import Any

import pytest
from django.core import mail
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from accounts.tests.helpers import html_of
from notifications import push
from notifications.models import Notification, PushDevice, PushTicket
from notifications.tasks import forget_sent, notify_buyers
from sharing.models import ItemChange, Reservation
from sharing.services import NewShare
from wishlists.models import Item, Wishlist
from wishlists.tests.helpers import add_item

pytestmark = pytest.mark.django_db

CaptureCallbacks = Callable[..., Any]


def share_with(client: APIClient, wishlist: Wishlist, email: str, capture: CaptureCallbacks) -> str:
    with capture(execute=True):
        response = client.post(reverse("list-shares", args=[wishlist.pk]), {"email": email}, format="json")
    assert response.status_code == 201
    return str(response.json()["link"])


def test_sharing_emails_the_invitee_their_link(
    client: APIClient, christmas: Wishlist, django_capture_on_commit_callbacks: CaptureCallbacks
) -> None:
    link = share_with(client, christmas, "newcomer@example.com", django_capture_on_commit_callbacks)

    [message] = mail.outbox
    assert message.to == ["newcomer@example.com"]
    assert message.subject == "Ann shared a wishlist with you: Christmas"
    assert link in message.body
    assert link in html_of(message)
    assert "Ann won't see it" in message.body


def test_the_invitation_is_in_the_invitees_language(
    client: APIClient, christmas: Wishlist, django_capture_on_commit_callbacks: CaptureCallbacks
) -> None:
    User.objects.create_user("carla@example.com", language="it")

    share_with(client, christmas, "carla@example.com", django_capture_on_commit_callbacks)

    assert mail.outbox[0].subject == "Ann ha condiviso con te una lista dei desideri: Christmas"


def test_invitees_without_an_account_get_the_owners_language(
    client: APIClient, ann: User, christmas: Wishlist, django_capture_on_commit_callbacks: CaptureCallbacks
) -> None:
    ann.language = "es"
    ann.save()

    share_with(client, christmas, "nuevo@example.com", django_capture_on_commit_callbacks)

    assert mail.outbox[0].subject == "Ann ha compartido contigo una lista de deseos: Christmas"


def test_invitees_with_phones_get_a_push_that_opens_the_link(
    client: APIClient,
    bob: User,
    christmas: Wishlist,
    pushes: list[dict[str, Any]],
    django_capture_on_commit_callbacks: CaptureCallbacks,
) -> None:
    PushDevice.objects.create(user=bob, token="ExponentPushToken[bob]", platform="android")

    link = share_with(client, christmas, "bob@example.com", django_capture_on_commit_callbacks)

    [message] = pushes
    assert message["to"] == "ExponentPushToken[bob]"
    assert message["body"] == "Ann shared “Christmas” with you."
    assert message["data"] == {"path": "/shared/" + link.rsplit("/", 1)[1]}
    assert PushTicket.objects.count() == 1


def reserve(client: APIClient, item: Item) -> None:
    assert client.post(reverse("item-reservation", args=[item.pk])).status_code == 204


def test_the_buyer_hears_when_their_item_changes(
    client: APIClient,
    scarf: Item,
    bob: User,
    bob_share: NewShare,
    bob_client: APIClient,
    pushes: list[dict[str, Any]],
) -> None:
    PushDevice.objects.create(user=bob, token="ExponentPushToken[bob]", platform="ios")
    reserve(bob_client, scarf)
    mail.outbox.clear()

    client.patch(reverse("item", args=[scarf.pk]), {"price": "45.00"}, format="json")
    client.patch(reverse("item", args=[scarf.pk]), {"name": "Green wool scarf"}, format="json")
    notify_buyers.apply()

    [message] = mail.outbox
    assert message.to == ["bob@example.com"]
    assert message.subject == "“Green wool scarf” changed"
    assert f"/shared-with-me/{bob_share.share.wishlist_id}" in message.body
    [notification] = pushes
    assert notification["data"] == {"path": f"/shared-with-me/{bob_share.share.wishlist_id}"}
    # Nothing is sent twice.
    notify_buyers.apply()
    assert len(mail.outbox) == 1


def test_the_buyer_hears_when_their_item_is_deleted(
    client: APIClient, scarf: Item, bob_share: NewShare, bob_client: APIClient
) -> None:
    reserve(bob_client, scarf)
    mail.outbox.clear()

    client.patch(reverse("item", args=[scarf.pk]), {"price": "45.00"}, format="json")
    client.delete(reverse("item", args=[scarf.pk]))
    notify_buyers.apply()

    [message] = mail.outbox
    assert message.subject == "“Wool scarf” was removed"
    assert "it's no longer reserved for you" in message.body
    assert not Reservation.objects.exists()


def test_deleting_a_shared_list_tells_buyers_of_every_item(
    client: APIClient, christmas: Wishlist, scarf: Item, bob_share: NewShare, bob_client: APIClient
) -> None:
    bike = add_item(christmas, name="Bike")
    reserve(bob_client, scarf)
    reserve(bob_client, bike)
    mail.outbox.clear()

    client.delete(reverse("list", args=[christmas.pk]))
    notify_buyers.apply()

    assert sorted(m.subject for m in mail.outbox) == ["“Bike” was removed", "“Wool scarf” was removed"]
    assert not Reservation.objects.exists()


def test_buyers_are_told_in_their_language(
    client: APIClient, scarf: Item, bob: User, bob_share: NewShare, bob_client: APIClient
) -> None:
    bob.language = "it"
    bob.save()
    reserve(bob_client, scarf)
    mail.outbox.clear()

    client.patch(reverse("item", args=[scarf.pk]), {"price": "45.00"}, format="json")
    notify_buyers.apply()

    assert mail.outbox[0].subject == "“Wool scarf” è cambiato"


def test_nobody_is_told_about_unreserved_or_unshared_items(
    client: APIClient, ann: User, scarf: Item, bob_share: NewShare
) -> None:
    unshared = add_item(ann.wishlists.get(is_default=True), name="Socks")
    mail.outbox.clear()

    client.patch(reverse("item", args=[scarf.pk]), {"price": "45.00"}, format="json")
    client.patch(reverse("item", args=[unshared.pk]), {"price": "5.00"}, format="json")
    notify_buyers.apply()

    assert mail.outbox == []
    assert not Notification.objects.exists()


def test_the_owner_never_gets_notifications(
    client: APIClient, scarf: Item, ann: User, bob_share: NewShare, bob_client: APIClient
) -> None:
    PushDevice.objects.create(user=ann, token="ExponentPushToken[ann]", platform="android")
    reserve(bob_client, scarf)
    mail.outbox.clear()

    client.patch(reverse("item", args=[scarf.pk]), {"price": "45.00"}, format="json")
    notify_buyers.apply()

    assert [m.to for m in mail.outbox] == [["bob@example.com"]]
    assert not Notification.objects.filter(recipient=ann).exists()


def test_reservations_of_a_deleted_account_are_cleared(
    client: APIClient, scarf: Item, bob_share: NewShare, bob_client: APIClient
) -> None:
    reserve(bob_client, scarf)

    client.delete(reverse("me"))
    notify_buyers.apply()

    assert not Reservation.objects.exists()


def test_registering_a_phone(client: APIClient, ann: User) -> None:
    body = {"token": "ExponentPushToken[abc123]", "platform": "android"}

    assert client.post(reverse("devices"), body, format="json").status_code == 204
    assert client.post(reverse("devices"), body, format="json").status_code == 204

    assert list(PushDevice.objects.values_list("user__email", "platform")) == [("ann@example.com", "android")]


@pytest.mark.parametrize(
    "body",
    [{"token": "nonsense", "platform": "android"}, {"token": "ExponentPushToken[x]", "platform": "nokia"}],
)
def test_invalid_devices_are_refused(client: APIClient, ann: User, body: dict[str, str]) -> None:
    assert client.post(reverse("devices"), body, format="json").status_code == 400


def test_a_phone_belongs_to_whoever_registered_it_last(
    client: APIClient, ann: User, bob_client: APIClient
) -> None:
    body = {"token": "ExponentPushToken[shared-phone]", "platform": "ios"}
    client.post(reverse("devices"), body, format="json")

    bob_client.post(reverse("devices"), body, format="json")

    assert PushDevice.objects.get().user.email == "bob@example.com"


def test_removing_a_phone_only_removes_your_own(
    client: APIClient, ann: User, bob: User, bob_client: APIClient
) -> None:
    PushDevice.objects.create(user=bob, token="ExponentPushToken[bob]", platform="ios")

    client.delete(reverse("devices"), {"token": "ExponentPushToken[bob]"}, format="json")
    assert PushDevice.objects.count() == 1
    bob_client.delete(reverse("devices"), {"token": "ExponentPushToken[bob]"}, format="json")
    assert PushDevice.objects.count() == 0


def test_devices_expo_no_longer_knows_are_removed(ann: User, monkeypatch: pytest.MonkeyPatch) -> None:
    gone = PushDevice.objects.create(user=ann, token="ExponentPushToken[gone]", platform="android")
    kept = PushDevice.objects.create(user=ann, token="ExponentPushToken[kept]", platform="android")
    monkeypatch.setattr(
        push,
        "post_json",
        lambda url, payload: {
            "data": [
                {"status": "error", "details": {"error": "DeviceNotRegistered"}},
                {"status": "ok", "id": "t1"},
            ]
        },
    )

    push.send([push.PushMessage(gone, "t", "b", {}), push.PushMessage(kept, "t", "b", {})])

    assert list(PushDevice.objects.all()) == [kept]


def test_receipts_remove_devices_that_are_gone(ann: User, monkeypatch: pytest.MonkeyPatch) -> None:
    device = PushDevice.objects.create(user=ann, token="ExponentPushToken[gone]", platform="android")
    PushTicket.objects.create(device=device, ticket_id="t1")
    monkeypatch.setattr(
        push,
        "post_json",
        lambda url, payload: {
            "data": {"t1": {"status": "error", "details": {"error": "DeviceNotRegistered"}}}
        },
    )

    push.check_receipts(older_than=__import__("datetime").timedelta(0))

    assert not PushDevice.objects.exists()
    assert not PushTicket.objects.exists()


def test_push_can_be_switched_off(ann: User, settings: Any, pushes: list[dict[str, Any]]) -> None:
    settings.PUSH_ENABLED = False
    device = PushDevice.objects.create(user=ann, token="ExponentPushToken[x]", platform="android")

    push.send([push.PushMessage(device, "t", "b", {})])

    assert pushes == []


def test_an_unreachable_push_service_does_not_stop_email(
    client: APIClient,
    scarf: Item,
    bob: User,
    bob_share: NewShare,
    bob_client: APIClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    PushDevice.objects.create(user=bob, token="ExponentPushToken[bob]", platform="ios")
    reserve(bob_client, scarf)
    mail.outbox.clear()

    def offline(url: str, payload: Any) -> Any:
        raise OSError("offline")

    monkeypatch.setattr(push, "post_json", offline)
    client.patch(reverse("item", args=[scarf.pk]), {"price": "45.00"}, format="json")
    notify_buyers.apply()

    assert len(mail.outbox) == 1


def test_sent_notifications_and_their_changes_are_forgotten_a_day_later(
    client: APIClient, scarf: Item, bob_share: NewShare, bob_client: APIClient
) -> None:
    reserve(bob_client, scarf)
    client.patch(reverse("item", args=[scarf.pk]), {"price": "45.00"}, format="json")
    notify_buyers.apply()
    assert ItemChange.objects.exists()
    assert Notification.objects.exists()

    forget_sent.apply()
    assert ItemChange.objects.exists()
    assert Notification.objects.exists()

    a_day_ago = timezone.now() - timedelta(days=1, minutes=1)
    ItemChange.objects.update(notified_at=a_day_ago)
    Notification.objects.update(sent_at=a_day_ago)
    client.patch(reverse("item", args=[scarf.pk]), {"price": "50.00"}, format="json")
    forget_sent.apply()

    # Only the new, not yet sent change is left.
    assert list(ItemChange.objects.values_list("notified_at", flat=True)) == [None]
    assert not Notification.objects.exists()
