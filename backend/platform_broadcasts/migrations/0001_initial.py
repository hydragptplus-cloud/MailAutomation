# Generated manually for platform broadcasts.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PlatformBroadcast",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("subject", models.CharField(max_length=255)),
                ("body", models.TextField()),
                ("target_roles", models.JSONField(blank=True, default=list)),
                ("target_plan_slugs", models.JSONField(blank=True, default=list)),
                ("target_organization_statuses", models.JSONField(blank=True, default=list)),
                ("active_only", models.BooleanField(default=True)),
                ("status", models.CharField(choices=[("draft", "Draft"), ("queued", "Queued"), ("sending", "Sending"), ("completed", "Completed"), ("failed", "Failed"), ("cancelled", "Cancelled")], default="draft", max_length=16)),
                ("total_count", models.PositiveIntegerField(default=0)),
                ("sent_count", models.PositiveIntegerField(default=0)),
                ("failed_count", models.PositiveIntegerField(default=0)),
                ("skipped_count", models.PositiveIntegerField(default=0)),
                ("queued_at", models.DateTimeField(blank=True, null=True)),
                ("started_at", models.DateTimeField(blank=True, null=True)),
                ("finished_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="platform_broadcasts_created", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ("-created_at",)},
        ),
        migrations.CreateModel(
            name="PlatformBroadcastDelivery",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("recipient_email", models.EmailField(max_length=254)),
                ("recipient_name", models.CharField(blank=True, max_length=150)),
                ("status", models.CharField(choices=[("pending", "Pending"), ("sending", "Sending"), ("sent", "Sent"), ("failed", "Failed"), ("skipped", "Skipped")], default="pending", max_length=16)),
                ("attempts", models.PositiveSmallIntegerField(default=0)),
                ("message", models.TextField(blank=True)),
                ("sent_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("broadcast", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="deliveries", to="platform_broadcasts.platformbroadcast")),
                ("user", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="platform_broadcast_deliveries", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ("-created_at",)},
        ),
        migrations.AddIndex(
            model_name="platformbroadcastdelivery",
            index=models.Index(fields=["broadcast", "status"], name="platform_br_broadca_b72ce1_idx"),
        ),
        migrations.AddConstraint(
            model_name="platformbroadcastdelivery",
            constraint=models.UniqueConstraint(condition=Q(("user__isnull", False)), fields=("broadcast", "user"), name="unique_platform_broadcast_user_delivery"),
        ),
    ]
