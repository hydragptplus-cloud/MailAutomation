from django.test import Client, TestCase
from django.urls import reverse

from .models import User


class AuthenticationCookieTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="cookie-user",
            email="cookie-user@example.com",
            password="Strong-Test-Password-938!",
            role=User.Role.ADMIN,
        )
        self.client = Client(enforce_csrf_checks=True)

    def login(self):
        return self.client.post(
            reverse("token_obtain_pair"),
            {"username": self.user.username, "password": "Strong-Test-Password-938!"},
            content_type="application/json",
        )

    def test_login_uses_httponly_cookies_without_returning_tokens(self):
        response = self.login()

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("access", response.json())
        self.assertNotIn("refresh", response.json())
        self.assertTrue(response.cookies["mailflow_access"]["httponly"])
        self.assertTrue(response.cookies["mailflow_refresh"]["httponly"])
        self.assertEqual(response.cookies["mailflow_access"]["samesite"], "Lax")

    def test_cookie_authenticated_writes_require_csrf(self):
        login_response = self.login()
        self.assertEqual(login_response.status_code, 200)

        rejected = self.client.post(reverse("logout"))
        self.assertEqual(rejected.status_code, 403)

        csrf_token = self.client.cookies["csrftoken"].value
        accepted = self.client.post(reverse("logout"), HTTP_X_CSRFTOKEN=csrf_token)
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(accepted.cookies["mailflow_access"]["max-age"], 0)

    def test_refresh_cookie_rotates_without_exposing_tokens(self):
        self.assertEqual(self.login().status_code, 200)
        response = self.client.post(reverse("token_refresh"), {}, content_type="application/json")

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("access", response.json())
        self.assertNotIn("refresh", response.json())
        self.assertIn("mailflow_access", response.cookies)
