# Mail Flow Deployment Guide

This guide explains where to host Mail Flow and what must change before the project is safe to run as a real SaaS product.

Mail Flow is a multi-service application:

```text
Browser -> Vercel HTTPS frontend
Browser -> Railway HTTPS backend /api/*
Django API -> PostgreSQL
Django API -> Redis -> Celery worker
Celery Beat -> scheduled campaign dispatch + invoice expiry
Django/Celery -> customer SMTP servers + billing email SMTP
Django API -> blockchain RPC/API providers for USDT verification
```

The app should not be deployed as only a static frontend plus a single web process. Campaign sending, scheduled launches, invoice expiry, quota enforcement, and billing email delivery all depend on the backend, Redis, Celery worker, and Celery Beat running from the same release.

## Recommended Hosting

Use Railway for the backend stack and Vercel for the React/Vite frontend.

### Primary Production Choice: Railway + Vercel

This is the recommended live setup:

```text
Vercel project:
- React/Vite frontend from frontend/

Railway project:
- Django backend web service
- Celery worker service
- Celery Beat service
- PostgreSQL database
- Redis service
```

Railway is a good fit because this app needs long-running worker processes, Redis, PostgreSQL, and a Django API. Vercel is a good fit for the static React/Vite frontend.

The production request flow is:

```text
Browser -> Vercel frontend -> Railway Django API
Railway Django API -> Railway PostgreSQL
Railway Django API -> Railway Redis -> Railway Celery worker
Railway Celery Beat -> Railway Redis -> scheduled campaign and invoice jobs
```

Do not deploy only the Django backend service. Mail Flow needs the Celery worker and exactly one Celery Beat process for production behavior.

### Optional Alternative: VPS with Docker Compose

The repository also includes `docker-compose.prod.yml`, so a Linux VPS remains a valid alternative. Use it only if you want to manage Docker, TLS, backups, Nginx, PostgreSQL, and Redis yourself.

Good VPS providers:

- DigitalOcean Droplet
- Hetzner Cloud
- Vultr
- AWS Lightsail

For this launch, Railway + Vercel is simpler operationally.

### Frontend-Only Hosts

Vercel, Netlify, and Cloudflare Pages can host the React/Vite frontend, but they do not replace the Django API, PostgreSQL, Redis, Celery worker, and Celery Beat. If you use one of these for the frontend, keep the backend stack on a VPS/PaaS and set `VITE_API_URL` to the backend API URL.

For this plan, Vercel is the frontend host:

```text
https://mailflow.example.com/
https://your-railway-backend.up.railway.app/api/
https://your-railway-backend.up.railway.app/admin/
```

## Repository Layout

```text
.
├── backend/
│   ├── config/settings.py
│   ├── config/urls.py
│   ├── docker-entrypoint.sh
│   ├── billing/
│   ├── campaigns/
│   └── users/
├── frontend/
│   ├── src/
│   ├── nginx.conf
│   ├── package.json
│   └── Dockerfile.prod
├── deploy/
│   └── nginx/mailflow.conf
├── docker-compose.prod.yml
├── requirements.txt
├── .env.example
├── PRODUCTION_DEPLOYMENT.md
└── DEPLOYMENT.md
```

## Required Production URLs

Replace these placeholders with the real domains:

```text
FRONTEND_URL=https://mailflow.example.com
BACKEND_URL=https://your-railway-backend.up.railway.app
API_URL=https://your-railway-backend.up.railway.app/api
ADMIN_URL=https://your-railway-backend.up.railway.app/admin/
```

If you attach custom domains, use:

```text
FRONTEND_URL=https://mailflow.example.com
API_URL=https://api.mailflow.example.com/api
ADMIN_URL=https://api.mailflow.example.com/admin/
```

The frontend codebase variable is `VITE_API_URL`. Set it in Vercel to the final API URL:

```text
VITE_API_URL=https://your-railway-backend.up.railway.app/api
```

