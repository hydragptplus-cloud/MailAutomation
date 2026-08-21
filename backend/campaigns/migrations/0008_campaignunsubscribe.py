from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("campaigns", "0007_campaignclick"),
    ]

    operations = [
        migrations.CreateModel(
            name="CampaignUnsubscribe",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("recipient_email", models.EmailField(max_length=254)),
                ("affected_recipients", models.PositiveIntegerField(default=0)),
                ("ip_hash", models.CharField(blank=True, max_length=64)),
                ("user_agent", models.CharField(blank=True, max_length=500)),
                ("unsubscribed_at", models.DateTimeField(auto_now_add=True)),
                ("campaign_log", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="unsubscribe", to="campaigns.campaignlog")),
            ],
            options={"ordering": ["-unsubscribed_at"]},
        ),
    ]
