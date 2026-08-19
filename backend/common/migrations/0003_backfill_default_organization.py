from django.db import migrations


def backfill_default_organization(apps, schema_editor):
    Organization = apps.get_model("common", "Organization")
    SystemSetting = apps.get_model("common", "SystemSetting")
    User = apps.get_model("users", "User")
    SMTPAccount = apps.get_model("smtp_manager", "SMTPAccount")
    RecipientList = apps.get_model("recipients", "RecipientList")
    Recipient = apps.get_model("recipients", "Recipient")
    EmailTemplate = apps.get_model("templates_app", "EmailTemplate")
    Campaign = apps.get_model("campaigns", "Campaign")
    CampaignLog = apps.get_model("campaigns", "CampaignLog")

    organization, _ = Organization.objects.get_or_create(
        name="Internal Organization",
        defaults={
            "max_users": 1000,
            "max_smtp_accounts": 1000,
            "max_recipients": 10000000,
            "daily_email_limit": 1000000,
            "monthly_email_limit": 30000000,
            "max_campaigns_per_day": 10000,
        },
    )
    User.objects.filter(organization__isnull=True).update(organization=organization)
    owner = User.objects.filter(is_superuser=True).order_by("date_joined", "id").first()
    if owner:
        owner.role = "owner"
        owner.is_staff = True
        owner.is_superuser = True
        owner.organization = None
        owner.save(update_fields=["role", "is_staff", "is_superuser", "organization"])
        organization.created_by_id = owner.id
        organization.save(update_fields=["created_by"])
    for model in (SMTPAccount, RecipientList, Recipient, EmailTemplate, Campaign, CampaignLog, SystemSetting):
        model.objects.filter(organization__isnull=True).update(organization=organization)


class Migration(migrations.Migration):
    dependencies = [
        ("common", "0002_organization_systemsetting_organization_and_more"),
        ("users", "0002_user_organization_alter_user_role_userloginsession"),
        ("smtp_manager", "0003_smtpaccount_organization_smtpaccount_sent_date"),
        ("recipients", "0005_recipient_organization_recipientlist_organization"),
        ("templates_app", "0003_emailtemplate_organization"),
        ("campaigns", "0006_campaign_organization_campaignlog_organization"),
    ]
    operations = [migrations.RunPython(backfill_default_organization, migrations.RunPython.noop)]