If you later add a custom backend domain, update it and redeploy Vercel:

```text
VITE_API_URL=https://api.mailflow.example.com/api
```

## Production Changes Before Launch

These are the changes that matter before going live.

### 1. Add Real HTTPS

Railway and Vercel provide HTTPS on their generated domains. Use those for staging and first smoke tests.

For final production, attach custom domains:

```text
Vercel frontend: https://mailflow.example.com
Railway backend: https://api.mailflow.example.com
```

After custom domains are attached, update Railway and Vercel env vars to use the final HTTPS origins. Keep `DJANGO_DEBUG=0`, secure cookies enabled, and HSTS enabled.

### 2. Serve Static and Media Correctly

The current Django URL config serves media only when `DJANGO_DEBUG=1`. In Railway production, `DJANGO_DEBUG=0`, so `/media/` will not be served by Django's development helper.

The same applies to Django admin/static files. `STATIC_ROOT` is configured, but production needs `collectstatic` plus a production static-file strategy.

Use this production storage plan:

```text
WhiteNoise: Django admin/static files from collected staticfiles.
Vercel Blob: uploaded files/images/assets that must survive redeploys and may be served back to the browser.
Railway volume: optional internal persistent storage for non-public operational files, if needed.
```

For a Railway + Vercel launch, the cleanest target is:

```text
Frontend assets: Vercel
Django admin static: WhiteNoise
Uploaded images/files: Vercel Blob
Temporary imports/processing files: Railway ephemeral disk or optional Railway volume
```

Do not rely on Django development static/media serving in production.

Implemented code path:

```text
requirements.txt includes whitenoise and vercel-blob.
backend/config/settings.py adds WhiteNoiseMiddleware after SecurityMiddleware.
backend/config/settings.py configures STORAGES for WhiteNoise static files.
backend/config/settings.py uses Vercel Blob media storage when MEDIA_STORAGE_BACKEND=vercel_blob.
backend/common/storage.py provides VercelBlobStorage.
backend/start.py runs collectstatic, runs migrate, then starts gunicorn on $PORT.
Railway backend start command: python start.py.
```

### 3. Set the Frontend API URL at Build Time

The frontend reads:

```text
VITE_API_URL
```

If it is missing, the browser falls back to:

```text
http://localhost:8000/api
```

For Railway + Vercel, build with:

```text
VITE_API_URL=https://your-railway-backend.up.railway.app/api
```

Because Vite replaces `import.meta.env` values during build, changing `VITE_API_URL` after the frontend image is built is not enough. Rebuild and redeploy the frontend image after changing it.

### 4. Use Production Secrets

Create the production values in Railway and Vercel environment variables. If you also keep a local `.env.production` for Docker verification, do not commit it.

Required:

```text
DJANGO_ENV=production
DJANGO_DEBUG=0
DJANGO_SECRET_KEY=replace-with-long-random-secret
DJANGO_ALLOWED_HOSTS=your-railway-backend.up.railway.app,api.mailflow.example.com
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
CACHE_REDIS_URL=${{Redis.REDIS_URL}}
CACHE_KEY_PREFIX=mailflow
CORS_ALLOWED_ORIGINS=https://mailflow.example.com,https://your-vercel-app.vercel.app
CSRF_TRUSTED_ORIGINS=https://mailflow.example.com,https://your-vercel-app.vercel.app
FRONTEND_URL=https://mailflow.example.com
FIELD_ENCRYPTION_KEY=replace-with-fernet-key
SECURE_HSTS_SECONDS=31536000
TRUST_X_FORWARDED_FOR=1
```

Generate `FIELD_ENCRYPTION_KEY` once and keep it permanently unless you run a controlled credential rotation:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Do not rotate `FIELD_ENCRYPTION_KEY` casually. Existing SMTP passwords and payment access codes depend on it.

### 5. Configure Real Email Delivery

