from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("common", "0008_organization_support_workspace_enabled"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="systemsetting",
            name="open_tracking",
        ),
    ]
