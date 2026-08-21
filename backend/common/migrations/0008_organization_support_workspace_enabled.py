from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("common", "0007_billingconfiguration_public_landing_monitor_active"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="support_workspace_enabled",
            field=models.BooleanField(default=False),
        ),
    ]
