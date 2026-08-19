import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def test_smtp(account, timeout=15):
    context = ssl.create_default_context()

    host = getattr(account, "host", None) or account.get("host")
    port = int(getattr(account, "port", None) or account.get("port") or 587)
    username = getattr(account, "username", None) or account.get("username")
    password = account.get_password() if hasattr(account, "get_password") else account.get("password", "")
    encryption = (getattr(account, "encryption", None) or account.get("encryption") or "tls").lower()

    if encryption == "ssl" or port == 465:
        server = smtplib.SMTP_SSL(host, port, timeout=timeout, context=context)
    else:
        server = smtplib.SMTP(host, port, timeout=timeout)
        server.ehlo()
        if encryption == "tls":
            server.starttls(context=context)
            server.ehlo()

    try:
        if username and password:
            server.login(username, password)
        return {"ok": True, "message": f"Successfully connected to SMTP server {host}:{port}"}
    except Exception:
        return {"ok": False, "message": "SMTP connection test failed."}
    finally:
        try:
            server.quit()
        except Exception:
            try:
                server.close()
            except Exception:
                pass

def send_test_mail(account, recipient_email, subject="Test Email from Mail Flow"):
    context = ssl.create_default_context()

    host = getattr(account, "host", None) or account.get("host")
    port = int(getattr(account, "port", None) or account.get("port") or 587)
    username = getattr(account, "username", None) or account.get("username")
    password = account.get_password() if hasattr(account, "get_password") else account.get("password", "")
    encryption = (getattr(account, "encryption", None) or account.get("encryption") or "tls").lower()
    from_email = getattr(account, "from_email", None) or account.get("from_email") or username
    from_name = getattr(account, "from_name", None) or account.get("from_name") or "Mail Flow"
    reply_to = getattr(account, "reply_to", None) or account.get("reply_to") or ""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = recipient_email
    if reply_to:
        msg["Reply-To"] = reply_to

    html_content = f"""
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #4f46e5;">SMTP Connection Successful!</h2>
        <p>This test email confirms that your SMTP Server (<b>{host}:{port}</b>) is correctly configured.</p>
        <p style="font-size: 12px; color: #777;">Sent via Mail Flow</p>
    </div>
    """
    msg.attach(MIMEText(html_content, "html"))

    if encryption == "ssl" or port == 465:
        server = smtplib.SMTP_SSL(host, port, timeout=15, context=context)
    else:
        server = smtplib.SMTP(host, port, timeout=15)
        server.ehlo()
        if encryption == "tls":
            server.starttls(context=context)
            server.ehlo()

    try:
        if username and password:
            server.login(username, password)
        server.sendmail(from_email, [recipient_email], msg.as_string())
        return {"ok": True, "message": f"Test email successfully delivered to {recipient_email}"}
    except Exception:
        return {"ok": False, "message": "Test email could not be delivered."}
    finally:
        try:
            server.quit()
        except Exception:
            try:
                server.close()
            except Exception:
                pass
