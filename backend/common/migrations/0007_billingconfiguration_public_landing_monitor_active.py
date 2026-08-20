from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("common", "0006_billingconfiguration"),
    ]

    operations = [
        migrations.AddField(
            model_name="billingconfiguration",
            name="public_landing_monitor_active",
            field=models.BooleanField(default=True),
        ),
    ]
