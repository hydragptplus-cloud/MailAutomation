import hashlib
import hmac
import json
import time
import uuid

import requests
from django.conf import settings


_SAFE_STAGES = {"dns", "connect", "tls", "auth", "mail_from", "recipient", "data", "complete", "relay"}
_SAFE_CATEGORIES = {
    "dns_failed", "connection_failed", "tls_failed", "authentication_failed",
    "sender_rejected", "recipient_rejected", "message_rejected", "accepted", "relay_error",
}


def _account_value(account, name, default=""):
    value = getattr(account, name, None)
    if value is None and isinstance(account, dict):
        value = account.get(name)
    return default if value is None else value


def _safe_result(data, *, default_message):
    data = data if isinstance(data, dict) else {}
    stage = data.get("stage") if data.get("stage") in _SAFE_STAGES else "relay"
    category = data.get("category") if data.get("category") in _SAFE_CATEGORIES else "relay_error"
    code = data.get("smtp_code")
    if not isinstance(code, int) or code < 100 or code > 599:
        code = None
    return {
        "ok": bool(data.get("ok")),
        "dns": bool(data.get("dns")),
        "connection": bool(data.get("connection")),
        "tls": bool(data.get("tls")),
        "auth": bool(data.get("auth")),
        "stage": stage,
        "category": category,
        "smtp_code": code,
        "message": str(data.get("message") or default_message)[:300],
    }


def _relay_request(account, operation, *, recipient_email="", subject="", message=""):
    relay_url = getattr(settings, "MAIL_FLOW_SMTP_TEST_RELAY_URL", "")
    relay_secret = getattr(settings, "MAIL_FLOW_SMTP_TEST_RELAY_SECRET", "")
    if not relay_url or not relay_secret:
        return _safe_result({}, default_message="SMTP test relay is not configured.")

    password = account.get_password() if hasattr(account, "get_password") else _account_value(account, "password")
    timestamp = str(int(time.time()))
    payload = {
        "operation": operation,
        "request_id": str(uuid.uuid4()),
        "smtp": {
            "encryption": str(_account_value(account, "encryption", "tls")).lower(),
            "from_email": str(_account_value(account, "from_email")),
            "from_name": str(_account_value(account, "from_name", "Mail Flow")),
            "host": str(_account_value(account, "host")),
            "password": str(password),
            "port": int(_account_value(account, "port", 587)),
            "reply_to": str(_account_value(account, "reply_to")),
            "username": str(_account_value(account, "username")),
        },
        "timestamp": timestamp,
    }
    if operation == "send_test":
        payload["message"] = {
            "body": str(message),
            "recipient": str(recipient_email).strip().lower(),
            "subject": str(subject),
        }

    raw_body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    signature = hmac.new(relay_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    try:
        response = requests.post(
            relay_url,
            data=raw_body,
            headers={
                "Content-Type": "application/json",
                "X-Mail-Flow-Signature": signature,
                "X-Mail-Flow-Timestamp": timestamp,
            },
            timeout=getattr(settings, "MAIL_FLOW_SMTP_TEST_RELAY_TIMEOUT", 25),
        )
        try:
            response_data = response.json()
        except ValueError:
            response_data = {}
        return _safe_result(response_data, default_message="SMTP test relay request failed.")
    except requests.RequestException:
        return _safe_result({}, default_message="SMTP test relay could not be reached.")


def test_smtp(account, timeout=15):
    del timeout
    return _relay_request(account, "connection_test")


def send_test_mail(account, recipient_email, subject="Test Email from Mail Flow", message="This is a test email sent from Mail Flow."):
    return _relay_request(
        account,
        "send_test",
        recipient_email=recipient_email,
        subject=subject,
        message=message,
    )
