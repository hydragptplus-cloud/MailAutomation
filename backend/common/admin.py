from django.contrib import admin
from django import forms
from django.core.exceptions import ObjectDoesNotExist
from .models import BillingConfiguration, Organization, OrganizationUsage, SystemSetting


class OrganizationAdminForm(forms.ModelForm):
    plan = forms.ModelChoiceField(queryset=None, required=True)

    class Meta:
        model = Organization
        fields = ("name", "status")

    def __init__(self, *args, **kwargs):
        from billing.models import Plan

        super().__init__(*args, **kwargs)
        current_plan_id = None
        if self.instance and self.instance.pk:
            try:
                current_plan_id = self.instance.subscription.plan_id
            except ObjectDoesNotExist:
                pass
        self.fields["plan"].queryset = Plan.objects.filter(is_active=True) | Plan.objects.filter(pk=current_plan_id)
        self.fields["plan"].initial = current_plan_id


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    form = OrganizationAdminForm
    fields = ("name", "status", "plan")
    list_display = ("name", "plan_name", "status", "max_users", "max_smtp_accounts", "max_recipients", "monthly_email_limit")
    list_filter = ("status", "subscription__plan")
    search_fields = ("name",)

    @admin.display(description="Plan")
    def plan_name(self, obj):
        try:
            return obj.subscription.plan.name
        except ObjectDoesNotExist:
            return "No plan"

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        from billing.services import assign_plan_to_organization

        assign_plan_to_organization(obj, form.cleaned_data["plan"], activate_organization=not change)


admin.site.register(OrganizationUsage)
admin.site.register(SystemSetting)
admin.site.register(BillingConfiguration)
