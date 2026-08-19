#!/usr/bin/env python
"""Diagnose the SMTP configuration used by Django and the Celery worker."""

import argparse
import os
import socket
import smtplib
import ssl
import sys



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--send-to",
        help="Send a diagnostic email to this address after SMTP authentication.",
    )
    args = parser.parse_args()

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    import django

    django.setup()

    from django.conf import settings
    from django.core.mail import send_mail

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
