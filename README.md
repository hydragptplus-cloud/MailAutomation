# Mail Automation SaaS

A modular bulk-email campaign platform built with Django REST Framework, PostgreSQL, Celery, Redis, and React/Vite.

## Included

- Organization tenancy with owner/admin/manager/operator/viewer roles
- Four subscription plans with separate administrator/user seats, SMTP limits, and anchored daily/weekly/30-day quotas
- Direct USDT invoices and on-chain verification for BSC, Ethereum, Tron, and TON
- Session-backed JWT authentication with a single active owner session
- Email templates with HTML and JSON layouts
- Recipient lists, CSV/XLSX import, search, filtering, and export
- Multiple SMTP accounts with encrypted-at-rest password storage
- Campaign creation, immediate launch, scheduling, persistent logs, retry handling, and progress tracking
- Dashboard statistics and reports endpoints
- React admin shell with pages for Dashboard, Templates, Recipients, Campaigns, SMTP, Reports, and Settings
- Docker Compose for PostgreSQL, Redis, backend, Celery worker, Celery Beat, and frontend

## Responsible-use defaults

Only send to recipients who have explicitly opted in. Add unsubscribe handling, suppression lists, bounce processing, and jurisdiction-specific compliance controls before production use. Never use purchased or scraped address lists.

## Quick start with Docker

```bash
cp .env.example .env
# Generate a Fernet key and put it in FIELD_ENCRYPTION_KEY:
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

docker compose up --build
```

The configured `DJANGO_SUPERUSER_*` account is created as the platform `owner`. To create one manually, create a superuser and set its role to `owner` in a Django shell.

```bash
docker compose exec backend python manage.py createsuperuser
```

- API: `http://localhost:8000/api/`
- Admin: `http://localhost:8000/admin/`
- Frontend: `http://localhost:5173/`
- Landing/pricing: `http://localhost:5173/`
- Login: `http://localhost:5173/login`

## Local backend setup

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
cd backend
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Run Celery in separate terminals:

```bash
cd backend
celery -A config worker -l INFO
celery -A config beat -l INFO
```

## API outline

- `POST /api/auth/token/`
- `POST /api/auth/token/refresh/`
- `GET|POST /api/organizations/` (owner)
- `POST /api/organizations/{id}/create-admin/` (owner)
- `GET /api/account/`
- `GET /api/organization-usage/`
- `GET /api/sessions/` and `POST /api/sessions/{id}/revoke/`
- `GET /api/dashboard/summary/`
- `GET|POST /api/templates/`
- `GET|POST /api/recipient-lists/`
- `GET|POST /api/recipients/`
- `POST /api/recipients/import_file/`
- `GET /api/recipients/export_file/`
- `GET|POST /api/smtp-accounts/`
- `POST /api/smtp-accounts/{id}/test_connection/`
- `GET|POST /api/campaigns/`
- `POST /api/campaigns/{id}/launch/`
- `POST /api/campaigns/{id}/schedule_campaign/`
- `GET /api/campaigns/{id}/progress/`
- `GET /api/campaign-logs/`
- `GET /api/reports/campaign/{campaign_id}/`
- `GET /api/billing/plans/`
- `POST /api/billing/signup/free/`
- `POST /api/billing/invoices/`
- `GET /api/billing/invoices/{invoice_id}/`
- `POST /api/billing/invoices/{invoice_id}/verify/`
- `POST /api/billing/account/invoices/` (organization admin renewal/change)

## Direct USDT subscriptions

The customer chooses BSC, Ethereum, Tron, or TON and receives a short-lived invoice with a unique six-decimal USDT amount. After sending, they submit the transaction hash or explorer link. The backend verifies the allow-listed USDT contract, receiving wallet, amount, invoice time, confirmation/finality state, and one-time transaction use before provisioning the organization.

Only public receiving addresses are configured. The application never needs a wallet seed phrase or private key. Set the wallet, token-contract, RPC/API, confirmation, quote-duration, and `USDT_BDT_RATE` values documented in `.env.example` before launch. The BDT-to-USDT conversion rate is an explicit business setting; review it regularly.

## Production deployment

See [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md) for required environment values, backup/migration order, security checks, and the tenant onboarding smoke test.

## Deliverability and compliance checklist

1. Put Django behind HTTPS and a reverse proxy.
2. Use a managed secret store; rotate SMTP credentials and the encryption key.
3. Add unsubscribe tokens, a global suppression list, bounce/complaint webhooks, and consent timestamps.
4. Add domain-level and optional hourly throttling where required.
5. Configure DKIM, SPF, DMARC, verified sender identities, and return-path handling.
6. Add provider webhooks and durable idempotency keys for external delivery reconciliation.
7. Move media to S3-compatible storage and logs to centralized observability.
8. Add centralized audit logging, monitoring, alerting, and disaster-recovery drills.
