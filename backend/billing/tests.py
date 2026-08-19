from unittest.mock import Mock, patch

from django.test import SimpleTestCase, override_settings
from rest_framework.exceptions import ValidationError

from .tasks import send_checkout_otp_email
from .tasks import _send_message
from .services import send_checkout_otp, verify_turnstile


class TurnstileVerificationTests(SimpleTestCase):
    @override_settings(
        TURNSTILE_SECRET_KEY="secret",
        TURNSTILE_EXPECTED_HOSTNAME="mailflow.annomous.com, mail-flow.annomous.com",
        TURNSTILE_CHECKOUT_ACTION="checkout",
    )
    @patch("billing.services.requests.post")
    def test_turnstile_accepts_any_configured_hostname(self, post):
        post.return_value = Mock(json=lambda: {
            "success": True,
            "hostname": "mail-flow.annomous.com",
            "action": "checkout",
        })

        request = Mock(META={"REMOTE_ADDR": "127.0.0.1"})

        self.assertTrue(verify_turnstile("token", request=request))

    @override_settings(
        TURNSTILE_SECRET_KEY="secret",
        TURNSTILE_EXPECTED_HOSTNAME="mailflow.annomous.com, mail-flow.annomous.com",
        TURNSTILE_CHECKOUT_ACTION="checkout",
    )
    @patch("billing.services.requests.post")
    def test_turnstile_rejects_unconfigured_hostname(self, post):
        post.return_value = Mock(json=lambda: {
            "success": True,
            "hostname": "example.com",
            "action": "checkout",
        })

        with self.assertRaises(ValidationError):
            request = Mock(META={"REMOTE_ADDR": "127.0.0.1"})

            verify_turnstile("token", request=request)


class CheckoutOtpTaskTests(SimpleTestCase):
    @patch("billing.services.send_checkout_otp")
    def test_checkout_otp_task_sends_requested_code(self, send_checkout_otp):
        result = send_checkout_otp_email.run("hydragptplus@gmail.com", "123456")

        self.assertEqual(result, "sent")
        send_checkout_otp.assert_called_once_with("hydragptplus@gmail.com", "123456")

    @override_settings(MAIL_FLOW_OTP_RELAY_URL="", MAIL_FLOW_OTP_RELAY_SECRET="")
    @patch("billing.services.send_mail")
    def test_checkout_otp_uses_django_email_without_relay(self, send_mail):
        send_checkout_otp("buyer@example.com", "123456")

        send_mail.assert_called_once()
        self.assertEqual(send_mail.call_args.args[3], ["buyer@example.com"])

    @override_settings(
        MAIL_FLOW_OTP_RELAY_URL="https://mail.annomous.com/mailflow-otp-relay.php",
        MAIL_FLOW_OTP_RELAY_SECRET="test-secret",
        MAIL_FLOW_OTP_RELAY_TIMEOUT=10,
    )
    @patch("billing.services.requests.post")
    @patch("billing.services.send_mail")
    def test_checkout_otp_uses_signed_php_relay_when_configured(self, send_mail, post):
        post.return_value = Mock()

        send_checkout_otp("buyer@example.com", "123456")

        send_mail.assert_not_called()
        post.assert_called_once()
        self.assertEqual(post.call_args.kwargs["json"]["email"], "buyer@example.com")
        self.assertEqual(post.call_args.kwargs["json"]["code"], "123456")
        self.assertIn("X-Mail-Flow-Signature", post.call_args.kwargs["headers"])

    @override_settings(
        MAIL_FLOW_OTP_RELAY_URL="https://mail.annomous.com/mailflow-otp-relay.php",
        MAIL_FLOW_OTP_RELAY_SECRET="test-secret",
        MAIL_FLOW_OTP_RELAY_TIMEOUT=10,
    )
    @patch("billing.tasks.requests.post")
    @patch("billing.tasks.EmailMultiAlternatives")
    def test_billing_message_uses_signed_php_relay_when_configured(self, email_message, post):
        post.return_value = Mock()

        _send_message("Resume your USDT payment - Mail Flow", "Secure payment link: https://example.com", "buyer@example.com")

        email_message.assert_not_called()
        post.assert_called_once()
        self.assertEqual(post.call_args.kwargs["json"]["email"], "buyer@example.com")
        self.assertEqual(post.call_args.kwargs["json"]["subject"], "Resume your USDT payment - Mail Flow")
        self.assertIn("Secure payment link", post.call_args.kwargs["json"]["body"])
        self.assertIn("X-Mail-Flow-Signature", post.call_args.kwargs["headers"])
