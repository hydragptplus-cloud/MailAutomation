"""
Two-Factor Authentication (TOTP) utilities.

RFC 6238 compatible TOTP with QR code generation, backup codes,
and short-lived challenge tokens for the login step-up flow.
"""

import base64
import hashlib
import io
import secrets
import time

import pyotp
import qrcode
from django.conf import settings
from rest_framework_simplejwt.tokens import RefreshToken


# ── TOTP ─────────────────────────────────────────────────────────────

def generate_totp_secret() -> str:
    """Generate a random Base32 TOTP secret."""
    return pyotp.random_base32(length=32)


def get_totp_uri(user, secret: str) -> str:
    """Build an otpauth:// URI for authenticator app scanning."""
    issuer = getattr(settings, "TWO_FACTOR_ISSUER", "Mail Flow")
    return pyotp.totp.TOTP(secret).provisioning_uri(
        name=user.email,
        issuer_name=issuer,
    )


def generate_qr_code_base64(uri: str) -> str:
    """Return a data:image/png;base64,... string for the otpauth URI."""
    img = qrcode.make(uri, box_size=6, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{encoded}"


def verify_totp(secret: str, code: str) -> bool:
    """Verify a 6-digit TOTP code with ±1 window drift tolerance."""
    if not secret or not code:
        return False
    totp = pyotp.TOTP(secret)
    return totp.verify(code.strip(), valid_window=1)


# ── Backup codes ─────────────────────────────────────────────────────

def _hash_code(code: str) -> str:
    return hashlib.sha256(code.strip().lower().encode()).hexdigest()


def generate_backup_codes(count: int = 8):
    """
    Return (plain_codes, hashed_codes).
    plain_codes are shown once to the user; hashed_codes are stored.
    """
    plain = [secrets.token_hex(4).upper() for _ in range(count)]  # 8-char hex
    hashed = [_hash_code(c) for c in plain]
    return plain, hashed


def verify_and_consume_backup_code(user, code: str) -> bool:
    """
    If *code* matches a stored hashed backup code, consume it and return True.
    """
    h = _hash_code(code)
    codes: list = list(user.two_factor_backup_codes or [])
    if h in codes:
        codes.remove(h)
        user.two_factor_backup_codes = codes
        user.save(update_fields=["two_factor_backup_codes"])
        return True
    return False


# ── Challenge token (short-lived JWT for 2FA step-up) ────────────────

import datetime
from rest_framework_simplejwt.tokens import Token


class TwoFactorChallengeToken(Token):
    token_type = "2fa_challenge"
    lifetime = datetime.timedelta(minutes=5)


def create_challenge_token(user) -> str:
    """
    Create a short-lived token that proves the user passed password
    verification but still needs to provide a TOTP code.
    """
    token = TwoFactorChallengeToken.for_user(user)
    return str(token)


def verify_challenge_token(token: str):
    """
    Decode a challenge token and return the associated User, or None.
    """
    from users.models import User  # local import to avoid circular

    try:
        challenge = TwoFactorChallengeToken(token)
        user_id = challenge.get("user_id")
        if not user_id:
            return None
        return User.objects.get(pk=user_id, is_active=True)
    except Exception:
        return None

