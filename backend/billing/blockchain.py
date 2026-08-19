import base64
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from urllib.parse import unquote

import requests
from django.conf import settings

from .configuration import get_runtime_billing_configuration


TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"


class VerificationError(Exception):
    pass


@dataclass(frozen=True)
class VerifiedTransfer:
    transaction_hash: str
    transfer_index: int
    amount: Decimal
    amount_raw: int
    block_reference: str
    confirmations: int | None
    occurred_at: datetime
    raw: dict


def extract_transaction_hash(value, network):
    value = unquote((value or "").strip())
    if network in {"bsc", "ethereum"}:
        match = re.search(r"0x[a-fA-F0-9]{64}", value)
        if not match:
            raise VerificationError("Enter a valid 0x transaction hash or explorer link.")
        return match.group(0).lower()
    if network == "tron":
        matches = re.findall(r"(?<![a-fA-F0-9])[a-fA-F0-9]{64}(?![a-fA-F0-9])", value)
        if not matches:
            raise VerificationError("Enter a valid Tron transaction ID or explorer link.")
        return matches[-1].lower()
    candidate = value.rstrip("/").split("/")[-1].split("?")[0]
    if not re.fullmatch(r"[A-Za-z0-9_+\-/=]{43,64}", candidate):
        raise VerificationError("Enter a valid TON transaction hash or explorer link.")
    return candidate


def _rpc(url, method, params):
    if not url:
        raise VerificationError("This network RPC is not configured yet.")
    try:
        response = requests.post(url, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}, timeout=15)
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise VerificationError("The blockchain RPC is temporarily unavailable.") from exc
    if payload.get("error"):
        raise VerificationError("The blockchain RPC rejected the transaction lookup.")
    return payload.get("result")


def _typed_occurred_at(value, *, milliseconds=False):
    try:
        timestamp = int(value)
    except (TypeError, ValueError) as exc:
        raise VerificationError("The provider did not return a trustworthy transfer timestamp.") from exc
    if milliseconds or timestamp > 10_000_000_000:
        timestamp = timestamp / 1000
    if timestamp < 0:
        raise VerificationError("The provider returned an invalid transfer timestamp.")
    occurred_at = datetime.fromtimestamp(timestamp, tz=timezone.utc)
    if occurred_at > datetime.now(tz=timezone.utc) + timedelta(minutes=5):
        raise VerificationError("The provider returned an implausibly future transfer timestamp.")
    return occurred_at


def _verify_evm(invoice, tx_hash):
    is_bsc = invoice.network == "bsc"
    rpc_url = settings.BSC_RPC_URL if is_bsc else settings.ETH_RPC_URL
    required_confirmations = settings.PAYMENT_CONFIRMATIONS_BSC if is_bsc else settings.PAYMENT_CONFIRMATIONS_ETHEREUM
    receipt = _rpc(rpc_url, "eth_getTransactionReceipt", [tx_hash])
    if not receipt:
        raise VerificationError("Transaction was not found or is still pending.")
    if int(receipt.get("status", "0x0"), 16) != 1:
        raise VerificationError("The transaction failed on-chain.")
    block_number = int(receipt["blockNumber"], 16)
    latest = int(_rpc(rpc_url, "eth_blockNumber", []), 16)
    confirmations = latest - block_number + 1
    if confirmations < required_confirmations:
        raise VerificationError(f"Waiting for confirmations ({confirmations}/{required_confirmations}).")
    block = _rpc(rpc_url, "eth_getBlockByNumber", [receipt["blockNumber"], False])
    occurred_at = _typed_occurred_at(int(block["timestamp"], 16))
    if occurred_at < invoice.created_at - timedelta(minutes=2):
        raise VerificationError("This transaction predates the invoice.")

    target_contract = invoice.token_contract.lower()
    target_recipient = invoice.receiving_address.lower().removeprefix("0x")
    decimals = 18 if is_bsc else 6
    required_raw = int(invoice.amount_raw or (invoice.amount_usdt * (Decimal(10) ** decimals)))
    matches = []
    for log in receipt.get("logs", []):
        topics = [topic.lower() for topic in log.get("topics", [])]
        if log.get("address", "").lower() != target_contract or len(topics) < 3 or topics[0] != TRANSFER_TOPIC:
            continue
        recipient = topics[2][-40:]
        amount_raw = int(log.get("data", "0x0"), 16)
        if recipient == target_recipient:
            matches.append((int(log.get("logIndex", "0x0"), 16), Decimal(amount_raw) / (Decimal(10) ** decimals)))
    if not matches:
        raise VerificationError("No matching confirmed USDT transfer to the configured wallet was found.")
    index, amount = matches[0]
    amount_raw = int(amount * (Decimal(10) ** decimals))
    return VerifiedTransfer(tx_hash, index, amount, amount_raw, str(block_number), confirmations, occurred_at, {
        "block": block_number, "amount": str(amount), "amount_raw": str(amount_raw),
        "timestamp": int(occurred_at.timestamp()), "contract": invoice.token_contract, "destination": invoice.receiving_address,
    })


def _tron_headers():
    api_key = get_runtime_billing_configuration().tron_api_key
    return {"TRON-PRO-API-KEY": api_key} if api_key else {}


