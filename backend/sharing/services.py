import secrets
from dataclasses import dataclass

from django.db import IntegrityError, transaction
from django.db.models import QuerySet
from django.utils import timezone

from accounts.models import User, normalize_email
from accounts.services import hash_token
from sharing.models import Reservation, Share
from wishlists.models import Item, Wishlist


class AlreadyShared(Exception):
    pass


class OwnList(Exception):
    pass


class AcceptedByOther(Exception):
    pass


class NotViewable(Exception):
    """The person can't see this list or item as a viewer. Callers answer exactly as for a missing item."""


class Taken(Exception):
    pass


@dataclass
class NewShare:
    share: Share
    token: str


def active_shares() -> QuerySet[Share]:
    return Share.objects.filter(revoked_at__isnull=True)


def share_list(wishlist: Wishlist, email: str) -> NewShare:
    email = normalize_email(email)
    token = secrets.token_urlsafe(32)
    try:
        with transaction.atomic():
            share = Share.objects.create(wishlist=wishlist, invitee_email=email, token_hash=hash_token(token))
    except IntegrityError as error:
        raise AlreadyShared from error
    return NewShare(share, token)


def revoke(share: Share) -> None:
    share.revoked_at = timezone.now()
    share.save(update_fields=["revoked_at"])


def share_for_token(token: str) -> Share | None:
    return active_shares().select_related("wishlist__owner").filter(token_hash=hash_token(token)).first()


def join(share: Share, user: User) -> None:
    """The first signed-in person to accept a link becomes its viewer."""
    if share.wishlist.owner_id == user.pk:
        raise OwnList
    with transaction.atomic():
        share = Share.objects.select_for_update().get(pk=share.pk)
        if share.user_id is None:
            share.user = user
            share.save(update_fields=["user"])
        elif share.user_id != user.pk:
            raise AcceptedByOther


def viewable_lists(user: User) -> QuerySet[Wishlist]:
    """Lists shared with `user` that they accepted, newest share last."""
    return (
        Wishlist.objects.filter(shares__user=user, shares__revoked_at__isnull=True)
        .exclude(owner=user)
        .distinct()
    )


def viewable_item(user: User, item_id: int) -> Item:
    item = Item.objects.filter(pk=item_id, wishlist__in=viewable_lists(user)).first()
    if item is None:
        raise NotViewable
    return item


def reserve(user: User, item_id: int) -> Reservation:
    item = viewable_item(user, item_id)
    with transaction.atomic():
        existing = Reservation.objects.select_for_update().filter(item=item).first()
        if existing is not None:
            if existing.buyer_id != user.pk:
                raise Taken
            return existing
        try:
            with transaction.atomic():
                return Reservation.objects.create(item=item, buyer=user)
        except IntegrityError as error:  # Someone reserved it a moment earlier.
            raise Taken from error


def cancel(user: User, item_id: int) -> None:
    item = viewable_item(user, item_id)
    deleted, _ = Reservation.objects.filter(item=item, buyer=user).delete()
    if not deleted:
        raise NotViewable
