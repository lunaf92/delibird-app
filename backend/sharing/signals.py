from typing import Any

from django.dispatch import receiver

from sharing.models import ItemChange, Share
from wishlists.models import Item
from wishlists.signals import item_edited


@receiver(item_edited, sender=Item)
def record_item_change(sender: type[Item], item: Item, deleted: bool, **kwargs: Any) -> None:
    """Notes edits and deletions on shared lists. Reservations are not looked at here: the record is made
    for every shared list, so the owner's request does the same work whether or not anything is reserved."""
    if Share.objects.filter(wishlist_id=item.wishlist_id, revoked_at__isnull=True).exists():
        wishlist = item.wishlist
        ItemChange.objects.create(
            wishlist_id=wishlist.pk,
            wishlist_name=wishlist.name,
            owner_name=wishlist.owner.display_name or wishlist.owner.email,
            item_id=item.pk,
            item_name=item.name,
            kind=ItemChange.Kind.DELETED if deleted else ItemChange.Kind.CHANGED,
        )
