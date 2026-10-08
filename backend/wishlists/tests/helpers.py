from wishlists.models import Item, Wishlist
from wishlists.services import add_item as create_item


def add_item(wishlist: Wishlist, **fields: object) -> Item:
    """Creates an item on `wishlist` (and, as always, on its owner's default list)."""
    return create_item(wishlist.owner, [wishlist], **fields)
