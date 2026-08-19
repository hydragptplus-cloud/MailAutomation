from unittest.mock import Mock, patch

from django.test import SimpleTestCase, override_settings
from rest_framework.exceptions import ValidationError

from .services import verify_turnstile


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
