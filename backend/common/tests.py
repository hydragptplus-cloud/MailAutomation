import csv
import io
import ssl
from datetime import timedelta
from unittest.mock import MagicMock, patch
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from openpyxl import load_workbook
from rest_framework.test import APIClient
from campaigns.models import Campaign, CampaignLog
from campaigns.tasks import send_campaign_email
from common.models import BillingConfiguration, Organization, OrganizationUsage
from email_engine.sender import _connection, send_log_email
from recipients.exporter import export_csv
from recipients.models import Recipient, RecipientList
from reports.exporter import export_excel
from smtp_manager.models import SMTPAccount
from templates_app.models import EmailTemplate

User = get_user_model()


class SaaSSecurityTests(TestCase):
    def setUp(self):
        self.org_a = Organization.objects.create(name="Tenant A", max_users=1, max_smtp_accounts=1, max_recipients=2, daily_email_limit=2, monthly_email_limit=3)
        self.org_b = Organization.objects.create(name="Tenant B")
        self.owner = User.objects.create_user(username="owner", email="owner@example.com", password="StrongPass!234", role="owner", is_staff=True, is_superuser=True)
        self.admin = User.objects.create_user(username="admin-a", email="admin-a@example.com", password="StrongPass!234", role="admin", organization=self.org_a)
        self.other_admin = User.objects.create_user(username="admin-b", email="admin-b@example.com", password="StrongPass!234", role="admin", organization=self.org_b)
        self.client = APIClient()

    def authenticate(self, user):
        self.client.force_authenticate(user)

    def test_owner_creates_organization_and_first_admin(self):
        self.authenticate(self.owner)
        response = self.client.post(
            "/api/organizations/",
            {"name": "New Customer", "plan_slug": "basic", "max_users": 999},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        organization = Organization.objects.get(pk=response.data["id"])
        self.assertEqual(organization.subscription.plan.slug, "basic")
        self.assertEqual(organization.max_users, 5)
        self.assertEqual(organization.max_recipients, organization.subscription.plan.max_recipients)
        response = self.client.post(
            f"/api/organizations/{response.data['id']}/create-admin/",
            {"username": "new-admin", "name": "New Admin", "email": "new@example.com", "password": "StrongPass!234"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["role"], "admin")

    def test_only_owner_can_update_encrypted_billing_configuration(self):
        self.authenticate(self.owner)
        response = self.client.patch("/api/platform/billing-configuration/", {
            "usdt_bdt_rate": "125.5000",
            "payment_evm_wallet": "0x1111111111111111111111111111111111111111",
            "payment_tron_wallet": "TUpdatedReceivingWallet",
            "payment_ton_wallet": "UQUpdatedReceivingWallet",
            "tron_api_key": "tron-secret-value",
            "toncenter_api_key": "ton-secret-value",
        }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["tron_api_key_configured"])
        self.assertTrue(response.data["toncenter_api_key_configured"])
        self.assertNotIn("tron_api_key", response.data)
        self.assertNotIn("toncenter_api_key", response.data)
        config = BillingConfiguration.objects.get(pk=1)
        self.assertNotIn("tron-secret-value", config.encrypted_tron_api_key)
        self.assertEqual(config.updated_by, self.owner)

        self.authenticate(self.admin)
        forbidden = self.client.patch(
            "/api/platform/billing-configuration/", {"usdt_bdt_rate": "1.0000"}, format="json"
        )
        self.assertEqual(forbidden.status_code, 403)

    def test_only_owner_can_manage_public_pricing_plans(self):
        self.authenticate(self.owner)
        plans = self.client.get("/api/billing/platform/plans/")
        self.assertEqual(plans.status_code, 200)
        premium = next(plan for plan in plans.data["results"] if plan["slug"] == "premium")
        updated = self.client.patch(
            f"/api/billing/platform/plans/{premium['id']}/",
            {"price_bdt": 4999, "email_limit": 75000, "max_recipients": 80000, "display_order": 9},
            format="json",
        )
        self.assertEqual(updated.status_code, 200, updated.data)
        public = self.client.get("/api/billing/plans/")
        public_premium = next(plan for plan in public.data if plan["slug"] == "premium")
        self.assertEqual(public_premium["price_bdt"], 4999)
        self.assertEqual(public_premium["email_limit"], 75000)

        organization = Organization.objects.create(name="Premium Customer")
        from billing.models import Plan, Subscription
        from billing.services import apply_plan_to_organization
        premium_model = Plan.objects.get(pk=premium["id"])
        apply_plan_to_organization(organization, premium_model)
        now = timezone.now()
        Subscription.objects.create(
            organization=organization, plan=premium_model,
            current_period_start=now, current_period_end=now + timedelta(days=30),
        )
        propagated = self.client.patch(
            f"/api/billing/platform/plans/{premium['id']}/", {"max_recipients": 90000}, format="json"
        )
        self.assertEqual(propagated.status_code, 200)
        organization.refresh_from_db()
        self.assertEqual(organization.max_recipients, 90000)

        self.authenticate(self.admin)
        forbidden = self.client.patch(
            f"/api/billing/platform/plans/{premium['id']}/", {"price_bdt": 1}, format="json"
        )
        self.assertEqual(forbidden.status_code, 403)

    def test_admin_is_tenant_scoped_and_cannot_promote(self):
        foreign = EmailTemplate.objects.create(organization=self.org_b, title="Secret", subject="x", html="x", created_by=self.other_admin)
        self.authenticate(self.admin)
        self.assertEqual(self.client.get("/api/templates/").data["count"], 0)
        self.assertEqual(self.client.get(f"/api/templates/{foreign.pk}/").status_code, 404)
        response = self.client.post("/api/users/", {"username": "evil", "email": "evil@example.com", "password": "StrongPass!234", "role": "owner"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_manager_operator_and_viewer_cannot_manage_users(self):
        for role in ("manager", "operator", "viewer"):
            user = User.objects.create_user(username=role, email=f"{role}@example.com", password="StrongPass!234", role=role, organization=self.org_a)
            self.authenticate(user)
            response = self.client.post("/api/users/", {"username": f"made-{role}", "email": f"made-{role}@example.com", "password": "StrongPass!234", "role": "viewer"}, format="json")
            self.assertEqual(response.status_code, 403)

    def test_user_and_smtp_limits_are_enforced(self):
        self.authenticate(self.admin)
        response = self.client.post("/api/users/", {"username": "third", "email": "third@example.com", "password": "StrongPass!234", "role": "viewer"}, format="json")
        self.assertEqual(response.status_code, 201)
        response = self.client.post("/api/users/", {"username": "fourth", "email": "fourth@example.com", "password": "StrongPass!234", "role": "viewer"}, format="json")
        self.assertEqual(response.status_code, 400)
        SMTPAccount.objects.create(organization=self.org_a, name="one", host="smtp.example.com", username="u", encrypted_password="x", from_email="a@example.com")
        response = self.client.post("/api/smtp-accounts/", {"name": "two", "host": "smtp.example.com", "port": 587, "username": "u", "password": "x", "from_email": "a@example.com"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("SMTP account limit reached", str(response.data))

    def test_recipient_import_rejects_entire_over_limit_file(self):
        recipient_list = RecipientList.objects.create(organization=self.org_a, list_name="Leads", created_by=self.admin)
        self.authenticate(self.admin)
        content = b"name,email\nA,a@example.com\nB,b@example.com\nC,c@example.com\n"
        upload = SimpleUploadedFile("recipients.csv", content, content_type="text/csv")
        response = self.client.post("/api/recipients/import_file/", {"recipient_list": recipient_list.pk, "file": upload}, format="multipart")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Recipient.objects.filter(organization=self.org_a).count(), 0)

    def _campaign(self):
        recipient_list = RecipientList.objects.create(organization=self.org_a, list_name="Campaign", created_by=self.admin)
        recipient = Recipient.objects.create(organization=self.org_a, recipient_list=recipient_list, email="lead@example.com")
        template = EmailTemplate.objects.create(organization=self.org_a, title="T", subject="Hi", html="<p>Hello</p>", created_by=self.admin)
        smtp = SMTPAccount.objects.create(organization=self.org_a, name="SMTP", host="smtp.example.com", username="", encrypted_password="", from_email="a@example.com", daily_limit=10)
        campaign = Campaign.objects.create(organization=self.org_a, name="C", template=template, recipient_list=recipient_list, smtp=smtp, created_by=self.admin)
        return campaign, recipient

    @patch("campaigns.views.launch_campaign.delay")
    def test_launch_blocks_suspended_and_insufficient_quota(self, delay):
        campaign, _ = self._campaign()
        self.authenticate(self.admin)
        self.org_a.status = "suspended"
        self.org_a.save(update_fields=["status"])
        response = self.client.post(f"/api/campaigns/{campaign.pk}/launch/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Account is suspended", str(response.data))
        self.org_a.status = "active"
        self.org_a.save(update_fields=["status"])
        OrganizationUsage.objects.create(organization=self.org_a, date=timezone.localdate(), emails_sent=2)
        response = self.client.post(f"/api/campaigns/{campaign.pk}/launch/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Daily email quota exceeded", str(response.data))
        delay.assert_not_called()

    @patch("campaigns.views.launch_campaign.delay")
    def test_launch_blocks_monthly_quota(self, delay):
        campaign, _ = self._campaign()
        self.org_a.daily_email_limit = 100
        self.org_a.monthly_email_limit = 1
        self.org_a.save(update_fields=["daily_email_limit", "monthly_email_limit"])
        OrganizationUsage.objects.create(organization=self.org_a, date=timezone.localdate(), emails_sent=1)
        self.authenticate(self.admin)
        response = self.client.post(f"/api/campaigns/{campaign.pk}/launch/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Monthly email quota exceeded", str(response.data))
        delay.assert_not_called()

    def test_send_worker_rechecks_quota_before_smtp(self):
        campaign, recipient = self._campaign()
        campaign.status = Campaign.Status.RUNNING
        campaign.save(update_fields=["status"])
        log = CampaignLog.objects.create(organization=self.org_a, campaign=campaign, recipient=recipient, recipient_email=recipient.email)
        OrganizationUsage.objects.create(organization=self.org_a, date=timezone.localdate(), emails_sent=2)
        with self.assertRaisesRegex(RuntimeError, "Daily email quota exceeded"):
            send_log_email(log.pk)

    def test_send_worker_supports_unlimited_daily_and_enforces_weekly_quota(self):
        campaign, recipient = self._campaign()
        campaign.status = Campaign.Status.RUNNING
        campaign.save(update_fields=["status"])
        log = CampaignLog.objects.create(organization=self.org_a, campaign=campaign, recipient=recipient, recipient_email=recipient.email)
        self.org_a.daily_email_limit = 0
        self.org_a.weekly_email_limit = 1
        self.org_a.monthly_email_limit = 100
        self.org_a.save(update_fields=["daily_email_limit", "weekly_email_limit", "monthly_email_limit"])
        OrganizationUsage.objects.create(organization=self.org_a, date=timezone.localdate(), emails_sent=1)
        with self.assertRaisesRegex(RuntimeError, "Weekly email quota exceeded"):
            send_log_email(log.pk)

    def test_celery_task_rejects_cross_organization_log(self):
        campaign, recipient = self._campaign()
        campaign.status = Campaign.Status.RUNNING
        campaign.save(update_fields=["status"])
        log = CampaignLog.objects.create(organization=self.org_b, campaign=campaign, recipient=recipient, recipient_email=recipient.email)
        result = send_campaign_email(log.pk)
        self.assertEqual(result["status"], CampaignLog.Status.FAILED)
        self.assertIn("Cross-organization", result["detail"])

    def test_owner_second_login_revokes_first_access_token(self):
        first = self.client.post("/api/auth/token/", {"username": "owner", "password": "StrongPass!234"}, format="json")
        self.assertEqual(first.status_code, 200)
        second = self.client.post("/api/auth/token/", {"username": "owner", "password": "StrongPass!234"}, format="json")
        self.assertEqual(second.status_code, 200)
        old_client = APIClient()
        old_client.credentials(HTTP_AUTHORIZATION=f"Bearer {first.data['access']}")
        self.assertEqual(old_client.get("/api/profile/").status_code, 401)
        current_client = APIClient()
        current_client.credentials(HTTP_AUTHORIZATION=f"Bearer {second.data['access']}")
        self.assertEqual(current_client.get("/api/profile/").status_code, 200)

    def test_exports_escape_spreadsheet_formulas(self):
        recipient_list = RecipientList.objects.create(organization=self.org_a, list_name="Export", created_by=self.admin)
        Recipient.objects.create(organization=self.org_a, recipient_list=recipient_list, name="=HYPERLINK(\"bad\")", email="x@example.com", company="+cmd")
        response = export_csv(Recipient.objects.filter(organization=self.org_a))
        rows = list(csv.reader(io.StringIO(response.content.decode())))
        self.assertTrue(rows[1][0].startswith("'="))
        self.assertTrue(rows[1][2].startswith("'+"))
        xlsx = export_excel("safe.xlsx", ["Value"], [["@malicious"]])
        workbook = load_workbook(io.BytesIO(xlsx.content), data_only=False)
        self.assertEqual(workbook.active["A2"].value, "'@malicious")

    @patch("email_engine.sender.smtplib.SMTP")
    @patch("email_engine.sender.ssl.create_default_context")
    def test_smtp_connection_keeps_certificate_verification(self, create_context, smtp):
        context = MagicMock()
        context.check_hostname = True
        context.verify_mode = ssl.CERT_REQUIRED
        create_context.return_value = context
        account = MagicMock(encryption="none", port=25, host="smtp.example.com", username="", get_password=lambda: "")
        _connection(account)
        self.assertTrue(context.check_hostname)
        self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)
