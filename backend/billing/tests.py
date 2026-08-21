import hashlib
import hmac
import json
from decimal import Decimal
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from common.models import Organization
from .models import PaymentInvoice, PaymentTransferLedger, Plan, Subscription
from .serializers import AccountInvoiceCreateSerializer, InvoiceCreateSerializer, PlanAdminSerializer
from .services import (
    apply_custom_limits_to_organization,
    create_custom_invoice,
    create_invoice,
    custom_pricing_preview,
    resolve_manual_transfer,
)
from .tasks import _limits_text, _send_message, send_account_created_email


class MailRelayTaskTests(TestCase):
    @override_settings(
        MAIL_FLOW_OTP_RELAY_URL="https://relay.example.test/mailflow-otp-relay.php",
        MAIL_FLOW_OTP_RELAY_SECRET="relay-secret",
        MAIL_FLOW_OTP_RELAY_TIMEOUT=3,
    )
    @patch("billing.tasks.requests.post")
    def test_send_message_signs_sender_route_and_html(self, post):
        response = Mock()
        response.raise_for_status.return_value = None
        post.return_value = response

        with patch("billing.tasks.time.time", return_value=123456):
            _send_message(
                "Welcome",
                "Plain body",
                "customer@example.com",
                "<p>Plain body</p>",
                sender="general",
            )

        payload = post.call_args.kwargs["json"]
        expected_payload = {
            "body": "Plain body",
            "email": "customer@example.com",
            "html": "<p>Plain body</p>",
            "sender": "general",
            "subject": "Welcome",
            "timestamp": "123456",
        }
        expected_signature = hmac.new(
            b"relay-secret",
            json.dumps(expected_payload, separators=(",", ":"), sort_keys=True).encode(),
            hashlib.sha256,
        ).hexdigest()

        self.assertEqual(payload, expected_payload)
        self.assertEqual(post.call_args.kwargs["headers"]["X-Mail-Flow-Signature"], expected_signature)

    @patch("billing.tasks._send_message")
    def test_account_created_email_uses_general_sender_with_billing_period(self, send_message):
        user_model = get_user_model()
        plan, _ = Plan.objects.update_or_create(
            slug="test-basic",
            defaults={
                "name": "Basic",
                "original_price_bdt": 1700,
                "email_limit": 30000,
                "daily_email_limit": 1000,
                "weekly_email_limit": 0,
                "max_admins": 1,
                "max_users": 5,
                "max_smtp_accounts": 2,
                "max_recipients": 10000,
                "max_campaigns_per_day": 10,
                "is_free": False,
                "is_active": True,
            },
        )
        organization = Organization.objects.create(name="Example Co")
        user = user_model.objects.create_user(
            username="admin",
            email="admin@example.com",
            password="SecretPass123!",
            name="Admin User",
            role=user_model.Role.ADMIN,
            organization=organization,
        )
        now = timezone.now()
        Subscription.objects.create(
            organization=organization,
            plan=plan,
            status=Subscription.Status.ACTIVE,
            current_period_start=now,
            current_period_end=now + timezone.timedelta(days=30),
        )

        result = send_account_created_email(user.pk)

        self.assertEqual(result, "sent")
        subject, body, recipient = send_message.call_args.args[:3]
        self.assertEqual(subject, "Your Mail Flow account is ready")
        self.assertEqual(recipient, "admin@example.com")
        self.assertIn("Organization: Example Co", body)
        self.assertIn("Plan: Basic", body)
        self.assertIn("Next billing period:", body)
        self.assertEqual(send_message.call_args.kwargs["sender"], "general")


