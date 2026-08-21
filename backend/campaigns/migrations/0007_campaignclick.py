from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("campaigns", "0006_campaign_organization_campaignlog_organization"),
    ]

    operations = [
        migrations.CreateModel(
            name="CampaignClick",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("destination_url", models.TextField()),
                ("ip_hash", models.CharField(blank=True, max_length=64)),
                ("user_agent", models.CharField(blank=True, max_length=500)),
                ("clicked_at", models.DateTimeField(auto_now_add=True)),
                ("campaign_log", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="clicks", to="campaigns.campaignlog")),
            ],
            options={
                "ordering": ["-clicked_at"],
                "indexes": [
                    models.Index(fields=["campaign_log", "clicked_at"], name="campaigns_c_campaig_7222c1_idx"),
                    models.Index(fields=["clicked_at"], name="campaigns_c_clicked_476e70_idx"),
                ],
            },
        ),
    ]
