from django.db import migrations
from django.utils import translation
from django.utils.translation import gettext as _


def create_default_wishlists(apps, schema_editor):
    """Accounts created before lists existed get their default list, as new accounts do at sign-up."""
    User = apps.get_model("accounts", "User")
    Wishlist = apps.get_model("wishlists", "Wishlist")
    for user in User.objects.exclude(wishlists__is_default=True):
        with translation.override(user.language):
            Wishlist.objects.create(owner=user, name=_("My wishlist"), is_default=True)


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0001_initial"),
        ("wishlists", "0001_initial"),
    ]

    operations = [migrations.RunPython(create_default_wishlists, migrations.RunPython.noop)]