Mail Flow uses email for billing invoice links, payment confirmations, recovery links, and customer campaigns.

Set a real transactional SMTP provider for platform/billing email:

```text
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_HOST_USER=replace-with-smtp-user
EMAIL_HOST_PASSWORD=replace-with-smtp-password
EMAIL_USE_TLS=1
EMAIL_USE_SSL=0
MAIL_FLOW_SENDER_NAME=Mail Flow Billing
MAIL_FLOW_SENDER_EMAIL=billing@yourdomain.com
MAIL_FLOW_REPLY_TO=support@yourdomain.com
```

Also configure DNS for the sending domain:

```text
SPF
DKIM
DMARC
Return-path/bounce domain, if supported by the provider
```

Before a public launch, add or confirm unsubscribe handling, global suppression lists, consent capture, bounce/complaint handling, and jurisdiction-specific compliance rules. The README already marks these as required production controls.

### 6. Configure Cloudflare Turnstile

Paid checkout email verification uses Cloudflare Turnstile.

Frontend build-time value:

```text
VITE_TURNSTILE_SITE_KEY=replace-with-public-site-key
```

Backend runtime values:

```text
TURNSTILE_SECRET_KEY=replace-with-secret-key
TURNSTILE_EXPECTED_HOSTNAME=mailflow.example.com
TURNSTILE_CHECKOUT_ACTION=checkout
```

If `TURNSTILE_SECRET_KEY` is missing in production, paid checkout email verification will fail.

### 7. Keep bKash Out of Initial Production

bKash should not be enabled for this launch unless merchant onboarding and credentials are complete.

Current production payment flow is direct USDT invoice verification. Future bKash work should verify Execute/Query Payment server-side, provision atomically, and be idempotent. Do not present bKash as a live payment option until those pieces exist and credentials are tested.

### 8. Enable USDT Networks One at a Time

In production, all payment networks default to disabled. Enable only networks that have been tested with the real provider:

```text
PAYMENT_NETWORK_BSC_ENABLED=1
PAYMENT_NETWORK_ETHEREUM_ENABLED=0
PAYMENT_NETWORK_TRON_ENABLED=0
PAYMENT_NETWORK_TON_ENABLED=0
```

Set the public receiving wallets and token/master contract allow-list:

```text
PAYMENT_EVM_WALLET=0x...
PAYMENT_TRON_WALLET=T...
PAYMENT_TON_WALLET=UQ...
USDT_ETH_CONTRACT=0xdAC17F958D2ee523a2206206994597C13D831ec7
USDT_BSC_CONTRACT=0x55d398326f99059fF775485246999027B3197955
USDT_TRON_CONTRACT=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
USDT_TON_MASTER=EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs
USDT_BDT_RATE=122.0000
PAYMENT_QUOTE_MINUTES=30
```

Provider settings:

```text
BSC_RPC_URL=https://...
ETH_RPC_URL=https://...
TRON_API_URL=https://api.trongrid.io
TRON_API_KEY=replace-if-required
TONCENTER_API_URL=https://toncenter.com/api/v3
TONCENTER_API_KEY=replace-if-required
PAYMENT_CONFIRMATIONS_BSC=12
PAYMENT_CONFIRMATIONS_ETHEREUM=12
PAYMENT_CONFIRMATIONS_TRON=20
PAYMENT_CONFIRMATIONS_TON=20
PAYMENT_REQUIRE_DUAL_PROVIDER=0
```

Use paid/reliable RPC providers for live payments. Public free endpoints are acceptable for development, but they are not enough for production availability.

### 9. Fix Production Static Collection

The current `backend/docker-entrypoint.sh` runs migrations but not `collectstatic`.

Use the same pattern as the PyLearn backend: add `backend/start.py` and make Railway run it.

