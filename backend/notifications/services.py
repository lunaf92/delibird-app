from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from notifications import push
from notifications.messages import Message, compose
from notifications.models import Notification, PushDevice
from sharing.models import ItemChange, Reservation, Share
from wishlists.models import Item


def deliver(recipient_email: str, user: User | None, message: Message) -> None:
    """Sends one message by email, and by push to every phone of `user`."""
    email = EmailMultiAlternatives(subject=message.subject, body=message.text, to=[recipient_email])
    email.attach_alternative(message.html, "text/html")
    email.send()
    if user is not None:
        push.send(
            [
                push.PushMessage(device, message.push_title, message.push_body, {"path": message.path})
                for device in PushDevice.objects.filter(user=user)
            ]
        )


def invite(share: Share, link: str) -> None:
    """Tells someone a list was shared with them, in their language if they have an account."""
    wishlist = share.wishlist
    owner = wishlist.owner
    user = User.objects.filter(email=share.invitee_email).first()
    language = user.language if user else owner.language
    payload = {
        "owner_name": owner.display_name or owner.email,
        "list_name": wishlist.name,
        "link": link,
        "path": "/shared/" + link.rsplit("/", 1)[-1],
    }
    deliver(share.invitee_email, user, compose("list_shared", payload, language))


def notify_buyers() -> int:
    """Turns recorded edits and deletions into notifications for whoever reserved those items.

    Several changes to one item since the last run become one notification, and a deletion wins over
    changes. Reservations of deleted items are removed once their buyer has been told.
    """
    created = 0
    with transaction.atomic():
        changes = list(
            ItemChange.objects.select_for_update(skip_locked=True).filter(notified_at__isnull=True)
        )
        latest: dict[int, ItemChange] = {}
        for change in changes:
            current = latest.get(change.item_id)
            if (
                current is None
                or change.kind == ItemChange.Kind.DELETED
                or current.kind != ItemChange.Kind.DELETED
            ):
                latest[change.item_id] = change
        for item_id, change in latest.items():
            deleted = change.kind == ItemChange.Kind.DELETED or not Item.objects.filter(pk=item_id).exists()
            for reservation in Reservation.objects.filter(item_id=item_id).select_related("buyer"):
                Notification.objects.create(
                    recipient=reservation.buyer,
                    kind=Notification.Kind.ITEM_DELETED if deleted else Notification.Kind.ITEM_CHANGED,
                    payload={
                        "owner_name": change.owner_name,
                        "list_name": change.wishlist_name,
                        "list_id": change.wishlist_id,
                        "item_name": change.item_name,
                    },
                )
                created += 1
            if deleted:
                Reservation.objects.filter(item_id=item_id).delete()
        ItemChange.objects.filter(pk__in=[c.pk for c in changes]).update(notified_at=timezone.now())
    return created


def send_pending() -> int:
    sent = 0
    for notification in Notification.objects.filter(sent_at__isnull=True).select_related("recipient"):
        recipient = notification.recipient
        message = compose(notification.kind, notification.payload, recipient.language)
        deliver(recipient.email, recipient, message)
        notification.sent_at = timezone.now()
        notification.save(update_fields=["sent_at"])
        sent += 1
    return sent


def remove_orphaned_reservations() -> int:
    """Reservations of items deleted without a record (for example with the owner's account)."""
    deleted, _ = Reservation.objects.exclude(item_id__in=Item.objects.values("pk")).delete()
    return deleted
