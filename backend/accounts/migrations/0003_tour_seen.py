from django.db import migrations, models
from django.db.backends.base.schema import BaseDatabaseSchemaEditor
from django.db.migrations.state import StateApps


def existing_accounts_have_seen_it(apps: StateApps, schema_editor: BaseDatabaseSchemaEditor) -> None:
    """People who signed up before the tour existed already know the app; they can still replay it."""
    apps.get_model("accounts", "User").objects.update(tour_seen=True)


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_look_settings"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="tour_seen",
            field=models.BooleanField(default=False, verbose_name="welcome tour seen"),
        ),
        migrations.RunPython(existing_accounts_have_seen_it, migrations.RunPython.noop),
    ]
