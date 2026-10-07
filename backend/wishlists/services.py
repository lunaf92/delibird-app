from collections.abc import Sequence

from django.db import transaction
from django.db.models import Max, QuerySet

from accounts.models import User
from wishlists.models import Item, Wishlist


class WrongOrder(Exception):
    """The ids sent for a reorder are not exactly the ones being reordered."""


def next_position[M: (Wishlist, Item)](queryset: QuerySet[M]) -> int:
    highest = queryset.aggregate(highest=Max("position"))["highest"]
    return 0 if highest is None else highest + 1


def create_wishlist(owner: User, name: str) -> Wishlist:
    return Wishlist.objects.create(
        owner=owner, name=name, position=next_position(Wishlist.objects.filter(owner=owner))
    )


def add_item(wishlist: Wishlist, **fields: object) -> Item:
    return Item.objects.create(wishlist=wishlist, position=next_position(wishlist.items.all()), **fields)


def move_item(item: Item, target: Wishlist) -> None:
    """Moves an item to the end of another list."""
    if item.wishlist_id != target.pk:
        item.wishlist = target
        item.position = next_position(target.items.all())


@transaction.atomic
def reorder[M: (Wishlist, Item)](queryset: QuerySet[M], ids: Sequence[int]) -> None:
    """Puts every row of `queryset` in the order of `ids`, which must name each of them exactly once."""
    rows = {row.pk: row for row in queryset.select_for_update()}
    if len(ids) != len(set(ids)) or set(ids) != set(rows):
        raise WrongOrder
    for position, pk in enumerate(ids):
        rows[pk].position = position
    queryset.model._default_manager.bulk_update(list(rows.values()), ["position"])