```python
import os

import django
from django.core.management import call_command

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

call_command("collectstatic", interactive=False, verbosity=1)
call_command("migrate", interactive=False, verbosity=1)

port = os.getenv("PORT", "8000")
os.execvp(
    "gunicorn",
    [
        "gunicorn",
        "config.wsgi:application",
        "--bind",
        f"0.0.0.0:{port}",
        "--workers",
        "3",
    ],
)
```

Only the Railway backend web service should run migrations per release. Celery worker and Celery Beat must keep `SKIP_MIGRATIONS=1`.

### 10. Add Backups and Observability

Production needs:

```text
Railway PostgreSQL backups
Backup restore test before launch
Vercel Blob file retention and access policy review
Persistent Railway volume backup, only if a volume is used
Railway and Vercel runtime logs
Backend, worker, Redis, and PostgreSQL monitoring
Alerts for failed Celery workers, failed invoice verification, and email send failures
```

## Railway Deployment

Create one Railway project for the backend stack.

### 1. Push the Repository

Push the repository to GitHub. Railway and Vercel should deploy from the same production branch.

### 2. Add PostgreSQL

In Railway, add a PostgreSQL service.

Use the Railway-provided database URL as this codebase variable:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

Do not use SQLite in production.

### 3. Add Redis

Add a Redis service in the same Railway project.

Use the Railway-provided Redis URL as these codebase variables:

```text
REDIS_URL=${{Redis.REDIS_URL}}
CACHE_REDIS_URL=${{Redis.REDIS_URL}}
CACHE_KEY_PREFIX=mailflow
```

`REDIS_URL` is used by Celery. `CACHE_REDIS_URL` is used by Django's cache backend.

### 4. Create the Backend Web Service

Create a Railway service from the GitHub repository.

Use the repository root if Railway builds with `backend/Dockerfile.prod`. If using Nixpacks/build commands instead, make sure it installs the root `requirements.txt` and runs Django from `backend/`.

Recommended Docker settings:

```text
Dockerfile path: backend/Dockerfile.prod
Start command: gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 3
```

If Railway does not override the Docker `CMD`, the current Dockerfile binds to port `8000`. For Railway, prefer the `$PORT` start command above.

Build or deploy command must include static collection before launch:

```bash
python manage.py collectstatic --noinput
python manage.py migrate
```

The current `backend/docker-entrypoint.sh` runs `migrate` but does not run `collectstatic`, so add `collectstatic` through the Railway deploy command or update the entrypoint before relying on Django admin styling.

### 5. Backend Web Service Variables

Set these on the Railway backend web service:

```text
DJANGO_ENV=production
DJANGO_DEBUG=0
DJANGO_SECRET_KEY=replace-with-long-random-secret
DJANGO_ALLOWED_HOSTS=your-railway-backend.up.railway.app,api.mailflow.example.com
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
CACHE_REDIS_URL=${{Redis.REDIS_URL}}
CACHE_KEY_PREFIX=mailflow
CORS_ALLOWED_ORIGINS=https://your-vercel-app.vercel.app,https://mailflow.example.com
CSRF_TRUSTED_ORIGINS=https://your-vercel-app.vercel.app,https://mailflow.example.com
FRONTEND_URL=https://your-vercel-app.vercel.app
FIELD_ENCRYPTION_KEY=replace-with-fernet-key
SECURE_HSTS_SECONDS=31536000
TRUST_X_FORWARDED_FOR=1
CHECKOUT_SESSION_COOKIE_NAME=mailflow_checkout
PRECHECKOUT_SESSION_COOKIE_NAME=mailflow_precheckout
CHECKOUT_SESSION_COOKIE_SECURE=1
```

After the final Vercel custom domain is attached, update:

```text
CORS_ALLOWED_ORIGINS=https://mailflow.example.com
CSRF_TRUSTED_ORIGINS=https://mailflow.example.com
FRONTEND_URL=https://mailflow.example.com
```

Keep the Vercel preview/generated URL only if you intentionally allow that deployment to call production.

### 6. Create the Celery Worker Service

Create a second Railway service from the same repository and same release.

