import hashlib
import hmac
import json
from unittest.mock import Mock, patch

from django.test import SimpleTestCase, override_settings

from .tester import send_test_mail, test_smtp as run_smtp_test


class DummyAccount:
    host = "smtp.example.com"
    port = 587
    encryption = "tls"
    username = "sender@example.com"
    from_email = "sender@example.com"
    from_name = "Example Sender"
    reply_to = "reply@example.com"

    def get_password(self):
        return "smtp-secret"


@override_settings(
    MAIL_FLOW_SMTP_TEST_RELAY_URL="https://relay.example.com/smtp-test.php",
    MAIL_FLOW_SMTP_TEST_RELAY_SECRET="relay-secret",
    MAIL_FLOW_SMTP_TEST_RELAY_TIMEOUT=25,
)
class SMTPRelayClientTests(SimpleTestCase):
    @patch("smtp_manager.tester.requests.post")
    def test_connection_test_sends_signed_relay_request(self, post):
        response = Mock()
        response.json.return_value = {
            "ok": True,
            "dns": True,
            "connection": True,
            "tls": True,
            "auth": True,
            "stage": "complete",
            "category": "accepted",
            "smtp_code": 235,
            "message": "Authentication succeeded.",
        }
        post.return_value = response

        result = run_smtp_test(DummyAccount())

        self.assertTrue(result["ok"])
        call = post.call_args
        raw_body = call.kwargs["data"]
        expected_signature = hmac.new(b"relay-secret", raw_body, hashlib.sha256).hexdigest()
        self.assertEqual(call.kwargs["headers"]["X-Mail-Flow-Signature"], expected_signature)
        payload = json.loads(raw_body)
        self.assertEqual(payload["operation"], "connection_test")
        self.assertEqual(payload["smtp"]["password"], "smtp-secret")

    @patch("smtp_manager.tester.requests.post")
    def test_send_test_forwards_custom_message_and_safe_failure(self, post):
        response = Mock()
        response.json.return_value = {
            "ok": False,
            "dns": True,
            "connection": True,
            "tls": True,
            "auth": True,
            "stage": "mail_from",
            "category": "sender_rejected",
            "smtp_code": 550,
            "message": "The SMTP server rejected the configured From address.",
        }
        post.return_value = response

        result = send_test_mail(
            DummyAccount(),
            "recipient@example.com",
            subject="Custom subject",
            message="Custom body",
        )

        self.assertFalse(result["ok"])
        self.assertEqual(result["stage"], "mail_from")
        self.assertEqual(result["smtp_code"], 550)
        payload = json.loads(post.call_args.kwargs["data"])
        self.assertEqual(payload["message"]["recipient"], "recipient@example.com")
        self.assertEqual(payload["message"]["subject"], "Custom subject")
        self.assertEqual(payload["message"]["body"], "Custom body")

    @override_settings(MAIL_FLOW_SMTP_TEST_RELAY_URL="")
    def test_missing_relay_configuration_fails_closed(self):
        result = run_smtp_test(DummyAccount())
        self.assertFalse(result["ok"])
        self.assertEqual(result["stage"], "relay")
        self.assertIn("not configured", result["message"])
