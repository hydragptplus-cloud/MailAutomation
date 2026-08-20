import django.core.validators
from django.db import migrations, models


def backfill_plan_discounts(apps, schema_editor):
    Plan = apps.get_model("billing", "Plan")
    for plan in Plan.objects.all():
        if plan.is_free:
            plan.original_price_bdt = 0
            plan.discount_percent = 0
            plan.price_bdt = 0
        else:
            plan.original_price_bdt = plan.price_bdt
            plan.discount_percent = 0
        plan.save()


def reverse_plan_discounts(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0008_reserve_active_invoice_organization_name"),
    ]

    operations = [
        migrations.AddField(
            model_name="plan",
            name="original_price_bdt",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="plan",
            name="discount_percent",
            field=models.PositiveIntegerField(
                default=0,
                validators=[
                    django.core.validators.MinValueValidator(0),
                    django.core.validators.MaxValueValidator(100),
                ],
            ),
        ),
        migrations.AlterField(
            model_name="plan",
            name="price_bdt",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.RunPython(backfill_plan_discounts, reverse_plan_discounts),
    ]