Use the same backend Dockerfile or backend runtime, but set the start command to:

```bash
celery -A config worker -l INFO --concurrency=4
```

#### Two-service free-tier option

If the plan allows only two application services, use one backend service and one combined Celery service. Replace the worker command above with:

```bash
celery -A config worker --beat -l INFO --concurrency=4
```

The `--beat` flag runs the scheduler inside the worker process. This combined service handles checkout OTP tasks, campaign email tasks, and scheduled jobs. Use this option instead of creating a separate Celery Beat service.

This worker service is required for checkout OTP delivery as well as campaign email delivery. Redeploy it whenever backend task code changes; deploying only the web service or Celery Beat does not update the worker's registered task list.

After deployment, run this command in the worker service or Railway shell:

```bash
celery -A config inspect registered
```

The output must include:

```text
billing.tasks.send_checkout_otp_email
```

Set all backend runtime variables on this service too, plus:

```text
SKIP_MIGRATIONS=1
```

The worker must share the same `DATABASE_URL`, `REDIS_URL`, `FIELD_ENCRYPTION_KEY`, email settings, and payment settings as the backend.

### 7. Create the Celery Beat Service

For the standard three-service deployment, create a third Railway service from the same repository and same release.

For the two-service free-tier deployment, do not create this service. The worker must use `celery -A config worker --beat -l INFO --concurrency=4` instead.

Start command:

```bash
celery -A config beat -l INFO
```

Set all backend runtime variables on this service too, plus:

```text
SKIP_MIGRATIONS=1
```

Run exactly one Celery Beat service. Multiple Beat services can duplicate scheduled campaign dispatch and invoice expiry.

Celery Beat only publishes scheduled jobs. It does not send checkout OTP emails and must not replace the Celery Worker service.

### 8. Configure Railway Custom Domain

Use Railway's generated domain for first smoke tests:

```text
https://your-railway-backend.up.railway.app
```

Then attach:

```text
https://api.mailflow.example.com
```

After attaching the custom backend domain, update both Railway and Vercel variables:

```text
DJANGO_ALLOWED_HOSTS=your-railway-backend.up.railway.app,api.mailflow.example.com
VITE_API_URL=https://api.mailflow.example.com/api
```

Redeploy both sides after the variable changes.

### 9. Run One-Time Owner Bootstrap

Set:

```text
DJANGO_SUPERUSER_USERNAME=admin
DJANGO_SUPERUSER_EMAIL=admin@yourdomain.com
DJANGO_SUPERUSER_PASSWORD=replace-with-strong-temporary-password
```

Run on the Railway backend service:

```bash
python manage.py bootstrap_owner --username admin --email admin@yourdomain.com
```

After the first successful login, rotate or remove `DJANGO_SUPERUSER_PASSWORD`.

## Vercel Deployment

Create one Vercel project for `frontend/`.

### 1. Project Settings

Import the same GitHub repository.

Use these Vercel settings:

```text
Framework Preset: Vite
Root Directory: frontend
Install Command: npm ci
Build Command: npm run build
Output Directory: dist
```

### 2. Frontend Environment Variables

Set these in Vercel before the production build:

```text
VITE_API_URL=https://your-railway-backend.up.railway.app/api
VITE_TURNSTILE_SITE_KEY=replace-with-public-turnstile-site-key
```

After Railway has a custom API domain, change to:

```text
VITE_API_URL=https://api.mailflow.example.com/api
```

Then redeploy Vercel. Vite env values are compiled into the frontend bundle at build time.

### 3. Vercel Custom Domain

Attach:

```text
https://mailflow.example.com
```

After the custom domain works, update Railway:

```text
CORS_ALLOWED_ORIGINS=https://mailflow.example.com
CSRF_TRUSTED_ORIGINS=https://mailflow.example.com
FRONTEND_URL=https://mailflow.example.com
TURNSTILE_EXPECTED_HOSTNAME=mailflow.example.com
```

