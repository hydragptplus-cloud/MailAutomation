from django.db import migrations


def seed_custom_plan(apps, schema_editor):
    Plan = apps.get_model("billing", "Plan")
    premium_plus = Plan.objects.filter(slug="premium-plus").first()
    defaults = {
        "name": "Custom",
        "original_price_bdt": 0,
        "discount_percent": 0,
        "price_bdt": 0,
        "email_limit": getattr(premium_plus, "email_limit", 150000),
        "daily_email_limit": 0,
        "weekly_email_limit": 0,
        "max_admins": getattr(premium_plus, "max_admins", 5),
        "max_users": getattr(premium_plus, "max_users", 50),
        "max_smtp_accounts": getattr(premium_plus, "max_smtp_accounts", 10),
        "max_recipients": getattr(premium_plus, "max_recipients", 10000),
        "max_campaigns_per_day": getattr(premium_plus, "max_campaigns_per_day", 10),
        "is_free": False,
        "is_active": True,
        "display_order": 5,
    }
    Plan.objects.update_or_create(slug="custom", defaults=defaults)


def unseed_custom_plan(apps, schema_editor):
    Plan = apps.get_model("billing", "Plan")
    Plan.objects.filter(slug="custom").delete()


class Migration(migrations.Migration):
    dependencies = [("billing", "0009_plan_discount_pricing")]
    operations = [migrations.RunPython(seed_custom_plan, unseed_custom_plan)]
