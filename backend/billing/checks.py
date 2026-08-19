import base64
import binascii
import hashlib
import re
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.core.checks import Error, register


BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def _valid_tron_address(value):
    try:
        number = 0
        for char in value:
            number = number * 58 + BASE58_ALPHABET.index(char)
        decoded = number.to_bytes(25, "big")
        return decoded[0] == 0x41 and hashlib.sha256(hashlib.sha256(decoded[:21]).digest()).digest()[:4] == decoded[21:]
    except (ValueError, OverflowError):
        return False


def _valid_ton_address(value):
    try:
        normalized = value.replace("-", "+").replace("_", "/")
        normalized += "=" * ((4 - len(normalized) % 4) % 4)
        decoded = base64.b64decode(normalized)
        return len(decoded) == 36 and binascii.crc_hqx(decoded[:34], 0).to_bytes(2, "big") == decoded[34:]
    except (ValueError, binascii.Error):
        return False


@register()
def billing_configuration_check(app_configs, **kwargs):
    errors = []
    evm = re.compile(r"^0x[a-fA-F0-9]{40}$")
    if not evm.fullmatch(settings.PAYMENT_EVM_WALLET):
        errors.append(Error("PAYMENT_EVM_WALLET is not a valid EVM address.", id="billing.E001"))
    if not evm.fullmatch(settings.USDT_ETH_CONTRACT) or not evm.fullmatch(settings.USDT_BSC_CONTRACT):
        errors.append(Error("The Ethereum/BSC USDT contract allow-list is invalid.", id="billing.E002"))
    if not _valid_tron_address(settings.PAYMENT_TRON_WALLET) or not _valid_tron_address(settings.USDT_TRON_CONTRACT):
        errors.append(Error("The Tron wallet or USDT contract address is invalid.", id="billing.E003"))
    if not _valid_ton_address(settings.PAYMENT_TON_WALLET) or not _valid_ton_address(settings.USDT_TON_MASTER):
        errors.append(Error("The TON wallet or USDT master address is invalid.", id="billing.E004"))
    try:
        if Decimal(settings.USDT_BDT_RATE) <= 0:
            raise InvalidOperation
    except (InvalidOperation, ValueError):
        errors.append(Error("USDT_BDT_RATE must be a positive decimal value.", id="billing.E005"))
    return errors
