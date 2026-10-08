import uuid
from typing import ClassVar

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator, RegexValidator
from django.db import models
from django.utils.translation import gettext_lazy as _


class Wishlist(models.Model):
    """A list of things someone would like. Every account has one default list, created at sign-up."""

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="wishlists")
    name = models.CharField(_("name"), max_length=100)
    is_default = models.BooleanField(default=False)
    position = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering: ClassVar[list[str]] = ["position", "id"]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(
                fields=["owner"], condition=models.Q(is_default=True), name="one_default_wishlist_per_owner"
            ),
        ]

    def __str__(self) -> str:
        return self.name


def item_image_path(item: "Item", filename: str) -> str:
    # A random name, so the path says nothing about the owner or the original file.
    return f"items/{uuid.uuid4().hex}.jpg"


class Item(models.Model):
    """One wish, owned by one person. It is always on its owner's default list and can be on any number of
    their other lists too; editing it changes it everywhere. Only the name is required."""

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="items")
    lists = models.ManyToManyField(Wishlist, through="ListEntry", related_name="items")
    name = models.CharField(_("name"), max_length=200)
    url = models.URLField(_("link"), max_length=2000, blank=True)
    description = models.TextField(_("description"), max_length=2000, blank=True)
    rating = models.PositiveSmallIntegerField(
        _("rating"), null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    image = models.ImageField(_("image"), upload_to=item_image_path, blank=True)
    price = models.DecimalField(
        _("price"), max_digits=10, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)]
    )
    currency = models.CharField(
        _("currency"),
        max_length=3,
        default="EUR",
        validators=[RegexValidator(r"^[A-Z]{3}$", _("Use a three-letter currency code, such as EUR."))],
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering: ClassVar[list[str]] = ["created_at", "id"]

    def __str__(self) -> str:
        return self.name


class ListEntry(models.Model):
    """An item's place on one list. Each list orders its items independently."""

    wishlist = models.ForeignKey(Wishlist, on_delete=models.CASCADE, related_name="entries")
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name="entries")
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering: ClassVar[list[str]] = ["position", "id"]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(fields=["wishlist", "item"], name="one_entry_per_item_and_list"),
        ]

    def __str__(self) -> str:
        return f"{self.item} on {self.wishlist}"
