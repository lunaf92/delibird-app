import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
from django.db.models import Max


def move_items_onto_lists(apps, schema_editor):
    """Every item keeps its place on its current list, belongs to that list's owner, and is also put at the
    end of the owner's default list, where every item lives from now on."""
    Item = apps.get_model("wishlists", "Item")
    ListEntry = apps.get_model("wishlists", "ListEntry")
    Wishlist = apps.get_model("wishlists", "Wishlist")
    defaults = {w.owner_id: w for w in Wishlist.objects.filter(is_default=True)}
    for item in Item.objects.select_related("wishlist").order_by("wishlist_id", "position", "id"):
        item.owner_id = item.wishlist.owner_id
        item.save(update_fields=["owner"])
        ListEntry.objects.create(wishlist_id=item.wishlist_id, item=item, position=item.position)
    for item in Item.objects.select_related("wishlist").order_by("wishlist_id", "position", "id"):
        default = defaults.get(item.owner_id)
        if default is not None and default.pk != item.wishlist_id:
            highest = ListEntry.objects.filter(wishlist=default).aggregate(m=Max("position"))["m"]
            ListEntry.objects.create(wishlist=default, item=item, position=0 if highest is None else highest + 1)


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("wishlists", "0002_default_wishlists_for_existing_users"),
    ]

    operations = [
        migrations.CreateModel(
            name="ListEntry",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("position", models.PositiveIntegerField(default=0)),
                (
                    "item",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE, related_name="entries", to="wishlists.item"
                    ),
                ),
                (
                    "wishlist",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="entries",
                        to="wishlists.wishlist",
                    ),
                ),
            ],
            options={"ordering": ["position", "id"]},
        ),
        migrations.AddConstraint(
            model_name="listentry",
            constraint=models.UniqueConstraint(fields=("wishlist", "item"), name="one_entry_per_item_and_list"),
        ),
        migrations.AddField(
            model_name="item",
            name="owner",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="items",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(move_items_onto_lists, migrations.RunPython.noop),
        migrations.RemoveField(model_name="item", name="wishlist"),
        migrations.RemoveField(model_name="item", name="position"),
        migrations.AlterField(
            model_name="item",
            name="owner",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE, related_name="items", to=settings.AUTH_USER_MODEL
            ),
        ),
        migrations.AddField(
            model_name="item",
            name="lists",
            field=models.ManyToManyField(related_name="items", through="wishlists.ListEntry", to="wishlists.wishlist"),
        ),
        migrations.AlterModelOptions(name="item", options={"ordering": ["created_at", "id"]}),
    ]
