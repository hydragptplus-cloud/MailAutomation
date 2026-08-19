from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("billing", "0003_recoverable_invoice_flow")]

    operations = [
        migrations.AddField(
            model_name="plan",
            name="max_recipients",
            field=models.PositiveIntegerField(default=10000),
        ),
        migrations.AddField(
            model_name="plan",
            name="max_campaigns_per_day",
            field=models.PositiveIntegerField(default=10),
        ),
    ]