## Production Environment Reference

Backend runtime:

```text
DJANGO_ENV=production
DJANGO_DEBUG=0
DJANGO_SECRET_KEY=
DJANGO_ALLOWED_HOSTS=your-railway-backend.up.railway.app,api.mailflow.example.com
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
CACHE_REDIS_URL=${{Redis.REDIS_URL}}
CACHE_KEY_PREFIX=mailflow
CORS_ALLOWED_ORIGINS=https://your-vercel-app.vercel.app,https://mailflow.example.com
CSRF_TRUSTED_ORIGINS=https://your-vercel-app.vercel.app,https://mailflow.example.com
FRONTEND_URL=https://mailflow.example.com
FIELD_ENCRYPTION_KEY=
MEDIA_STORAGE_BACKEND=vercel_blob
MEDIA_STORAGE_ACCESS=public
BLOB_READ_WRITE_TOKEN=
BLOB_STORE_ID=
BLOB_PUBLIC_BASE_URL=
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=
EMAIL_PORT=587
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
EMAIL_USE_TLS=1
EMAIL_USE_SSL=0
MAIL_FLOW_SENDER_NAME=Mail Flow Billing
MAIL_FLOW_SENDER_EMAIL=billing@yourdomain.com
MAIL_FLOW_REPLY_TO=support@yourdomain.com
EMAIL_BATCH_SIZE=200
EMAIL_SEND_DELAY_SECONDS=0.2
MAX_UPLOAD_SIZE_BYTES=26214400
SECURE_HSTS_SECONDS=31536000
TRUST_X_FORWARDED_FOR=1
CHECKOUT_SESSION_COOKIE_NAME=mailflow_checkout
PRECHECKOUT_SESSION_COOKIE_NAME=mailflow_precheckout
CHECKOUT_SESSION_COOKIE_SECURE=1
TURNSTILE_SECRET_KEY=
TURNSTILE_EXPECTED_HOSTNAME=mailflow.example.com
TURNSTILE_CHECKOUT_ACTION=checkout
CONTENT_SECURITY_POLICY=default-src 'self'; script-src 'self' https://challenges.cloudflare.com https://*.challenges.cloudflare.com; frame-src https://challenges.cloudflare.com https://*.challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com https://*.challenges.cloudflare.com; base-uri 'self'; frame-ancestors 'none'; form-action 'self'
USDT_BDT_RATE=122.0000
PAYMENT_QUOTE_MINUTES=30
PAYMENT_EVM_WALLET=
PAYMENT_TRON_WALLET=
PAYMENT_TON_WALLET=
USDT_ETH_CONTRACT=0xdAC17F958D2ee523a2206206994597C13D831ec7
USDT_BSC_CONTRACT=0x55d398326f99059fF775485246999027B3197955
USDT_TRON_CONTRACT=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
USDT_TON_MASTER=EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs
PAYMENT_NETWORK_BSC_ENABLED=0
PAYMENT_NETWORK_ETHEREUM_ENABLED=0
PAYMENT_NETWORK_TRON_ENABLED=0
PAYMENT_NETWORK_TON_ENABLED=0
BSC_RPC_URL=
ETH_RPC_URL=
TRON_API_URL=https://api.trongrid.io
TRON_API_KEY=
TONCENTER_API_URL=https://toncenter.com/api/v3
TONCENTER_API_KEY=
PAYMENT_CONFIRMATIONS_BSC=12
PAYMENT_CONFIRMATIONS_ETHEREUM=12
PAYMENT_CONFIRMATIONS_TRON=20
PAYMENT_CONFIRMATIONS_TON=20
PAYMENT_REQUIRE_DUAL_PROVIDER=0
```

Frontend build-time:

```text
VITE_API_URL=https://your-railway-backend.up.railway.app/api
VITE_TURNSTILE_SITE_KEY=
```

Use `https://api.mailflow.example.com/api` instead after the Railway backend custom domain is attached.

