from typing import Any

from django.dispatch import receiver

from sharing.models import ItemChange
from wishlists.models import Item, Wishlist
from wishlists.signals import item_edited, item_removed


def shared_lists(lists: Any) -> Any:
    # shares__isnull=False matters: without it, a list with no shares at all matches "not revoked".
    return (
        lists.filter(shares__isnull=False, shares__revoked_at__isnull=True).distinct().select_related("owner")
    )


def record(wishlist: Wishlist, item: Item, kind: str) -> None:
    ItemChange.objects.create(
        wishlist_id=wishlist.pk,
        wishlist_name=wishlist.name,
        owner_name=wishlist.owner.display_name or wishlist.owner.email,
        item_id=item.pk,
        item_name=item.name,
        kind=kind,
    )


@receiver(item_edited, sender=Item)
def record_item_change(sender: type[Item], item: Item, deleted: bool, **kwargs: Any) -> None:
    """Notes edits and deletions of items on shared lists, once per shared list the item is on.
    Reservations are not looked at here: the record is made whenever the item is on a shared list, so the
    owner's request does the same work whether or not anything is reserved."""
    kind = ItemChange.Kind.DELETED if deleted else ItemChange.Kind.CHANGED
    for wishlist in shared_lists(item.lists.all()):
        record(wishlist, item, kind)


@receiver(item_removed, sender=Item)
def record_item_removal(sender: type[Item], item: Item, wishlist: Wishlist, **kwargs: Any) -> None:
    for shared in shared_lists(Wishlist.objects.filter(pk=wishlist.pk)):
        record(shared, item, ItemChange.Kind.REMOVED)
