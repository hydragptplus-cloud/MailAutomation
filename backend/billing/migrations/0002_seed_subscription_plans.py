from django.db import migrations


PLANS = (
    {
        "slug": "free", "name": "Free", "price_bdt": 0, "email_limit": 50,
        "daily_email_limit": 0, "weekly_email_limit": 0, "max_admins": 1,
        "max_users": 1, "max_smtp_accounts": 1, "is_free": True, "display_order": 1,
    },
    {
        "slug": "basic", "name": "Basic", "price_bdt": 1700, "email_limit": 30000,
        "daily_email_limit": 1000, "weekly_email_limit": 0, "max_admins": 1,
        "max_users": 5, "max_smtp_accounts": 2, "is_free": False, "display_order": 2,
    },
    {
        "slug": "premium", "name": "Premium", "price_bdt": 2500, "email_limit": 60000,
        "daily_email_limit": 0, "weekly_email_limit": 15000, "max_admins": 2,
        "max_users": 10, "max_smtp_accounts": 5, "is_free": False, "display_order": 3,
    },
    {
        "slug": "premium-plus", "name": "Premium+", "price_bdt": 4000, "email_limit": 150000,
        "daily_email_limit": 0, "weekly_email_limit": 37500, "max_admins": 5,
        "max_users": 50, "max_smtp_accounts": 10, "is_free": False, "display_order": 4,
    },
)


def seed_plans(apps, schema_editor):
    Plan = apps.get_model("billing", "Plan")
    for plan in PLANS:
        Plan.objects.update_or_create(slug=plan["slug"], defaults=plan)


def unseed_plans(apps, schema_editor):
    apps.get_model("billing", "Plan").objects.filter(slug__in=[p["slug"] for p in PLANS]).delete()


class Migration(migrations.Migration):
    dependencies = [("billing", "0001_initial")]
    operations = [migrations.RunPython(seed_plans, unseed_plans)]
