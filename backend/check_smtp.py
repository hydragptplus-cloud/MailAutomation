#!/usr/bin/env python
"""Diagnose the SMTP configuration used by Django and the Celery worker."""

import argparse
import hashlib
import hmac
import json
import os
import socket
import smtplib
import ssl
import sys
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--send-to",
        help="Send a diagnostic email to this address after SMTP authentication.",
    )
    parser.add_argument(
        "--direct-smtp",
        action="store_true",
        help="Force a direct SMTP test instead of the configured HTTPS OTP relay.",
    )
    args = parser.parse_args()

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    import django

    django.setup()

    from django.conf import settings
    from django.core.mail import send_mail
    import requests

    relay_url = getattr(settings, "MAIL_FLOW_OTP_RELAY_URL", "")
    relay_secret = getattr(settings, "MAIL_FLOW_OTP_RELAY_SECRET", "")
    print(f"OTP relay configured: {bool(relay_url and relay_secret)}")
    if relay_url:
        print(f"OTP relay URL: {relay_url}")
    if relay_url and relay_secret and not args.direct_smtp:
        print("Direct SMTP check skipped because OTP relay is configured.")
        if not args.send_to:
            print("Run with --send-to you@example.com to send a test OTP through the relay.")
            return 0

        body = {
            "email": args.send_to,
            "code": "123456",
            "timestamp": str(int(time.time())),
        }
        signed_payload = json.dumps(body, separators=(",", ":"), sort_keys=True)
        signature = hmac.new(relay_secret.encode(), signed_payload.encode(), hashlib.sha256).hexdigest()
        try:
            response = requests.post(
                relay_url,
                json=body,
                headers={
                    "X-Mail-Flow-Signature": signature,
                    "X-Mail-Flow-Timestamp": body["timestamp"],
                },
                timeout=getattr(settings, "MAIL_FLOW_OTP_RELAY_TIMEOUT", 10),
            )
            print(f"OTP relay status: {response.status_code}")
            print(f"OTP relay response: {response.text[:500]}")
            response.raise_for_status()
            print(f"Diagnostic OTP sent through relay to: {args.send_to}")
            return 0
        except Exception as exc:
            print(f"OTP relay diagnostic failed: {type(exc).__name__}: {exc}", file=sys.stderr)
            return 1

    host = settings.EMAIL_HOST
    port = int(settings.EMAIL_PORT)
    use_ssl = bool(settings.EMAIL_USE_SSL)
    use_tls = bool(settings.EMAIL_USE_TLS)
    username = settings.EMAIL_HOST_USER

    print(f"SMTP host: {host}")
    print(f"SMTP port: {port}")
    print(f"SMTP TLS: {use_tls}")
    print(f"SMTP SSL: {use_ssl}")
    print(f"SMTP username: {username}")
    print(f"SMTP password configured: {bool(settings.EMAIL_HOST_PASSWORD)}")

    if use_ssl and use_tls:
        raise RuntimeError("EMAIL_USE_SSL and EMAIL_USE_TLS cannot both be enabled.")

    addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    print(f"DNS addresses: {len(addresses)}")

    smtp = None
    try:
        if use_ssl:
            smtp = smtplib.SMTP_SSL(host, port, timeout=15, context=ssl.create_default_context())
        else:
            smtp = smtplib.SMTP(host, port, timeout=15)
        smtp.ehlo()
        print("TCP/SMTP connection: OK")

        if use_tls:
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
            print("STARTTLS: OK")

        if username:
            smtp.login(username, settings.EMAIL_HOST_PASSWORD)
            print("SMTP authentication: OK")

        if args.send_to:
            smtp.quit()
            smtp = None
            send_mail(
                "Mail Flow SMTP diagnostic",
                "This is a diagnostic message from the Mail Flow worker environment.",
                settings.DEFAULT_FROM_EMAIL,
                [args.send_to],
                fail_silently=False,
            )
            print(f"Diagnostic email sent to: {args.send_to}")
    except Exception as exc:
        print(f"SMTP diagnostic failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    finally:
        if smtp is not None:
            try:
                smtp.quit()
            except Exception:
                smtp.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
