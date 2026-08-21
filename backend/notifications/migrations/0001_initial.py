# Generated manually for in-app notifications.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("platform_broadcasts", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Notification",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("type", models.CharField(choices=[("broadcast", "Broadcast"), ("billing", "Billing"), ("support", "Support"), ("system", "System")], default="system", max_length=20)),
                ("title", models.CharField(max_length=255)),
                ("body", models.TextField()),
                ("read_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("related_broadcast", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="notifications", to="platform_broadcasts.platformbroadcast")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="notifications", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ("-created_at",)},
        ),
        migrations.AddIndex(
            model_name="notification",
            index=models.Index(fields=["user", "read_at"], name="notificatio_user_id_47e85c_idx"),
        ),
        migrations.AddIndex(
            model_name="notification",
            index=models.Index(fields=["user", "type", "created_at"], name="notificatio_user_id_fbaa50_idx"),
        ),
        migrations.AddConstraint(
            model_name="notification",
            constraint=models.UniqueConstraint(condition=Q(("related_broadcast__isnull", False)), fields=("user", "related_broadcast"), name="unique_user_broadcast_notification"),
        ),
    ]
