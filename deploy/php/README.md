# SMTP test relay deployment

Upload `mailflow-smtp-test-relay.php` beside the existing public
`mailflow-otp-relay.php`. It intentionally loads the same private
`../mailflow-config.php` file.

Optionally add a separate secret to the private config:

```php
const MAILFLOW_SMTP_TEST_RELAY_SECRET = 'a-long-random-secret';
```

If omitted, the endpoint uses the existing `MAILFLOW_RELAY_SECRET`.

Configure the Railway backend with:

```text
MAIL_FLOW_SMTP_TEST_RELAY_URL=https://your-domain.example/mailflow-smtp-test-relay.php
MAIL_FLOW_SMTP_TEST_RELAY_SECRET=the-same-secret-as-the-php-config
MAIL_FLOW_SMTP_TEST_RELAY_TIMEOUT=25
```

The endpoint accepts only signed, short-lived connection and test-email
requests. It permits SMTP ports 25, 465, 587, and 2525 and rejects private or
reserved network targets.

## Campaign relay deployment

`mailflow-campaign-relay.php` is a separate endpoint for production campaign
delivery. It does not alter or share operations with the SMTP test relay.

Add a dedicated secret to the private `mailflow-config.php` file:

```php
const MAILFLOW_CAMPAIGN_RELAY_SECRET = 'a-different-long-random-secret';
```

The endpoint accepts only signed, short-lived `campaign_send` requests. Each
request must include a stable request ID and Message-ID, SMTP configuration,
recipient, subject, plain-text fallback, and HTML content. The endpoint permits
SMTP ports 25, 465, 587, and 2525 and rejects private or reserved targets.

Configure the Django campaign workers with:

```text
MAIL_FLOW_CAMPAIGN_RELAY_URL=https://your-domain.example/mailflow-campaign-relay.php
MAIL_FLOW_CAMPAIGN_RELAY_SECRET=the-same-campaign-secret-as-the-php-config
MAIL_FLOW_CAMPAIGN_RELAY_TIMEOUT=30
```

Campaign workers try their direct SMTP connection first and call this endpoint
only when direct delivery fails.
