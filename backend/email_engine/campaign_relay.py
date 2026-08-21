import hashlib
import hmac
import json
import time

import requests
from django.conf import settings


_SAFE_STAGES = {"dns", "connect", "tls", "auth", "mail_from", "recipient", "data", "complete", "relay"}
_SAFE_CATEGORIES = {
    "dns_failed", "connection_failed", "tls_failed", "authentication_failed",
    "sender_rejected", "recipient_rejected", "message_rejected", "accepted", "relay_error",
}


def _safe_result(data, default_message):
    data = data if isinstance(data, dict) else {}
    stage = data.get("stage") if data.get("stage") in _SAFE_STAGES else "relay"
    category = data.get("category") if data.get("category") in _SAFE_CATEGORIES else "relay_error"
    code = data.get("smtp_code")
    if not isinstance(code, int) or code < 100 or code > 599:
        code = None
    provider_message_id = str(data.get("provider_message_id") or "")[:255]
    return {
        "ok": bool(data.get("ok")) and code == 250,
        "stage": stage,
        "category": category,
        "smtp_code": code,
        "provider_message_id": provider_message_id,
        "message": str(data.get("message") or default_message)[:300],
    }


def send_campaign_via_relay(
    account,
    *,
    request_id,
    recipient,
    recipient_name,
    subject,
    text,
    html,
    message_id,
):
    relay_url = getattr(settings, "MAIL_FLOW_CAMPAIGN_RELAY_URL", "")
    relay_secret = getattr(settings, "MAIL_FLOW_CAMPAIGN_RELAY_SECRET", "")
    if not relay_url or not relay_secret:
        return _safe_result({}, "Campaign relay is not configured.")

    timestamp = str(int(time.time()))
    payload = {
        "operation": "campaign_send",
        "request_id": str(request_id),
        "smtp": {
            "encryption": str(account.encryption).lower(),
            "from_email": str(account.from_email),
            "from_name": str(account.from_name or "Mail Flow"),
            "host": str(account.host),
            "password": str(account.get_password()),
            "port": int(account.port),
            "reply_to": str(account.reply_to or ""),
            "username": str(account.username),
        },
        "message": {
            "html": str(html),
            "message_id": str(message_id).strip("<>"),
            "recipient": str(recipient).strip().lower(),
            "recipient_name": str(recipient_name or ""),
            "subject": str(subject),
            "text": str(text),
        },
        "timestamp": timestamp,
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
            timeout=getattr(settings, "MAIL_FLOW_CAMPAIGN_RELAY_TIMEOUT", 30),
        )
        try:
            response_data = response.json()
        except ValueError:
            response_data = {}
        return _safe_result(response_data, "Campaign relay request failed.")
    except requests.RequestException:
        return _safe_result({}, "Campaign relay could not be reached.")
