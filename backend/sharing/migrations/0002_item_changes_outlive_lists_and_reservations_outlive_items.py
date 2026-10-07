from django.db import migrations, models


def forget_unsent_changes(apps, schema_editor):
    """Changes recorded before this migration have no names to send; nothing has been sent from them yet."""
    apps.get_model("sharing", "ItemChange").objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ("sharing", "0001_initial"),
        ("wishlists", "0002_default_wishlists_for_existing_users"),
    ]

    operations = [
        migrations.RunPython(forget_unsent_changes, migrations.RunPython.noop),
        migrations.RemoveField(model_name="itemchange", name="wishlist"),
        migrations.AddField(
            model_name="itemchange",
            name="wishlist_id",
            field=models.PositiveBigIntegerField(default=0),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="itemchange",
            name="wishlist_name",
            field=models.CharField(default="", max_length=100),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="itemchange",
            name="owner_name",
            field=models.CharField(default="", max_length=254),
            preserve_default=False,
        ),
        migrations.AlterField(
            model_name="reservation",
            name="item",
            field=models.OneToOneField(
                db_constraint=False,
                on_delete=models.DO_NOTHING,
                related_name="+",
                to="wishlists.item",
            ),
        ),
    ]
