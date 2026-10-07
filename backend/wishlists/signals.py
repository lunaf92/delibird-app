from typing import Any

from django.conf import settings
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver
from django.utils import translation
from django.utils.translation import gettext as _

from accounts.models import User
from wishlists.models import Item, Wishlist


def default_list_name(language: str) -> str:
    with translation.override(language):
        return _("My wishlist")


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_default_wishlist(sender: type[User], instance: User, created: bool, **kwargs: Any) -> None:
    """Every account starts with one list, named in the account's language."""
    if created and not kwargs.get("raw"):
        Wishlist.objects.create(owner=instance, name=default_list_name(instance.language), is_default=True)


@receiver(post_delete, sender=Item)
def delete_item_image(sender: type[Item], instance: Item, **kwargs: Any) -> None:
    """Removes the image file too, including when a list or a whole account is deleted."""
    if instance.image:
        instance.image.delete(save=False)
