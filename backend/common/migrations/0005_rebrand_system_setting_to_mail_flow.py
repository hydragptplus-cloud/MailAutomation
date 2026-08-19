from django.db import migrations, models


def rename_default_app_name(apps, schema_editor):
    SystemSetting = apps.get_model("common", "SystemSetting")
    SystemSetting.objects.filter(app_name="Mail Automation Engine").update(app_name="Mail Flow")


class Migration(migrations.Migration):
    dependencies = [
        ("common", "0004_organization_max_admins_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="systemsetting",
            name="app_name",
            field=models.CharField(default="Mail Flow", max_length=255),
        ),
        migrations.RunPython(rename_default_app_name, migrations.RunPython.noop),
    ]