## Release Checks

Run these before deploying a release.

Backend:

```powershell
cd D:\Tools\MailAutomation\backend
..\.venv\Scripts\python.exe manage.py test
..\.venv\Scripts\python.exe manage.py check --deploy
..\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
```

Frontend:

```powershell
cd D:\Tools\MailAutomation\frontend
npm ci
npm run build
npm audit --omit=dev
```

Docker:

```powershell
cd D:\Tools\MailAutomation
docker compose -f docker-compose.prod.yml --env-file .env.production config
docker compose -f docker-compose.prod.yml --env-file .env.production build
```

The Docker check is optional for Railway + Vercel, but it is still useful for proving the production Dockerfiles build locally.

## Manual Smoke Test

Run this before switching real customer traffic to the domain.

1. Open `https://mailflow.example.com/` and confirm the landing page loads.
2. Confirm browser API calls use `https://your-railway-backend.up.railway.app/api` or `https://api.mailflow.example.com/api`, not `localhost`.
3. Open `https://your-railway-backend.up.railway.app/` or `https://api.mailflow.example.com/` and confirm the API health response.
4. Open `https://your-railway-backend.up.railway.app/admin/` or `https://api.mailflow.example.com/admin/` and confirm the admin page loads with styling.
5. Sign in as the platform owner.
6. Create or review the public pricing plans: Trial/free, Basic, Premium, and Premium+.
7. Create a customer organization with deliberately small limits.
8. Create its first admin and sign in as that admin.
9. Create users until the user/admin limit is reached and confirm the limit message.
10. Add an SMTP account, test its TLS connection, and confirm encrypted credentials continue working after restart.
11. Import recipients within the limit, then verify an oversized import is rejected without partial writes.
12. Create a template, recipient list, SMTP-backed campaign, and launch within quota.
13. Confirm Celery sends the campaign and campaign logs update.
14. Schedule a campaign and confirm Celery Beat dispatches it at the expected time.
15. Exhaust a daily quota and confirm launch/retry is blocked.
16. Suspend the organization and confirm HTTP launch and Celery delivery both stop.
17. Start paid checkout, pass Turnstile, verify the OTP email arrives, and create a USDT invoice.
18. Verify invalid payment claims are rejected: wrong hash, wrong network, wrong contract, underpayment, overpayment, reused hash, and expired quote.
19. For each enabled network, send a controlled low-value real USDT transfer and confirm activation only after the configured confirmation/finality threshold.
20. Restart backend, Celery, and Redis, then confirm sessions, quotas, pending invoices, and scheduled campaigns are still correct.

## Backup and Restore

Before launch:

1. Enable Railway PostgreSQL backups.
2. Export a manual prelaunch PostgreSQL backup.
3. Restore that backup into a staging or local PostgreSQL database before accepting real customers.

Schedule daily backups for:

```text
PostgreSQL database
Vercel Blob files, if uploads/media are used
Railway volume, only if one is used for internal files
Railway/Vercel environment variables in a secure password manager or secret store
```

Test restore into a staging database before accepting real customers.

## Common Fixes

### Browser Calls Localhost

Cause: `VITE_API_URL` was missing when the frontend image/static files were built.

Fix:

```text
VITE_API_URL=https://your-railway-backend.up.railway.app/api
```

Redeploy the Vercel frontend.

### 400 Bad Request

Cause: `DJANGO_ALLOWED_HOSTS` does not include the production host.

Fix:

```text
DJANGO_ALLOWED_HOSTS=your-railway-backend.up.railway.app,api.mailflow.example.com
```

### CORS or CSRF Failures

Cause: frontend origin is missing or mismatched.

Fix:

```text
CORS_ALLOWED_ORIGINS=https://mailflow.example.com,https://your-vercel-app.vercel.app
CSRF_TRUSTED_ORIGINS=https://mailflow.example.com,https://your-vercel-app.vercel.app
FRONTEND_URL=https://mailflow.example.com
```

