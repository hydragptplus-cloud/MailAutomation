import hashlib
import json
from base64 import urlsafe_b64encode
from urllib.parse import urlsplit

from bs4 import BeautifulSoup
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


CLICK_TOKEN_SALT = "mailflow.campaign-click.v1"
UNSUBSCRIBE_TOKEN_SALT = "mailflow.campaign-unsubscribe.v1"


def is_trackable_url(url):
    try:
        parsed = urlsplit(str(url).strip())
    except ValueError:
        return False
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        return False
    if parsed.username or parsed.password:
        return False
    return "unsubscribe" not in str(url).lower()


def _token_cipher():
    configured_key = getattr(settings, "FIELD_ENCRYPTION_KEY", "")
    if configured_key:
        return Fernet(configured_key.encode())
    fallback_key = urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
    return Fernet(fallback_key)


def _encrypt_token(payload):
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return _token_cipher().encrypt(raw).decode("ascii")


def _decrypt_token(token):
    try:
        return json.loads(_token_cipher().decrypt(str(token).encode("ascii")).decode("utf-8"))
    except (InvalidToken, UnicodeDecodeError, json.JSONDecodeError, ValueError, TypeError) as exc:
        raise ValueError("Invalid tracking token") from exc


def make_click_token(log_id, destination_url):
    return _encrypt_token({"kind": CLICK_TOKEN_SALT, "log_id": int(log_id), "url": str(destination_url)})


def read_click_token(token):
    payload = _decrypt_token(token)
    if payload.get("kind") != CLICK_TOKEN_SALT:
        raise ValueError("Invalid click token")
    log_id = int(payload["log_id"])
    destination_url = str(payload["url"])
    if not is_trackable_url(destination_url):
        raise ValueError("Unsafe tracking destination")
    return log_id, destination_url


def make_unsubscribe_token(log_id):
    return _encrypt_token({"kind": UNSUBSCRIBE_TOKEN_SALT, "log_id": int(log_id)})


def read_unsubscribe_token(token):
    payload = _decrypt_token(token)
    if payload.get("kind") != UNSUBSCRIBE_TOKEN_SALT:
        raise ValueError("Invalid unsubscribe token")
    return int(payload["log_id"])


def unsubscribe_url(log_id):
    tracking_base_url = str(getattr(settings, "TRACKING_BASE_URL", "")).rstrip("/")
    if not tracking_base_url:
        return ""
    return f"{tracking_base_url}/api/unsubscribe/{make_unsubscribe_token(log_id)}/"


def append_unsubscribe_footer(html, log_id, footer_text=""):
    url = unsubscribe_url(log_id)
    if not url:
        return html
    soup = BeautifulSoup(html or "", "html.parser")
    footer = soup.new_tag("div")
    footer["data-mailflow-unsubscribe"] = "true"
    footer["style"] = "margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.5;text-align:center"
    footer_text = str(footer_text or "You are receiving this email because you subscribed to this mailing list.").strip()
    footer.append(f"{footer_text} ")
    link = soup.new_tag("a", href=url)
    link["rel"] = "unsubscribe"
    link["data-no-track"] = "true"
    link.string = "Unsubscribe"
    footer.append(link)
    if soup.body:
        soup.body.append(footer)
    else:
        soup.append(footer)
    return str(soup)


def rewrite_tracked_links(html, log_id):
    tracking_base_url = str(getattr(settings, "TRACKING_BASE_URL", "")).rstrip("/")
    if not html or not tracking_base_url:
        return html

    soup = BeautifulSoup(html, "html.parser")
    for anchor in soup.find_all("a", href=True):
        destination_url = anchor.get("href", "").strip()
        rel = {str(value).lower() for value in (anchor.get("rel") or [])}
        if anchor.has_attr("data-no-track") or "unsubscribe" in rel or not is_trackable_url(destination_url):
            continue
        if destination_url.startswith(f"{tracking_base_url}/api/track/click/"):
            continue
        token = make_click_token(log_id, destination_url)
        anchor["href"] = f"{tracking_base_url}/api/track/click/{token}/"
    return str(soup)


def anonymized_ip_hash(ip_address):
    if not ip_address:
        return ""
    value = f"{settings.SECRET_KEY}:{ip_address}".encode("utf-8")
    return hashlib.sha256(value).hexdigest()
