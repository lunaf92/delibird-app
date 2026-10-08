from collections.abc import Iterable, Sequence

from django.db import transaction
from django.db.models import Max, QuerySet

from accounts.models import User
from wishlists.models import Item, ListEntry, Wishlist
from wishlists.signals import item_edited, item_removed


class WrongOrder(Exception):
    """The ids sent for a reorder are not exactly the ones being reordered."""


def next_position(queryset: QuerySet[Wishlist] | QuerySet[ListEntry]) -> int:
    highest = queryset.aggregate(highest=Max("position"))["highest"]
    return 0 if highest is None else highest + 1


def default_list(owner: User) -> Wishlist:
    return Wishlist.objects.get(owner=owner, is_default=True)


def create_wishlist(owner: User, name: str) -> Wishlist:
    return Wishlist.objects.create(
        owner=owner, name=name, position=next_position(Wishlist.objects.filter(owner=owner))
    )


def list_items(wishlist: Wishlist) -> QuerySet[Item]:
    """The items on one list, in that list's order."""
    return Item.objects.filter(entries__wishlist=wishlist).order_by("entries__position", "entries__id")


def put_on_list(item: Item, wishlist: Wishlist) -> bool:
    """Adds the item at the end of the list. Returns False if it was already there."""
    if ListEntry.objects.filter(wishlist=wishlist, item=item).exists():
        return False
    ListEntry.objects.create(wishlist=wishlist, item=item, position=next_position(wishlist.entries.all()))
    return True


@transaction.atomic
def add_item(owner: User, lists: Iterable[Wishlist] = (), **fields: object) -> Item:
    """Creates an item on its owner's default list and on `lists`."""
    item = Item.objects.create(owner=owner, **fields)
    put_on_list(item, default_list(owner))
    for wishlist in lists:
        put_on_list(item, wishlist)
    return item


@transaction.atomic
def take_off_list(item: Item, wishlist: Wishlist) -> None:
    """Removes the item from one list. Taking it off the default list deletes it everywhere."""
    if wishlist.is_default:
        delete_item(item)
        return
    item_removed.send(sender=Item, item=item, wishlist=wishlist)
    ListEntry.objects.filter(item=item, wishlist=wishlist).delete()


@transaction.atomic
def set_lists(item: Item, wishlists: Iterable[Wishlist]) -> None:
    """Puts the item on exactly these lists, plus the default list it is always on."""
    wanted = {w.pk: w for w in wishlists}
    for entry in item.entries.select_related("wishlist"):
        if entry.wishlist_id not in wanted and not entry.wishlist.is_default:
            take_off_list(item, entry.wishlist)
    put_on_list(item, default_list(item.owner))
    for wishlist in wanted.values():
        put_on_list(item, wishlist)


def delete_item(item: Item) -> None:
    item_edited.send(sender=Item, item=item, deleted=True)
    item.delete()


@transaction.atomic
def reorder_lists(owner: User, ids: Sequence[int]) -> None:
    rows = {row.pk: row for row in Wishlist.objects.select_for_update().filter(owner=owner)}
    if len(ids) != len(set(ids)) or set(ids) != set(rows):
        raise WrongOrder
    for position, pk in enumerate(ids):
        rows[pk].position = position
    Wishlist.objects.bulk_update(list(rows.values()), ["position"])


@transaction.atomic
def reorder_items(wishlist: Wishlist, item_ids: Sequence[int]) -> None:
    """Orders one list by item id; every item on the list must be named exactly once."""
    entries = {entry.item_id: entry for entry in wishlist.entries.select_for_update()}
    if len(item_ids) != len(set(item_ids)) or set(item_ids) != set(entries):
        raise WrongOrder
    for position, item_id in enumerate(item_ids):
        entries[item_id].position = position
    ListEntry.objects.bulk_update(list(entries.values()), ["position"])