### Paid Checkout Verification Fails

Cause: Turnstile secret/site key mismatch or missing hostname/action.

Fix:

```text
VITE_TURNSTILE_SITE_KEY=public-key-used-at-build-time
TURNSTILE_SECRET_KEY=secret-key
TURNSTILE_EXPECTED_HOSTNAME=mailflow.example.com
TURNSTILE_CHECKOUT_ACTION=checkout
```

### Admin Has No Styling

Cause: static files were not collected or `/static/` is not served by Nginx/WhiteNoise.

Fix:

```bash
python manage.py collectstatic --noinput
```

Then serve `STATIC_ROOT` from the reverse proxy or add WhiteNoise.

### Uploads or Imports Disappear

Cause: media is stored on Railway's ephemeral filesystem or Vercel Blob storage is not configured.

Fix: set `MEDIA_STORAGE_BACKEND=vercel_blob`, configure the Blob token/store values, and make sure upload fields use the configured Django storage backend. Use a Railway volume only for internal files that do not need public browser URLs.

### Scheduled Campaigns Do Not Send

Cause: Celery Beat or Celery worker is not running.

Fix: check the Railway Celery worker and Celery Beat service logs and confirm both services use the same `REDIS_URL` as the backend.

The Railway project should have one backend web service, one Celery worker service, and one Celery Beat service.

### Duplicate Scheduled Campaign Dispatch

Cause: more than one Celery Beat instance is running.

Fix: run exactly one `celery -A config beat -l INFO` process.

### SMTP Passwords Cannot Be Decrypted

Cause: `FIELD_ENCRYPTION_KEY` changed after credentials were saved.

Fix: restore the original key from the secret store or rotate credentials through a controlled migration.

## Go-Live Checklist

```text
Code is pushed to the production branch
Production server is patched and Docker is installed
Domain DNS points to the production ingress
HTTPS works and HTTP redirects to HTTPS
DJANGO_ENV=production
DJANGO_DEBUG=0
DJANGO_SECRET_KEY is strong and private
FIELD_ENCRYPTION_KEY is generated, backed up, and stable
DATABASE_URL points to production PostgreSQL
REDIS_URL points to production Redis
CACHE_REDIS_URL is set
ALLOWED_HOSTS, CORS, CSRF, and FRONTEND_URL match the final HTTPS domain
VITE_API_URL is set before frontend build
VITE_TURNSTILE_SITE_KEY is set before frontend build
Turnstile backend values are set
Production billing SMTP is configured and tested
SPF, DKIM, DMARC, and return-path are configured
PostgreSQL backup and restore test completed
Static files are collected and served
WhiteNoise is installed and serving Django static files
Vercel Blob storage is configured for uploaded files/images
Railway volume is used only for internal persistent files, if needed
Celery worker is running
Exactly one Celery Beat process is running
USDT networks are disabled until individually tested
USDT receiving wallets and contract allow-list are confirmed
USDT_BDT_RATE is reviewed
bKash is not advertised as live until merchant integration is complete
Owner account is bootstrapped and bootstrap password is removed/rotated
Manual smoke test passed
Monitoring and alerts are active
```

## References

- Current project checklist: `PRODUCTION_DEPLOYMENT.md`
- DigitalOcean App Platform workers: https://docs.digitalocean.com/products/app-platform/how-to/manage-workers/
- DigitalOcean App Platform jobs: https://docs.digitalocean.com/products/app-platform/how-to/manage-jobs/
- DigitalOcean managed databases: https://docs.digitalocean.com/products/app-platform/how-to/manage-databases/
- Render Celery worker guide: https://render.com/docs/deploy-celery
- Railway Django guide: https://docs.railway.com/guides/django
- Vite environment variables: https://vite.dev/guide/env-and-mode
- Vercel Vite deployment notes: https://vercel.com/docs/frameworks/frontend/vite
