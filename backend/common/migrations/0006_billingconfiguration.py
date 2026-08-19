from decimal import Decimal

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("common", "0005_rebrand_system_setting_to_mail_flow"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="BillingConfiguration",
            fields=[
                ("id", models.PositiveSmallIntegerField(default=1, editable=False, primary_key=True, serialize=False)),
                ("usdt_bdt_rate", models.DecimalField(decimal_places=4, default=Decimal("122.0000"), max_digits=12)),
                ("payment_evm_wallet", models.CharField(max_length=128)),
                ("payment_tron_wallet", models.CharField(max_length=128)),
                ("payment_ton_wallet", models.CharField(max_length=128)),
                ("encrypted_tron_api_key", models.TextField(blank=True)),
                ("encrypted_toncenter_api_key", models.TextField(blank=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="billing_configuration_updates", to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
