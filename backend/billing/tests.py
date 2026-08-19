from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from types import SimpleNamespace
from unittest.mock import MagicMock
from urllib.parse import unquote
import secrets

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from common.models import BillingConfiguration, Organization, OrganizationUsage
from common.quotas import usage_snapshot, validate_email_quota
from .blockchain import VerifiedTransfer, VerificationError, _ton_address, _verify_evm, _verify_ton, _verify_tron, extract_transaction_hash
from .models import CheckoutEmailVerification, CheckoutSession, FreePlanClaim, PaymentInvoice, PaymentTransferLedger, Plan, PreCheckoutSession, Subscription
from .services import invoice_token_digest, issue_invoice_access_code, private_hash

User = get_user_model()


class PublicBillingTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.registration = {
            "name": "Customer Admin",
            "email": "customer@example.com",
            "organization_name": "Customer Company",
            "password": "StrongPass!234",
        }
        self.allow_paid_checkout()

    def exchange_checkout_code(self, invoice_data):
        invoice = PaymentInvoice.objects.get(pk=invoice_data["id"])
        code = issue_invoice_access_code(invoice)
        response = self.client.post(
            f"/api/billing/invoices/{invoice_data['id']}/session/",
            {"code": code},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        return response

    def allow_paid_checkout(self, email=None):
        token = secrets.token_urlsafe(32)
        email = (email or self.registration["email"]).strip().lower()
        PreCheckoutSession.objects.create(
            normalized_email=email,
            token_digest=invoice_token_digest(token),
            expires_at=timezone.now() + timedelta(minutes=20),
        )
        self.client.cookies[settings.PRECHECKOUT_SESSION_COOKIE_NAME] = token

    def test_public_plans_match_approved_limits(self):
        response = self.client.get("/api/billing/plans/")
        self.assertEqual(response.status_code, 200)
        plans = {plan["slug"]: plan for plan in response.data}
        self.assertEqual(set(plans), {"free", "basic", "premium", "premium-plus"})
        self.assertEqual(plans["free"]["email_limit"], 50)
        self.assertEqual(plans["premium"]["weekly_email_limit"], 15000)
        self.assertEqual(plans["premium-plus"]["weekly_email_limit"], 37500)
        self.assertEqual(plans["premium-plus"]["email_limit"], 150000)

    @patch("billing.services.send_checkout_otp")
    @patch("billing.services.secrets.randbelow", return_value=123456)
    def test_email_otp_creates_precheckout_cookie_and_blocks_replay(self, randbelow, send_otp):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                "/api/billing/checkout/email/start/",
                {"email": "Buyer@Example.com", "turnstile_token": ""},
                format="json",
            )
        self.assertEqual(response.status_code, 202, response.data)
        send_otp.assert_called_once_with("buyer@example.com", "123456")
        challenge = CheckoutEmailVerification.objects.get(normalized_email="buyer@example.com")
        self.assertEqual(challenge.code_digest, private_hash("123456"))
        response = self.client.post(
            "/api/billing/checkout/email/verify/",
            {"email": "buyer@example.com", "code": "123456"},
            format="json",
        )
        self.assertEqual(response.status_code, 202, response.data)
        self.assertIn(settings.PRECHECKOUT_SESSION_COOKIE_NAME, response.cookies)
        replay = self.client.post(
            "/api/billing/checkout/email/verify/",
            {"email": "buyer@example.com", "code": "123456"},
            format="json",
        )
        self.assertEqual(replay.status_code, 400)

    def test_free_signup_provisions_plan_and_blocks_same_ip(self):
        response = self.client.post("/api/billing/signup/free/", self.registration, format="json", REMOTE_ADDR="203.0.113.7")
        self.assertEqual(response.status_code, 201, response.data)
        user = User.objects.get(email="customer@example.com")
        self.assertEqual(user.role, "admin")
        self.assertTrue(user.check_password("StrongPass!234"))
        self.assertEqual(user.organization.max_users, 1)
        self.assertEqual(user.organization.max_admins, 1)
        self.assertEqual(user.organization.subscription.plan.slug, "free")
        self.assertEqual(FreePlanClaim.objects.count(), 1)
        second = {**self.registration, "email": "other@example.com", "organization_name": "Other Company"}
        response = self.client.post("/api/billing/signup/free/", second, format="json", REMOTE_ADDR="203.0.113.7")
        self.assertEqual(response.status_code, 400)

    @override_settings(USDT_BDT_RATE="100.0000")
    def test_paid_invoice_uses_public_wallet_and_hides_password(self):
        response = self.client.post("/api/billing/invoices/", {**self.registration, "plan_slug": "basic", "network": "bsc"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["receiving_address"].lower(), "0xd34d15736148c0e9dc185ccf2d94b648c48e1cdb")
        self.assertGreater(Decimal(response.data["amount_usdt"]), Decimal("17"))
        self.assertNotIn("password", response.data)
        self.assertNotIn("access_token", response.data)
        self.assertNotIn("resume_url", response.data)
        invoice = PaymentInvoice.objects.get(pk=response.data["id"])
        self.assertEqual(invoice.amount_raw, invoice.amount_usdt * (Decimal(10) ** invoice.token_decimals))
        self.assertNotEqual(invoice.password_hash, self.registration["password"])
        self.assertEqual(APIClient().get(f"/api/billing/invoices/{invoice.pk}/").status_code, 401)
        self.exchange_checkout_code(response.data)
        detail = self.client.get(f"/api/billing/invoices/{invoice.pk}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(CheckoutSession.objects.filter(invoice=invoice, revoked_at__isnull=True).count(), 1)

    def test_new_invoice_uses_live_admin_rate_and_receiving_wallet(self):
        BillingConfiguration.objects.create(
            usdt_bdt_rate=Decimal("140.2500"),
            payment_evm_wallet="0x1111111111111111111111111111111111111111",
            payment_tron_wallet="TConfiguredWallet",
            payment_ton_wallet="UQConfiguredWallet",
        )
        response = self.client.post(
            "/api/billing/invoices/",
            {**self.registration, "plan_slug": "basic", "network": "bsc"},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["usdt_bdt_rate"], "140.2500")
        self.assertEqual(response.data["receiving_address"], "0x1111111111111111111111111111111111111111")

    @patch("billing.views.verify_invoice_transfer")
    def test_verified_transfer_activates_once_and_credentials_work(self, verifier):
        response = self.client.post("/api/billing/invoices/", {**self.registration, "plan_slug": "premium", "network": "tron"}, format="json")
        invoice_id = response.data["id"]
        self.exchange_checkout_code(response.data)
        invoice = PaymentInvoice.objects.get(pk=invoice_id)
        verifier.return_value = VerifiedTransfer("a" * 64, 0, invoice.amount_usdt, int(invoice.amount_raw), "123", None, timezone.now(), {"tested": True})
        response = self.client.post(
            f"/api/billing/invoices/{invoice_id}/verify/", {"transaction": "a" * 64},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["status"], "paid")
        user = User.objects.get(email="customer@example.com")
        self.assertTrue(user.check_password("StrongPass!234"))
        self.assertEqual(user.organization.subscription.plan.slug, "premium")
        self.assertEqual(user.organization.weekly_email_limit, 15000)
        repeated = self.client.post(
            f"/api/billing/invoices/{invoice_id}/verify/", {"transaction": "a" * 64},
            format="json",
        )
        self.assertEqual(repeated.status_code, 401)
        self.assertEqual(Organization.objects.filter(name="Customer Company").count(), 1)
        self.assertEqual(PaymentTransferLedger.objects.filter(transaction_hash="a" * 64).count(), 1)

    @patch("billing.views.verify_invoice_transfer")
    def test_overpayment_goes_to_review_and_does_not_activate(self, verifier):
        response = self.client.post("/api/billing/invoices/", {**self.registration, "plan_slug": "basic", "network": "tron"}, format="json")
        invoice = PaymentInvoice.objects.get(pk=response.data["id"])
        self.exchange_checkout_code(response.data)
        verifier.return_value = VerifiedTransfer(
            "c" * 64, 0, invoice.amount_usdt + Decimal("1"), int(invoice.amount_raw) + 1_000_000,
            "123", None, timezone.now(), {"tested": True},
        )
        response = self.client.post(
            f"/api/billing/invoices/{invoice.pk}/verify/", {"transaction": "c" * 64}, format="json",
        )
        self.assertEqual(response.status_code, 202, response.data)
        self.assertEqual(response.data["status"], PaymentInvoice.Status.MANUAL_REVIEW)
        self.assertFalse(User.objects.filter(email="customer@example.com").exists())
        ledger = PaymentTransferLedger.objects.get(transaction_hash="c" * 64)
        self.assertEqual(ledger.resolution, PaymentTransferLedger.Resolution.UNRESOLVED)

    def test_admin_can_create_existing_account_renewal_invoice(self):
        plan = Plan.objects.get(slug="basic")
        organization = Organization.objects.create(name="Existing Customer")
        now = timezone.now()
        Subscription.objects.create(
            organization=organization, plan=plan, current_period_start=now,
            current_period_end=now + timedelta(days=30),
        )
        admin = User.objects.create_user(
            username="existing-admin", email="existing@example.com", password="StrongPass!234",
            role="admin", organization=organization,
        )
        self.client.force_authenticate(admin)
        response = self.client.post(
            "/api/billing/account/invoices/", {"plan_slug": "premium-plus", "network": "ton"}, format="json"
        )
        self.assertEqual(response.status_code, 201, response.data)
        invoice = PaymentInvoice.objects.get(pk=response.data["id"])
        self.assertEqual(invoice.organization, organization)
        self.assertEqual(invoice.plan.slug, "premium-plus")
        self.assertEqual(invoice.password_hash, "")

    @patch("billing.tasks.send_recovery_email.delay")
    def test_duplicate_active_invoice_returns_conflict_and_idempotent_retry_reuses_invoice(self, delay):
        payload = {**self.registration, "plan_slug": "basic", "network": "bsc", "idempotency_key": "checkout-1"}
        first = self.client.post("/api/billing/invoices/", payload, format="json")
        retry = self.client.post("/api/billing/invoices/", payload, format="json")
        self.assertEqual(retry.status_code, 200, retry.data)
        self.assertEqual(retry.data["id"], first.data["id"])
        conflict = self.client.post(
            "/api/billing/invoices/", {**payload, "idempotency_key": "checkout-2"}, format="json"
        )
        self.assertEqual(conflict.status_code, 409, conflict.data)
        self.assertNotIn(first.data["id"], str(conflict.data))

    @patch("billing.tasks.send_recovery_email.delay")
    def test_recovery_response_does_not_disclose_invoice_existence(self, delay):
        existing = self.client.post(
            "/api/billing/invoices/", {**self.registration, "plan_slug": "basic", "network": "bsc"}, format="json"
        )
        self.assertEqual(existing.status_code, 201)
        found = self.client.post("/api/billing/invoices/recover/", {"email": self.registration["email"]}, format="json")
        missing = self.client.post("/api/billing/invoices/recover/", {"email": "missing@example.com"}, format="json")
        self.assertEqual(found.status_code, 202)
        self.assertEqual(found.data, missing.data)
        self.assertEqual(delay.call_count, 2)

    @patch("billing.views.verify_invoice_transfer")
    def test_post_expiry_transfer_moves_invoice_to_manual_review(self, verifier):
        created = self.client.post(
            "/api/billing/invoices/", {**self.registration, "plan_slug": "basic", "network": "bsc"}, format="json"
        )
        invoice = PaymentInvoice.objects.get(pk=created.data["id"])
        invoice.expires_at = timezone.now() - timedelta(minutes=1)
        invoice.status = PaymentInvoice.Status.EXPIRED
        invoice.save(update_fields=("expires_at", "status"))
        self.exchange_checkout_code(created.data)
        verifier.return_value = VerifiedTransfer(
            "b" * 64, 0, invoice.amount_usdt, int(invoice.amount_raw), "123", None,
            timezone.now() + timedelta(minutes=1), {"timestamp": int((timezone.now() + timedelta(minutes=1)).timestamp())},
        )
        response = self.client.post(
            f"/api/billing/invoices/{invoice.pk}/verify/", {"transaction": "b" * 64}, format="json",
        )
        self.assertEqual(response.status_code, 202, response.data)
        self.assertEqual(response.data["status"], PaymentInvoice.Status.MANUAL_REVIEW)
        self.assertEqual(PaymentTransferLedger.objects.filter(transaction_hash="b" * 64).count(), 1)

    def test_expired_invoice_can_be_replaced_and_old_token_cannot_open_new_invoice(self):
        created = self.client.post(
            "/api/billing/invoices/", {**self.registration, "plan_slug": "basic", "network": "bsc"}, format="json"
        )
        invoice = PaymentInvoice.objects.get(pk=created.data["id"])
        invoice.status = PaymentInvoice.Status.EXPIRED
        invoice.save(update_fields=("status",))
        self.exchange_checkout_code(created.data)
        response = self.client.post(
            f"/api/billing/invoices/{invoice.pk}/replace/", {"password": "StrongPass!234"}, format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, PaymentInvoice.Status.REPLACED)
        self.assertEqual(str(invoice.replaced_by_id), response.data["id"])
        unauthorized = APIClient().get(f"/api/billing/invoices/{response.data['id']}/")
        self.assertEqual(unauthorized.status_code, 401)

    def test_hash_parser_accepts_explorer_links_and_rejects_bad_values(self):
        evm_hash = "0x" + "a" * 64
        self.assertEqual(extract_transaction_hash(f"https://bscscan.com/tx/{evm_hash}", "bsc"), evm_hash)
        self.assertEqual(extract_transaction_hash("https://tronscan.org/#/transaction/" + "B" * 64, "tron"), "b" * 64)
        with self.assertRaises(VerificationError):
            extract_transaction_hash("not-a-transaction", "ethereum")


class SubscriptionQuotaTests(TestCase):
    def test_week_is_anchored_to_subscription_start(self):
        plan = Plan.objects.get(slug="premium")
        organization = Organization.objects.create(
            name="Quota Co", max_admins=2, max_users=10, max_smtp_accounts=5,
            daily_email_limit=0, weekly_email_limit=15000, monthly_email_limit=60000,
        )
        start = timezone.now() - timedelta(days=8)
        Subscription.objects.create(
            organization=organization, plan=plan, current_period_start=start,
            current_period_end=start + timedelta(days=30),
        )
        OrganizationUsage.objects.create(organization=organization, date=timezone.localdate(), emails_sent=14999)
        snapshot = usage_snapshot(organization)
        self.assertEqual(snapshot["weekly_remaining"], 1)
        self.assertIsNone(snapshot["daily_remaining"])
        validate_email_quota(organization, 1)
        with self.assertRaisesMessage(Exception, "Weekly email quota exceeded"):
            validate_email_quota(organization, 2)


class BlockchainAdapterTests(TestCase):
    @patch("billing.blockchain._rpc")
    def test_evm_verifier_decodes_official_transfer_log(self, rpc):
        wallet = "0xd34D15736148C0e9DC185CCf2D94B648c48e1CdB"
        contract = "0x55d398326f99059fF775485246999027B3197955"
        amount_raw = 20 * 10**18
        rpc.side_effect = [
            {"status": "0x1", "blockNumber": "0x64", "logs": [{
                "address": contract,
                "topics": [
                    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
                    "0x" + "0" * 64,
                    "0x" + "0" * 24 + wallet[2:].lower(),
                ],
                "data": hex(amount_raw), "logIndex": "0x2",
            }]},
            "0x78",
            {"timestamp": hex(int(timezone.now().timestamp()))},
        ]
        invoice = SimpleNamespace(
            network="bsc", token_contract=contract, receiving_address=wallet,
            amount_usdt=Decimal("20"), amount_raw=amount_raw, created_at=timezone.now() - timedelta(minutes=1),
        )
        result = _verify_evm(invoice, "0x" + "a" * 64)
        self.assertEqual(result.transfer_index, 2)
        self.assertEqual(result.amount, Decimal("20"))

    @patch("billing.blockchain.requests.get")
    def test_tron_verifier_requires_confirmed_contract_and_recipient(self, get):
        response = MagicMock()
        response.json.return_value = {"data": [{
            "transaction_id": "b" * 64,
            "token_info": {"address": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", "decimals": 6},
            "to": "TWYfWJ3o3Bj2RdT5EHogghm3KbWzoWqx4u", "value": "25000000", "block_timestamp": 1,
        }]}
        get.return_value = response
        invoice = SimpleNamespace(
            token_contract="TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
            receiving_address="TWYfWJ3o3Bj2RdT5EHogghm3KbWzoWqx4u",
            amount_usdt=Decimal("25"), amount_raw=25000000, created_at=timezone.now(),
        )
        self.assertEqual(_verify_tron(invoice, "b" * 64).amount, Decimal("25"))

    @patch("billing.blockchain.requests.get")
    def test_ton_verifier_normalizes_friendly_and_raw_addresses(self, get):
        tx_hash = "YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE="
        response = MagicMock()
        response.json.return_value = {"jetton_transfers": [{
            "transaction_hash": tx_hash,
            "jetton_master": "0:B113A994B5024A16719F69139328EB759596C38A25F59028B146FECDC3621DFE",
            "destination": "0:9CD72602375ABC26CF963EA03693C902045AFD9C36CEA35F23D2FB07D9D8714D",
            "transaction_aborted": False, "amount": "30000000", "transaction_lt": "99", "trace_id": "trace",
            "transaction_now": int(timezone.now().timestamp()),
        }]}
        get.return_value = response
        invoice = SimpleNamespace(
            token_contract="EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs",
            receiving_address="UQCc1yYCN1q8Js-WPqA2k8kCBFr9nDbOo18j0vsH2dhxTR9s",
            amount_usdt=Decimal("30"), amount_raw=30000000, created_at=timezone.now(),
        )
        result = _verify_ton(invoice, tx_hash)
        self.assertEqual(result.amount, Decimal("30"))
        self.assertEqual(_ton_address(invoice.receiving_address), "0:9cd72602375abc26cf963ea03693c902045afd9c36cea35f23d2fb07d9d8714d")
