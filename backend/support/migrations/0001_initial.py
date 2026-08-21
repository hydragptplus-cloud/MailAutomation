from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("common", "0008_organization_support_workspace_enabled"),
    ]

    operations = [
        migrations.CreateModel(
            name="SupportMailbox",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=150)),
                ("email", models.EmailField(max_length=254)),
                ("imap_host", models.CharField(max_length=255)),
                ("imap_port", models.PositiveIntegerField(default=993)),
                ("imap_encryption", models.CharField(choices=[("none", "None"), ("tls", "STARTTLS"), ("ssl", "SSL/TLS")], default="ssl", max_length=10)),
                ("imap_username", models.CharField(max_length=255)),
                ("encrypted_imap_password", models.TextField()),
                ("smtp_host", models.CharField(max_length=255)),
                ("smtp_port", models.PositiveIntegerField(default=465)),
                ("smtp_encryption", models.CharField(choices=[("none", "None"), ("tls", "STARTTLS"), ("ssl", "SSL/TLS")], default="ssl", max_length=10)),
                ("smtp_username", models.CharField(max_length=255)),
                ("encrypted_smtp_password", models.TextField(blank=True)),
                ("from_name", models.CharField(blank=True, default="Mail Flow Support", max_length=150)),
                ("is_active", models.BooleanField(default=True)),
                ("last_synced_at", models.DateTimeField(blank=True, null=True)),
                ("last_error", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="support_mailboxes_created", to=settings.AUTH_USER_MODEL)),
                ("organization", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="support_mailboxes", to="common.organization")),
            ],
            options={"ordering": ("name",)},
        ),
        migrations.CreateModel(
            name="SupportTicket",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("ticket_number", models.CharField(db_index=True, max_length=24, unique=True)),
                ("name", models.CharField(max_length=150)),
                ("email", models.EmailField(max_length=254)),
                ("subject", models.CharField(max_length=180)),
                ("status", models.CharField(choices=[("new", "New"), ("open", "Open"), ("waiting", "Waiting"), ("resolved", "Resolved"), ("closed", "Closed")], default="new", max_length=16)),
                ("priority", models.CharField(choices=[("normal", "Normal"), ("high", "High"), ("urgent", "Urgent")], default="normal", max_length=16)),
                ("source", models.CharField(default="public", max_length=32)),
                ("external_message_id", models.CharField(blank=True, db_index=True, max_length=255)),
                ("last_message_at", models.DateTimeField(auto_now_add=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("assigned_to", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="assigned_support_tickets", to=settings.AUTH_USER_MODEL)),
                ("mailbox", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="tickets", to="support.supportmailbox")),
                ("organization", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="support_tickets", to="common.organization")),
                ("requester", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="support_tickets", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ("-last_message_at", "-created_at")},
        ),
        migrations.CreateModel(
            name="SupportMessage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("direction", models.CharField(choices=[("inbound", "Inbound"), ("outbound", "Outbound"), ("internal", "Internal")], max_length=16)),
                ("sender_name", models.CharField(blank=True, max_length=150)),
                ("sender_email", models.EmailField(blank=True, max_length=254)),
                ("recipient_email", models.EmailField(blank=True, max_length=254)),
                ("subject", models.CharField(blank=True, max_length=180)),
                ("body", models.TextField()),
                ("external_message_id", models.CharField(blank=True, db_index=True, max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="support_messages_created", to=settings.AUTH_USER_MODEL)),
                ("ticket", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="messages", to="support.supportticket")),
            ],
            options={"ordering": ("created_at", "id")},
        ),
        migrations.AddConstraint(
            model_name="supportmailbox",
            constraint=models.UniqueConstraint(fields=("organization", "email"), name="unique_support_mailbox_per_org_email"),
        ),
    ]
