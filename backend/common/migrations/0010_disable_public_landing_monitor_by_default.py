from django.db import migrations, models


def disable_existing_public_monitor(apps, schema_editor):
    BillingConfiguration = apps.get_model("common", "BillingConfiguration")
    BillingConfiguration.objects.update(public_landing_monitor_active=False)


class Migration(migrations.Migration):
    dependencies = [
        ("common", "0009_remove_systemsetting_open_tracking"),
    ]

    operations = [
        migrations.AlterField(
            model_name="billingconfiguration",
            name="public_landing_monitor_active",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(disable_existing_public_monitor, migrations.RunPython.noop),
    ]
