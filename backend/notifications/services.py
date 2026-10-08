from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from notifications import push
from notifications.messages import Message, compose
from notifications.models import Notification, PushDevice
from sharing.models import ItemChange, Reservation, Share
from sharing.services import viewable_lists
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
    """Turns recorded edits, deletions and removals into notifications for whoever reserved those items.

    Several changes to one item since the last run become one message per buyer. A buyer whose item was
    deleted, or who can no longer see it on any list shared with them, is told it was removed and the
    reservation is released; otherwise a buyer is told it changed. The link points at a list the buyer can
    still open.
    """
    created = 0
    with transaction.atomic():
        changes = list(
            ItemChange.objects.select_for_update(skip_locked=True).filter(notified_at__isnull=True)
        )
        by_item: dict[int, list[ItemChange]] = {}
        for change in changes:
            by_item.setdefault(change.item_id, []).append(change)
        for item_id, item_changes in by_item.items():
            kinds = {c.kind for c in item_changes}
            deleted = ItemChange.Kind.DELETED in kinds or not Item.objects.filter(pk=item_id).exists()
            latest = item_changes[-1]
            for reservation in Reservation.objects.filter(item_id=item_id).select_related("buyer"):
                buyer = reservation.buyer
                visible = [] if deleted else list(viewable_lists(buyer).filter(entries__item_id=item_id))
                if deleted or not visible:
                    kind = Notification.Kind.ITEM_DELETED
                    list_id, list_name = latest.wishlist_id, latest.wishlist_name
                    reservation.delete()
                elif ItemChange.Kind.CHANGED in kinds:
                    kind = Notification.Kind.ITEM_CHANGED
                    shown = next((c for c in item_changes if c.wishlist_id in {w.pk for w in visible}), None)
                    list_id = visible[0].pk
                    list_name = shown.wishlist_name if shown else visible[0].name
                else:
                    continue  # Taken off one list, but still on another this buyer can see.
                Notification.objects.create(
                    recipient=buyer,
                    kind=kind,
                    payload={
                        "owner_name": latest.owner_name,
                        "list_name": list_name,
                        "list_id": list_id,
                        "item_name": latest.item_name,
                    },
                )
                created += 1
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
