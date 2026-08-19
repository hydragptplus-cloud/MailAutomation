# Production SaaS Deployment

## Required environment

Set these through the deployment platform's secret manager, not in source control:

- `DJANGO_ENV=production`
- `DJANGO_DEBUG=0`
- a strong, unique `DJANGO_SECRET_KEY`
- an explicit comma-separated `DJANGO_ALLOWED_HOSTS` without `*`
- explicit HTTPS `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS`
- the production `DATABASE_URL` and `REDIS_URL`
- a persistent Fernet `FIELD_ENCRYPTION_KEY`
- HTTPS `FRONTEND_URL`
- secure `DJANGO_SUPERUSER_*` values for the initial platform owner, if bootstrap creation is used
- the three public USDT receiving addresses and four allow-listed USDT token/master contracts
- reliable `ETH_RPC_URL`, `BSC_RPC_URL`, `TRON_API_URL`, and `TONCENTER_API_URL` endpoints
- `TRON_API_KEY` and `TONCENTER_API_KEY` where required for production rate limits
- an approved and monitored `USDT_BDT_RATE`
- `TRUST_X_FORWARDED_FOR=1` only when the backend is reachable exclusively through a trusted reverse proxy that replaces the header

Do not rotate `FIELD_ENCRYPTION_KEY` until existing SMTP credentials have been decrypted and re-encrypted through a controlled rotation procedure.

## Rollout order

1. Put campaign launch endpoints and Celery workers into maintenance mode.
2. Back up PostgreSQL and verify the backup can be listed/read.
3. Deploy the application image containing the committed migrations.
4. Run `python manage.py migrate` exactly once per release. In Compose, only `backend` runs migrations; Celery services set `SKIP_MIGRATIONS=1` and wait for backend health to prevent concurrent schema changes.
5. Confirm exactly one intended owner account and review the internal organization's limits.
6. Start the backend, Celery worker, and Celery Beat from the same release.
7. Run the checks below.
8. Use the owner Platform page to create the first customer organization and its admin.

Never run `makemigrations` in the production entrypoint. Back up the database before applying the tenancy migration.

## Release checks

From `backend/`:

```powershell
..\.venv\Scripts\python.exe manage.py test
..\.venv\Scripts\python.exe manage.py check --deploy
..\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
```

From `frontend/`:

```powershell
npm ci
npm run build
npm audit --omit=dev
```

The audit gate is no high or critical production vulnerability. Review and schedule moderate advisories as well.

## Manual smoke test

1. Sign in as owner and create an organization with deliberately small limits.
2. Create its first admin and sign in as that admin.
3. Create users until the user limit message appears.
4. Create an SMTP account, test its verified TLS connection, and confirm another account is blocked at the limit.
5. Import recipients within the limit, then verify an oversized import is rejected without partial writes.
6. Create a template, list, SMTP-backed campaign, and launch within quota.
7. Confirm dashboard usage increments only after successful delivery.
8. Exhaust daily quota and confirm launch and retry are blocked.
9. Suspend the organization and confirm HTTP launches and Celery delivery both stop.
10. Sign in as owner from a second browser and confirm the first browser receives `401` on its next API request.
11. Create a paid test invoice and verify an invalid hash, wrong network, wrong USDT contract, underpayment, and already-used hash are rejected.
12. Send a controlled low-value USDT payment on each enabled production network and confirm account activation only after the configured confirmation/finality threshold.

## Direct-wallet payment controls

- Never authenticate a token by symbol or display metadata. Contract/master addresses are the allow-list.
- Never accept screenshots or manually mark an invoice paid based only on an explorer page.
- Keep `(network, transaction_hash, transfer_index)` unique; one chain transfer may activate only one invoice.
- Keep RPC/API credentials server-side and use redundant paid endpoints for production availability.
- Monitor invoice verification errors, RPC disagreement, chain reorganizations, and unusually repeated source addresses.
- The application stores no wallet signing keys. Treasury transfers and refunds remain an offline/manual finance operation.
