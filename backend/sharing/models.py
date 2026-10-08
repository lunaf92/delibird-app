from typing import ClassVar

from django.conf import settings
from django.db import models

from wishlists.models import Item, Wishlist


class Share(models.Model):
    """One invited person's access to one list, through their own link.

    The link token is stored only as a hash. The first signed-in person to accept the link (other than the
    owner) becomes `user`; from then on the list appears under their "Shared with me".
    """

    wishlist = models.ForeignKey(Wishlist, on_delete=models.CASCADE, related_name="shares")
    invitee_email = models.EmailField()
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name="shares"
    )
    token_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering: ClassVar[list[str]] = ["created_at", "id"]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(
                fields=["wishlist", "invitee_email"],
                condition=models.Q(revoked_at__isnull=True),
                name="one_active_share_per_invitee",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.wishlist} → {self.invitee_email}"


class Reservation(models.Model):
    """Someone is getting this item. Kept apart from Item, and with no reverse accessor on it, so nothing
    the owner sees is built from or changed by a reservation."""

    # No database constraint and nothing done on delete: deleting an item never touches reservations, so
    # the owner's request is the same with or without one. The notifications worker tells the buyer and
    # then removes reservations whose item is gone.
    item = models.OneToOneField(Item, on_delete=models.DO_NOTHING, db_constraint=False, related_name="+")
    buyer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Reservation {self.pk}"


class ItemChange(models.Model):
    """An item on a shared list was edited or deleted. Recorded for every shared list, reserved or not, so
    the owner's request takes the same path either way; the Notifications milestone tells buyers from here."""

    class Kind(models.TextChoices):
        CHANGED = "changed"
        DELETED = "deleted"
        REMOVED = "removed"  # Taken off this list; it may still be on others.

    # Plain copies, not foreign keys: the record has to outlive the item, its list and even the owner's
    # account until the worker has told the buyers.
    wishlist_id = models.PositiveBigIntegerField()
    wishlist_name = models.CharField(max_length=100)
    owner_name = models.CharField(max_length=254)
    item_id = models.PositiveBigIntegerField()
    item_name = models.CharField(max_length=200)
    kind = models.CharField(max_length=10, choices=Kind)
    created_at = models.DateTimeField(auto_now_add=True)
    notified_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.item_name} {self.kind}"
