import hashlib
from base64 import urlsafe_b64encode
from dataclasses import dataclass
from decimal import Decimal

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings

from common.models import BillingConfiguration


def _fernet():
    key = getattr(settings, "FIELD_ENCRYPTION_KEY", None)
    if not key:
        key = urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest()).decode()
    return Fernet(key.encode())


def encrypt_billing_secret(value):
    return _fernet().encrypt(value.encode()).decode() if value else ""


def decrypt_billing_secret(value):
    if not value:
        return ""
    try:
        return _fernet().decrypt(value.encode()).decode()
    except (InvalidToken, ValueError, TypeError):
        return ""


def get_billing_configuration():
    defaults = {
        "usdt_bdt_rate": Decimal(settings.USDT_BDT_RATE),
        "payment_evm_wallet": settings.PAYMENT_EVM_WALLET,
        "payment_tron_wallet": settings.PAYMENT_TRON_WALLET,
        "payment_ton_wallet": settings.PAYMENT_TON_WALLET,
        "encrypted_tron_api_key": encrypt_billing_secret(settings.TRON_API_KEY),
        "encrypted_toncenter_api_key": encrypt_billing_secret(settings.TONCENTER_API_KEY),
    }
    return BillingConfiguration.objects.get_or_create(pk=1, defaults=defaults)[0]


@dataclass(frozen=True)
class RuntimeBillingConfiguration:
    usdt_bdt_rate: Decimal
    payment_evm_wallet: str
    payment_tron_wallet: str
    payment_ton_wallet: str
    tron_api_key: str
    toncenter_api_key: str


def get_runtime_billing_configuration():
    config = get_billing_configuration()
    return RuntimeBillingConfiguration(
        usdt_bdt_rate=config.usdt_bdt_rate,
        payment_evm_wallet=config.payment_evm_wallet,
        payment_tron_wallet=config.payment_tron_wallet,
        payment_ton_wallet=config.payment_ton_wallet,
        tron_api_key=decrypt_billing_secret(config.encrypted_tron_api_key),
        toncenter_api_key=decrypt_billing_secret(config.encrypted_toncenter_api_key),
    )