class CustomPlanPricingTests(TestCase):
    def setUp(self):
        self.premium_plus, _ = Plan.objects.update_or_create(
            slug="premium-plus",
            defaults={
                "name": "Premium+",
                "original_price_bdt": 5000,
                "discount_percent": 20,
                "email_limit": 150000,
                "daily_email_limit": 0,
                "weekly_email_limit": 37500,
                "max_admins": 5,
                "max_users": 50,
                "max_smtp_accounts": 10,
                "max_recipients": 10000,
                "max_campaigns_per_day": 10,
                "is_free": False,
                "is_active": True,
            },
        )
        self.custom, _ = Plan.objects.update_or_create(
            slug="custom",
            defaults={
                "name": "Custom",
                "original_price_bdt": 0,
                "discount_percent": 10,
                "email_limit": 150000,
                "daily_email_limit": 0,
                "weekly_email_limit": 0,
                "max_admins": 5,
                "max_users": 50,
                "max_smtp_accounts": 10,
                "max_recipients": 10000,
                "max_campaigns_per_day": 10,
                "is_free": False,
                "is_active": True,
            },
        )

    def test_custom_pricing_uses_premium_plus_was_price_and_custom_discount(self):
        plan, price, snapshot = custom_pricing_preview({
            "email_limit": 300000,
            "max_admins": 8,
            "max_users": 80,
            "max_smtp_accounts": 15,
            "max_recipients": 50000,
        })

        self.assertEqual(plan, self.custom)
        self.assertEqual(snapshot["base_price_bdt"], 5000)
        self.assertEqual(snapshot["extra_price_bdt"], 4750)
        self.assertEqual(snapshot["original_price_bdt"], 9750)
        self.assertEqual(snapshot["discount_percent"], 10)
        self.assertEqual(price, 8775)
        self.assertEqual(snapshot["payable_price_bdt"], 8775)

    def test_custom_invoice_stores_calculated_price_and_selected_limits(self):
        invoice, _token, created = create_custom_invoice({
            "network": PaymentInvoice.Network.BSC,
            "customer_name": "Custom Buyer",
            "customer_email": "buyer@example.com",
            "organization_name": "Custom Org",
            "password_hash": "hashed-password",
            "idempotency_key": "custom-test",
            "limits": {
                "email_limit": 300000,
                "max_admins": 8,
                "max_users": 80,
                "max_smtp_accounts": 15,
                "max_recipients": 50000,
            },
        })

        self.assertTrue(created)
        self.assertEqual(invoice.plan.slug, "custom")
        self.assertEqual(invoice.price_bdt, 8775)
        self.assertTrue(invoice.snapshot_limits["custom_plan"])
        self.assertEqual(invoice.snapshot_limits["email_limit"], 300000)
        self.assertEqual(invoice.snapshot_limits["max_smtp_accounts"], 15)

    def test_custom_limits_apply_to_organization(self):
        organization = Organization.objects.create(name="Custom Tenant")

        apply_custom_limits_to_organization(organization, {
            "email_limit": 300000,
            "daily_email_limit": 0,
            "weekly_email_limit": 0,
            "max_admins": 8,
            "max_users": 80,
            "max_smtp_accounts": 15,
            "max_recipients": 50000,
            "max_campaigns_per_day": 10,
        })

        organization.refresh_from_db()
        self.assertEqual(organization.monthly_email_limit, 300000)
        self.assertEqual(organization.max_admins, 8)
        self.assertEqual(organization.max_users, 80)
        self.assertEqual(organization.max_smtp_accounts, 15)
        self.assertEqual(organization.max_recipients, 50000)
        self.assertTrue(organization.support_workspace_enabled)

    def test_generic_checkout_serializers_reject_custom_plan(self):
        public = InvoiceCreateSerializer(data={
            "name": "Buyer",
            "email": "new-buyer@example.com",
            "organization_name": "New Buyer Org",
            "password": "StrongPassword123!",
            "plan_slug": "custom",
            "network": "bsc",
        })
        account = AccountInvoiceCreateSerializer(data={"plan_slug": "custom", "network": "bsc"})

        self.assertFalse(public.is_valid())
        self.assertIn("plan_slug", public.errors)
        self.assertFalse(account.is_valid())
        self.assertIn("plan_slug", account.errors)

    def test_service_rejects_custom_plan_outside_custom_checkout(self):
        with self.assertRaisesMessage(Exception, "Custom plans must use the custom checkout"):
            create_invoice({
                "plan_slug": "custom",
                "network": "bsc",
                "customer_name": "Bypass Buyer",
                "customer_email": "bypass@example.com",
                "organization_name": "Bypass Org",
                "password_hash": "hashed-password",
                "idempotency_key": "bypass-attempt",
            })

    def test_custom_plan_admin_update_preserves_purchased_limits(self):
        organization = Organization.objects.create(
            name="Snapshot Tenant",
            monthly_email_limit=300000,
            max_admins=8,
            max_users=80,
            max_smtp_accounts=15,
            max_recipients=50000,
            support_workspace_enabled=True,
        )
        now = timezone.now()
        Subscription.objects.create(
            organization=organization,
            plan=self.custom,
            status=Subscription.Status.ACTIVE,
            current_period_start=now,
            current_period_end=now + timezone.timedelta(days=30),
        )

        serializer = PlanAdminSerializer(self.custom, data={"discount_percent": 15}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()

        organization.refresh_from_db()
        self.assertEqual(organization.monthly_email_limit, 300000)
        self.assertEqual(organization.max_users, 80)
        self.assertEqual(organization.max_smtp_accounts, 15)

    def test_manual_approval_activates_review_invoice_even_with_amount_mismatch(self):
        organization = Organization.objects.create(name="Manual Review Tenant")
        now = timezone.now()
        invoice = PaymentInvoice.objects.create(
            plan=self.custom,
            organization=organization,
            customer_name="Review Buyer",
            customer_email="review@example.com",
            organization_name=organization.name,
            network=PaymentInvoice.Network.BSC,
            receiving_address="0x1111111111111111111111111111111111111111",
            token_contract="0x2222222222222222222222222222222222222222",
            price_bdt=8775,
            usdt_bdt_rate=Decimal("122.0000"),
            amount_usdt=Decimal("71.926230"),
            token_decimals=18,
            amount_raw=Decimal("71926230000000000000"),
            snapshot_limits={
                "custom_plan": True,
                "email_limit": 300000,
                "daily_email_limit": 0,
                "weekly_email_limit": 0,
                "max_admins": 8,
                "max_users": 80,
                "max_smtp_accounts": 15,
                "max_recipients": 50000,
                "max_campaigns_per_day": 10,
            },
            status=PaymentInvoice.Status.MANUAL_REVIEW,
            expires_at=now - timezone.timedelta(minutes=1),
        )
        ledger = PaymentTransferLedger.objects.create(
            network=invoice.network,
            transaction_hash="0xabc123",
            transfer_index=0,
            canonical_contract=invoice.token_contract,
            destination=invoice.receiving_address,
            amount_raw=Decimal("70000000000000000000"),
            amount_usdt=Decimal("70.000000"),
            occurred_at=now,
            invoice=invoice,
        )

        resolved = resolve_manual_transfer(ledger.pk, "approve", actor=None, notes="Payment accepted")

        invoice.refresh_from_db()
        organization.refresh_from_db()
        self.assertEqual(invoice.status, PaymentInvoice.Status.PAID)
        self.assertEqual(resolved.resolution, PaymentTransferLedger.Resolution.MANUAL_APPROVED)
        self.assertEqual(organization.monthly_email_limit, 300000)
        self.assertEqual(organization.max_users, 80)

    def test_custom_limit_email_text_uses_snapshot_values(self):
        text = _limits_text({
            "email_limit": 300000,
            "daily_email_limit": 0,
            "weekly_email_limit": 0,
            "max_admins": 8,
            "max_users": 80,
            "max_smtp_accounts": 15,
        })

        self.assertIn("Included email quota: 300,000", text)
        self.assertIn("Administrators: 8", text)
        self.assertIn("SMTP accounts: 15", text)

    @override_settings(
        PAYMENT_NETWORK_BSC_ENABLED=True,
        CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
    )
    def test_authenticated_custom_renewal_uses_priced_snapshot(self):
        organization = Organization.objects.create(name="Renewal Tenant")
        user_model = get_user_model()
        admin = user_model.objects.create_user(
            username="renewal-admin",
            email="renewal@example.com",
            password="StrongPassword123!",
            role=user_model.Role.ADMIN,
            organization=organization,
        )
        client = APIClient()
        client.force_authenticate(admin)

        response = client.post("/api/billing/account/custom-invoices/", {
            "network": "bsc",
            "idempotency_key": "renewal-custom-test",
            "limits": {
                "email_limit": 300000,
                "max_admins": 8,
                "max_users": 80,
                "max_smtp_accounts": 15,
                "max_recipients": 50000,
            },
        }, format="json")

        self.assertEqual(response.status_code, 201, response.data)
        invoice = PaymentInvoice.objects.get(pk=response.data["id"])
        self.assertEqual(invoice.organization, organization)
        self.assertEqual(invoice.price_bdt, 8775)
        self.assertTrue(invoice.snapshot_limits["custom_plan"])
        self.assertEqual(invoice.snapshot_limits["max_users"], 80)
