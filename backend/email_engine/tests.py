import hashlib
import hmac
import json
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase, override_settings

from .campaign_relay import send_campaign_via_relay
from .sender import _deliver_with_fallback


def smtp_account():
    account = SimpleNamespace(
        encryption="tls",
        from_email="sender@example.com",
        from_name="Sender",
        host="smtp.example.com",
        port=587,
        reply_to="reply@example.com",
        username="smtp-user",
    )
    account.get_password = Mock(return_value="smtp-password")
    return account


class CampaignRelayClientTests(SimpleTestCase):
    @override_settings(
        MAIL_FLOW_CAMPAIGN_RELAY_URL="https://relay.example.com/campaign.php",
        MAIL_FLOW_CAMPAIGN_RELAY_SECRET="campaign-secret",
        MAIL_FLOW_CAMPAIGN_RELAY_TIMEOUT=30,
    )
    @patch("email_engine.campaign_relay.requests.post")
    def test_sends_signed_campaign_payload(self, post):
        post.return_value.json.return_value = {
            "ok": True,
            "stage": "complete",
            "category": "accepted",
            "smtp_code": 250,
            "provider_message_id": "<message@example.com>",
            "message": "accepted",
        }

        result = send_campaign_via_relay(
            smtp_account(),
            request_id="campaign-log-42",
            recipient="person@example.com",
            recipient_name="Person",
            subject="Hello",
            text="Plain text",
            html="<p>Hello</p>",
            message_id="<message@example.com>",
        )

        self.assertTrue(result["ok"])
        raw_body = post.call_args.kwargs["data"]
        payload = json.loads(raw_body)
        self.assertEqual(payload["operation"], "campaign_send")
        self.assertEqual(payload["request_id"], "campaign-log-42")
        self.assertEqual(payload["message"]["html"], "<p>Hello</p>")
        expected = hmac.new(b"campaign-secret", raw_body, hashlib.sha256).hexdigest()
        self.assertEqual(post.call_args.kwargs["headers"]["X-Mail-Flow-Signature"], expected)


class CampaignDeliveryFallbackTests(SimpleTestCase):
    @patch("email_engine.sender.send_campaign_via_relay")
    @patch("email_engine.sender._connection")
    def test_uses_php_relay_when_direct_smtp_fails(self, connection, relay):
        connection.side_effect = OSError("direct SMTP blocked")
        relay.return_value = {
            "ok": True,
            "provider_message_id": "<relayed@example.com>",
            "message": "accepted",
        }

        delivered_id = _deliver_with_fallback(
            smtp_account(),
            Mock(),
            request_id="campaign-log-7",
            recipient="person@example.com",
            recipient_name="Person",
            subject="Subject",
            text="Text",
            html="<p>HTML</p>",
            message_id="<direct@example.com>",
        )

        self.assertEqual(delivered_id, "<relayed@example.com>")
        relay.assert_called_once()

    @patch("email_engine.sender.send_campaign_via_relay")
    @patch("email_engine.sender._connection")
    def test_does_not_use_php_relay_when_direct_smtp_succeeds(self, connection, relay):
        server = connection.return_value

        delivered_id = _deliver_with_fallback(
            smtp_account(),
            Mock(),
            request_id="campaign-log-8",
            recipient="person@example.com",
            recipient_name="Person",
            subject="Subject",
            text="Text",
            html="<p>HTML</p>",
            message_id="<direct@example.com>",
        )

        self.assertEqual(delivered_id, "<direct@example.com>")
        server.send_message.assert_called_once()
        relay.assert_not_called()