def _verify_tron(invoice, tx_hash):
    params = {
        "only_confirmed": "true",
        "contract_address": invoice.token_contract,
        "min_timestamp": int((invoice.created_at - timedelta(minutes=2)).timestamp() * 1000),
        "limit": 200,
    }
    url = f"{settings.TRON_API_URL.rstrip('/')}/v1/accounts/{invoice.receiving_address}/transactions/trc20"
    try:
        response = requests.get(url, params=params, headers=_tron_headers(), timeout=15)
        response.raise_for_status()
        transfers = response.json().get("data", [])
    except (requests.RequestException, ValueError) as exc:
        raise VerificationError("TronGrid is temporarily unavailable.") from exc
    transfer = next((item for item in transfers if item.get("transaction_id", "").lower() == tx_hash), None)
    if not transfer:
        raise VerificationError("No confirmed matching Tron USDT transfer was found.")
    token = transfer.get("token_info", {})
    if token.get("address") != invoice.token_contract or transfer.get("to") != invoice.receiving_address:
        raise VerificationError("The Tron token contract or recipient does not match this invoice.")
    decimals = int(token.get("decimals", 6))
    amount_raw = int(transfer.get("value", "0"))
    amount = Decimal(amount_raw) / (Decimal(10) ** decimals)
    occurred_at = _typed_occurred_at(transfer.get("block_timestamp"), milliseconds=True)
    return VerifiedTransfer(tx_hash, 0, amount, amount_raw, str(transfer.get("block_timestamp", "")), None, occurred_at, {
        "timestamp": int(occurred_at.timestamp()), "amount": str(amount), "amount_raw": str(amount_raw),
        "contract": invoice.token_contract, "destination": invoice.receiving_address,
    })


def _ton_hash_bytes(value):
    value = value.replace("-", "+").replace("_", "/")
    value += "=" * ((4 - len(value) % 4) % 4)
    try:
        return base64.b64decode(value).hex()
    except ValueError:
        return value.lower()


def _ton_address(value):
    value = (value or "").strip()
    if re.fullmatch(r"-?\d+:[A-Fa-f0-9]{64}", value):
        workchain, account = value.split(":", 1)
        return f"{int(workchain)}:{account.lower()}"
    normalized = value.replace("-", "+").replace("_", "/")
    normalized += "=" * ((4 - len(normalized) % 4) % 4)
    try:
        decoded = base64.b64decode(normalized)
        if len(decoded) != 36:
            return value
        workchain = int.from_bytes(decoded[1:2], "big", signed=True)
        return f"{workchain}:{decoded[2:34].hex()}"
    except ValueError:
        return value


def _verify_ton(invoice, tx_hash):
    params = {
        "owner_address": invoice.receiving_address,
        "direction": "in",
        "jetton_master": invoice.token_contract,
        "start_utime": int((invoice.created_at - timedelta(minutes=2)).timestamp()),
        "limit": 200,
        "sort": "desc",
    }
    api_key = get_runtime_billing_configuration().toncenter_api_key
    headers = {"X-API-Key": api_key} if api_key else {}
    try:
        response = requests.get(f"{settings.TONCENTER_API_URL.rstrip('/')}/jetton/transfers", params=params, headers=headers, timeout=15)
        response.raise_for_status()
        transfers = response.json().get("jetton_transfers", [])
    except (requests.RequestException, ValueError) as exc:
        raise VerificationError("TON Center is temporarily unavailable.") from exc
    wanted = _ton_hash_bytes(tx_hash)
    transfer = next((item for item in transfers if _ton_hash_bytes(item.get("transaction_hash", "")) == wanted), None)
    if not transfer:
        raise VerificationError("No matching finalized TON USDT Jetton transfer was found. Submit the recipient transaction hash.")
    if transfer.get("transaction_aborted"):
        raise VerificationError("The TON transaction was aborted.")
    if _ton_address(transfer.get("jetton_master")) != _ton_address(invoice.token_contract):
        raise VerificationError("The TON Jetton master is not the approved USDT contract.")
    destination = transfer.get("destination")
    if destination and _ton_address(destination) != _ton_address(invoice.receiving_address):
        raise VerificationError("The TON transfer recipient does not match this invoice.")
    amount_raw = int(transfer.get("amount", "0"))
    amount = Decimal(amount_raw) / Decimal(1_000_000)
    occurred_at = _typed_occurred_at(transfer.get("transaction_now") or transfer.get("utime"))
    return VerifiedTransfer(tx_hash, 0, amount, amount_raw, str(transfer.get("transaction_lt", "")), None, occurred_at, {
        "trace_id": transfer.get("trace_id"), "amount": str(amount), "amount_raw": str(amount_raw),
        "timestamp": int(occurred_at.timestamp()),
        "contract": invoice.token_contract, "destination": invoice.receiving_address,
    })


def verify_invoice_transfer(invoice, submitted_hash):
    if getattr(settings, "PAYMENT_REQUIRE_DUAL_PROVIDER", False):
        raise VerificationError("Automatic activation is disabled until this network has two certified verification providers.")
    tx_hash = extract_transaction_hash(submitted_hash, invoice.network)
    if invoice.network in {"bsc", "ethereum"}:
        return _verify_evm(invoice, tx_hash)
    if invoice.network == "tron":
        return _verify_tron(invoice, tx_hash)
    return _verify_ton(invoice, tx_hash)
