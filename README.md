# Mail Flow - Enterprise Email Campaign Platform
<img width="1919" height="361" alt="1000218256" src="https://github.com/user-attachments/assets/0fee1faa-7c70-4d1f-bc22-b8593a140974" />
<img width="2158" height="445" alt="1000218259" src="https://github.com/user-attachments/assets/4c115ce2-e607-41e6-aefd-b76ac5993638" />


A multi-tenant SaaS platform for bulk email campaigns, built with **Django REST Framework**, **PostgreSQL**, **Celery + Redis**, and **React (Vite)**. It ships with a full billing system that accepts on-chain **USDT** payments across four blockchains, a five-tier RBAC model, per-organization quota enforcement, click/unsubscribe tracking, a support-ticket desk, and a real-time platform administration console.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [User Roles & Permissions](#user-roles--permissions)
- [Subscription Plans & Billing](#subscription-plans--billing)
- [Email Engine](#email-engine)
- [Campaign Tracking](#campaign-tracking)
- [Support Desk (Mail Workspace)](#support-desk-mail-workspace)
- [Platform Administration](#platform-administration)
- [Notifications & Broadcasts](#notifications--broadcasts)
- [Reports & Analytics](#reports--analytics)
- [Database Backups](#database-backups)
- [API Reference](#api-reference)
- [Security](#security)
- [Responsible Use](#responsible-use)

---

## Features

### Core Campaign System
- Email template management with HTML editor and JSON layouts
- Recipient list management with CSV/XLSX import, search, filtering, and export
- Campaign creation, immediate launch, scheduling, pause/cancel, and retry
- Persistent per-recipient delivery logs with status tracking
- Real-time campaign progress polling

### Email Delivery Engine
- Multiple SMTP accounts per organization with encrypted-at-rest passwords (Fernet)
- Batched sending with configurable batch size and inter-email delay
- Per-SMTP daily sending limits and per-organization quotas (daily / weekly / monthly)
- Automatic retry with configurable count and delay
- Plaintext fallback and `List-Unsubscribe` / `List-Unsubscribe-Post` header injection
- External relay fallback (OTP, SMTP test, campaign sending via optional external APIs)
- Template personalization with `{{name}}`, `{{email}}`, `{{company}}` merge tags

### Click & Unsubscribe Tracking
- Fernet-encrypted tracking tokens per campaign log entry
- Automatic link rewriting to redirect through click-tracking endpoints
- One-click unsubscribe with RFC 8058 `List-Unsubscribe-Post` support
- Anonymized IP hashing (SHA-256 with secret salt) — no raw IPs stored
- Configurable tracking toggle per organization via settings

### Multi-Tenant Organization System
- Full organization isolation with `PROTECT`-level foreign keys
- Five user roles: **Owner → Admin → Manager → Operator → Viewer**
- Per-organization limits: users, admins, SMTP accounts, recipients, daily campaigns
- Usage tracking with daily/weekly/monthly email quotas and campaign launch caps
- Organization status management: Active / Suspended / Expired

### Subscription & USDT Billing
- Four configurable subscription plans with original price, discount, and calculated payable price
- Free plan with automatic period rolling (30-day cycles)
- Direct USDT payments on **BSC**, **Ethereum**, **Tron**, and **TON** networks
- Time-limited invoices with unique six-decimal USDT amounts
- On-chain transaction verification with configurable confirmation thresholds
- Checkout session with OTP email verification and Turnstile CAPTCHA
- Transfer ledger with resolution audit trail (auto-activated, manual review, refunded, rejected)
- Payment security audit events with actor and IP hash tracking
- Free-plan abuse prevention via IP hash and email hash uniqueness

### Authentication & Security
- Session-backed JWT authentication with httpOnly cookie transport
- Single active session enforcement for owner accounts
- Session management: list, revoke, IP and user-agent tracking
- Two-Factor Authentication (TOTP) with QR code provisioning and backup codes
- Short-lived 2FA challenge tokens for step-up login flow
- Password change with current-password verification
- Cloudflare Turnstile integration for public checkout flows
- Rate limiting on login, file imports, SMTP tests, campaign launches, password changes, and payment endpoints
- HSTS, CSP, X-Frame-Options DENY, Referrer-Policy, CSRF protection

### Support Desk (Mail Workspace)
- IMAP/SMTP mailbox configuration with encrypted credentials
- Support ticket system with ticket numbers, priority levels, and status workflow
- Inbound/outbound/internal message threads per ticket
- Plan-gated feature (available on Premium+ and Custom plans)

### Platform Administration (Owner Console)
- Platform overview dashboard with system-wide stats
- Organization management: create, edit, suspend, delete organizations
- User management across all organizations
- Plan administration: create and edit subscription plans
- Payment review: approve, reject, or refund pending transactions
- BSC transaction inspector for on-chain verification
- Platform-wide broadcast emails with role, plan, and status targeting
- Active session monitoring across all users
- Billing configuration: wallet addresses, exchange rates, API keys

### Notifications System
- In-app notification center with unread badge counts
- Notification types: Broadcast, Billing, Support, System
- Mark as read / mark all as read
- Linked to platform broadcasts for deduplication

### Reports & Analytics
- Summary dashboard: total campaigns, deliveries, success rate, active recipients
- Daily volume charts, success ratio breakdown, campaign performance comparison
- SMTP usage distribution and top failure reasons
- Per-campaign detailed reports with click analytics and top-clicked links
- Campaign timeline (created → dispatched → completed)
- CSV export for delivery logs

### Database Backup System
- Automated daily database backups via Celery Beat (3:00 AM)
- Gzip-compressed JSON dumps of all business data
- Upload to Vercel Blob with automatic retention pruning (14 backups)
- Download and restore from backup files
- Manual backup trigger via admin API

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     React (Vite) Frontend                                   │
│   Landing ─ Register ─ Subscribe ─ Payment ─ Dashboard Shell               │
│    Templates ─ Recipients ─ Campaigns ─ SMTP ─ Reports                     │
│    Settings ─ Platform Admin ─ Account Admin ─ Notifications               │
│    Help & Support ─ Mail Workspace                                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Axios (JWT via httpOnly cookies)
┌──────────────────────────▼──────────────────────────────────────┐
│                  Django REST Framework API                                  │
│  Gunicorn ─ WhiteNoise ─ CORS ─ SecurityHeaders middleware                 │
├─────────────────────────────────────────────────────────────────┤
│  users ─ common ─ billing ─ campaigns ─ templates_app                      │
│  recipients ─ smtp_manager ─ email_engine ─ dashboard                      │
│  reports ─ support ─ platform_broadcasts ─ notifications                   │
└──────┬──────────────┬───────────────────┬───────────────────────┘
        │                 │                      │
  PostgreSQL       Redis                   Celery Workers
  (via dj-db-url)  (broker + cache)        ├─ campaign dispatch
                                           ├─ invoice expiry
                                           ├─ broadcast delivery
                                           └─ daily DB backup
```

---

## Tech Stack

| Layer            | Technology                                                              |
|------------------|-------------------------------------------------------------------------|
| **Backend**      | Python 3.12+, Django 5.1, Django REST Framework 3.15                    |
| **Frontend**     | React 18, Vite 5, React Router 7, Tailwind CSS 4, Recharts 3           |
| **Database**     | PostgreSQL 16 (SQLite for development)                                  |
| **Task Queue**   | Celery 5.4 with Redis broker                                           |
| **Cache**        | Redis 7 (production) / LocMemCache (development)                       |
| **Auth**         | SimpleJWT with token blacklisting, pyOTP for 2FA                       |
| **Encryption**   | Fernet (cryptography 44.x) for SMTP passwords, tracking tokens, API keys|
| **Payments**     | Direct USDT on BSC, Ethereum, Tron, TON via RPC/API                    |
| **Storage**      | Local filesystem or Vercel Blob (configurable)                          |
| **Icons**        | Lucide React                                                            |
| **Server**       | Gunicorn 23 + WhiteNoise for static files                               |
| **Container**    | Docker Compose with MailHog for dev email capture                       |

---

## Project Structure

```
MailAutomation/
├── backend/
│   ├── config/              # Django settings, URLs, Celery, WSGI/ASGI
│   ├── users/               # Custom User model, JWT auth, 2FA, sessions, RBAC
│   ├── common/              # Organization, SystemSetting, BillingConfig, quotas, backup, storage
│   ├── billing/             # Plans, subscriptions, USDT invoices, blockchain verification, checkout
│   ├── campaigns/           # Campaign CRUD, scheduling, logs, click/unsubscribe tracking
│   ├── templates_app/       # Email template builder with HTML validation
│   ├── recipients/          # Recipient lists, CSV/XLSX import/export
│   ├── smtp_manager/        # SMTP account CRUD, connection testing, encrypted passwords
│   ├── email_engine/        # Sending engine, relay fallback, personalization, queue/retry
│   ├── dashboard/           # Dashboard summary statistics
│   ├── reports/             # Campaign reports, delivery logs, analytics, CSV export
│   ├── support/             # Support mailboxes, tickets, messages (Mail Workspace)
│   ├── platform_broadcasts/ # Owner-to-platform broadcast emails
│   ├── notifications/       # In-app notification center
│   ├── Dockerfile           # Development Dockerfile
│   └── Dockerfile.prod      # Production multi-stage Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/           # All page components (Dashboard, Templates, Campaigns, etc.)
│   │   ├── components/      # Reusable UI components (Sidebar, Navbar, Tables, Charts, etc.)
│   │   ├── context/         # React context (ToastProvider)
│   │   ├── hooks/           # Custom React hooks
│   │   ├── layouts/         # AppLayout with sidebar/navbar shell
│   │   ├── services/        # Axios API client configuration
│   │   └── utils/           # Auth helpers, formatters
│   ├── Dockerfile           # Development Dockerfile
│   └── Dockerfile.prod      # Production multi-stage Dockerfile (Nginx)
├── deploy/                  # Nginx and PHP deployment configs
├── docker-compose.yml       # Development compose (PostgreSQL, Redis, MailHog, backend, Celery, frontend)
├── docker-compose.prod.yml  # Production compose
├── .env.example             # All environment variables with documentation
├── DEPLOYMENT.md            # Comprehensive deployment guide
└── PRODUCTION_DEPLOYMENT.md # Quick production deployment checklist
```
---

## User Roles & Permissions

The platform enforces a hierarchical five-role RBAC model:

| Role         | Scope                  | Capabilities                                                                                          |
|--------------|------------------------|-------------------------------------------------------------------------------------------------------|
| **Owner**    | Platform-wide          | Full platform administration, organization management, plan management, payment reviews, broadcasts    |
| **Admin**    | Organization           | Organization settings, user management, template/recipient/campaign/SMTP CRUD, reports, billing        |
| **Manager**  | Organization           | Template/recipient/campaign/SMTP CRUD, imports, campaign creation, reports                              |
| **Operator** | Organization           | View templates, recipients, campaigns, SMTP, reports; limited write access                             |
| **Viewer**   | Organization (read-only)| Read-only access to dashboard, templates, recipients, campaigns, SMTP, reports                         |

- The **Owner** is the platform superuser and has a dedicated admin console at `/platform`.
- **Admin** users manage their organization at `/account` and `/settings`.
- Session enforcement: Owner accounts are limited to a single active session.

---

## Subscription Plans & Billing

### Plans

Plans are defined in the Django admin or via the Owner's Platform Plans page. Each plan specifies:

- Monthly price (BDT) with optional discount percentage
- Email limits: monthly, daily, weekly
- Max admins, users, SMTP accounts, recipients, campaigns per day
- Free plan flag (auto-rolling 30-day periods)

### Checkout Flow

1. User selects a plan → Register page → Email verification (OTP) with Turnstile
2. Invoice created with unique USDT amount calculated from `price_bdt ÷ USDT_BDT_RATE`
3. User selects blockchain network (BSC / Ethereum / Tron / TON)
4. Payment page shows wallet address, amount, and countdown timer
5. User submits transaction hash → Backend verifies on-chain
6. On success: Organization + Subscription provisioned, confirmation email sent
7. On failure or ambiguity: Invoice flagged for manual review

### Payment Verification

For each network, the backend verifies:
- USDT contract address matches the configured allow-list
- Receiving wallet matches the platform wallet
- Amount matches (within token decimals precision)
- Transaction has sufficient confirmations (configurable per network)
- Transaction hash is not already consumed (idempotency)

---

## Email Engine

The email engine (`email_engine/sender.py`) processes campaign logs atomically:

1. **Quota gate** — Validates organization is active, checks daily/weekly/monthly quotas, SMTP daily limit
2. **Personalization** — Renders `{{name}}`, `{{email}}`, `{{company}}` merge tags in subject and HTML
3. **Tracking injection** — Appends unsubscribe footer, rewrites links for click tracking
4. **Delivery** — Attempts direct SMTP; falls back to external campaign relay on failure
5. **Post-send** — Updates campaign log, SMTP daily counter, organization usage records

### Celery Beat Scheduled Tasks

| Task                                        | Schedule            |
|---------------------------------------------|---------------------|
| `campaigns.tasks.dispatch_scheduled_campaigns` | Every 60 seconds   |
| `billing.tasks.expire_payment_invoices`        | Every 5 minutes    |
| `common.tasks.auto_backup_database_task`       | Daily at 3:00 AM   |

---

## Campaign Tracking

- **Click tracking**: All links in campaign HTML are rewritten to pass through `/api/track/click/{token}/`. The token is a Fernet-encrypted payload containing the campaign log ID and destination URL.
- **Unsubscribe**: Each email includes a `List-Unsubscribe` header and a footer link pointing to `/api/unsubscribe/{token}/`. Unsubscribing deactivates the recipient across all lists in the organization.
- **Privacy**: IP addresses are never stored directly. A one-way SHA-256 hash (`SECRET_KEY + IP`) is recorded for abuse detection.

---

## Support Desk (Mail Workspace)

Available to organizations on **Premium+** or **Custom** plans with the workspace feature enabled:

- **Mailbox configuration**: IMAP + SMTP credentials with Fernet-encrypted passwords
- **Ticket system**: Auto-generated ticket numbers, priority levels (Normal / High / Urgent), status workflow (New → Open → Waiting → Resolved → Closed)
- **Message threads**: Inbound, outbound, and internal notes per ticket
- Accessible at `/mail-workspace` in the frontend (Owner and Admin roles)

---

## Platform Administration

The Owner's admin console at `/platform` provides:

| Page                | Functionality                                                                  |
|---------------------|--------------------------------------------------------------------------------|
| **Overview**        | System-wide stats: total orgs, users, campaigns, revenue                      |
| **Organizations**   | Full CRUD, suspend/activate, edit limits, view subscription details             |
| **Users**           | Cross-org user management, role changes, account actions                        |
| **Plans**           | Create/edit subscription plans, pricing, limits, display order                  |
| **Billing**         | Payment review queue, transaction inspection, approve/reject/refund             |
| **Broadcasts**      | Send platform-wide emails targeted by role, plan, or org status                 |
| **Sessions**        | Monitor and revoke active user sessions across the platform                     |
| **Settings**        | Billing configuration: wallet addresses, exchange rate, API keys                |

---

## Notifications & Broadcasts

### In-App Notifications

Users receive notifications for:
- Platform broadcast announcements
- Billing events (invoice created, payment confirmed, subscription changes)
- Support ticket updates
- System alerts

The notification bell shows unread count and supports mark-as-read and mark-all-read.

### Platform Broadcasts

The Owner can send targeted emails to platform users filtered by:
- User role (admin, manager, operator, viewer)
- Subscription plan
- Organization status (active, suspended, expired)

Broadcasts are processed asynchronously via Celery with per-user delivery tracking.

---

## Reports & Analytics

### Summary Report
- Total campaigns, emails sent, success rate, active recipients
- Daily volume chart (sent vs. failed over time)
- Success ratio pie chart
- Campaign performance comparison (top 5)
- SMTP usage distribution
- Top failure reasons

### Campaign Detail Report
- Per-campaign delivery breakdown: sent, failed, pending
- Click analytics: total clicks, unique clicks, click rate
- Top 10 clicked links with click counts
- Campaign timeline: created → dispatched → completed

### Delivery Logs
- Searchable per-recipient delivery status with SMTP response messages
- Filterable by campaign, status, and search query
- CSV export capability

---

## Database Backups

The platform includes an automated backup system:

- **Scheduled**: Celery Beat runs a daily backup at 3:00 AM
- **Format**: Gzip-compressed JSON dump of all business data (users, recipients, campaigns, templates, SMTP, billing, etc.)
- **Storage**: Uploaded to Vercel Blob with automatic pruning (keeps latest 14 backups)
- **Restore**: Download and restore from any backup via admin endpoints
- **Manual trigger**: Platform owner can trigger backups on demand

---

## API Reference

### Authentication

| Method | Endpoint                          | Description                        |
|--------|-----------------------------------|------------------------------------|
| POST   | `/api/auth/token/`                | Obtain JWT access + refresh tokens |
| POST   | `/api/auth/token/refresh/`        | Refresh access token               |
| POST   | `/api/auth/logout/`               | Logout and revoke session          |
| POST   | `/api/auth/2fa/setup/`            | Begin TOTP 2FA setup               |
| POST   | `/api/auth/2fa/confirm/`          | Confirm 2FA setup with TOTP code   |
| POST   | `/api/auth/2fa/disable/`          | Disable 2FA                        |
| POST   | `/api/auth/2fa/verify-login/`     | 2FA step-up during login           |
| POST   | `/api/auth/2fa/regenerate-backup-codes/` | Regenerate backup codes     |

### User & Profile

| Method | Endpoint                          | Description                          |
|--------|-----------------------------------|--------------------------------------|
| GET    | `/api/profile/`                   | Get current user profile             |
| PUT    | `/api/profile/`                   | Update profile                       |
| POST   | `/api/profile/change-password/`   | Change password                      |
| GET    | `/api/users/`                     | List users (admin+)                  |
| POST   | `/api/users/`                     | Create user (admin+)                 |
| GET    | `/api/sessions/`                  | List active sessions                 |
| POST   | `/api/sessions/{id}/revoke/`      | Revoke a session                     |

### Organizations

| Method | Endpoint                            | Description                         |
|--------|-------------------------------------|-------------------------------------|
| GET    | `/api/organizations/`               | List organizations                  |
| POST   | `/api/organizations/`               | Create organization (owner)         |
| GET    | `/api/organizations/{id}/`          | Get organization details            |
| PUT    | `/api/organizations/{id}/`          | Update organization                 |
| GET    | `/api/account/`                     | Get current org account summary     |
| GET    | `/api/organization-usage/`          | Get org usage stats                 |
| GET    | `/api/settings/`                    | Get organization settings           |
| PUT    | `/api/settings/`                    | Update organization settings        |

### Templates

| Method | Endpoint              | Description              |
|--------|-----------------------|--------------------------|
| GET    | `/api/templates/`     | List email templates     |
| POST   | `/api/templates/`     | Create template          |
| GET    | `/api/templates/{id}/`| Get template details     |
| PUT    | `/api/templates/{id}/`| Update template          |
| DELETE | `/api/templates/{id}/`| Delete template          |

### Recipients

| Method | Endpoint                       | Description                     |
|--------|--------------------------------|---------------------------------|
| GET    | `/api/recipient-lists/`        | List recipient lists            |
| POST   | `/api/recipient-lists/`        | Create recipient list           |
| GET    | `/api/recipients/`             | List recipients                 |
| POST   | `/api/recipients/`             | Create recipient                |
| POST   | `/api/recipients/import_file/` | Import from CSV/XLSX            |
| GET    | `/api/recipients/export_file/` | Export recipients               |

### SMTP Accounts

| Method | Endpoint                                | Description                  |
|--------|-----------------------------------------|------------------------------|
| GET    | `/api/smtp-accounts/`                   | List SMTP accounts           |
| POST   | `/api/smtp-accounts/`                   | Create SMTP account          |
| PUT    | `/api/smtp-accounts/{id}/`              | Update SMTP account          |
| DELETE | `/api/smtp-accounts/{id}/`              | Delete SMTP account          |
| POST   | `/api/smtp-accounts/{id}/test_connection/` | Test SMTP connection      |

### Campaigns

| Method | Endpoint                                  | Description                     |
|--------|-------------------------------------------|---------------------------------|
| GET    | `/api/campaigns/`                         | List campaigns                  |
| POST   | `/api/campaigns/`                         | Create campaign                 |
| GET    | `/api/campaigns/{id}/`                    | Get campaign details            |
| POST   | `/api/campaigns/{id}/launch/`             | Launch campaign immediately     |
| POST   | `/api/campaigns/{id}/schedule_campaign/`  | Schedule campaign               |
| GET    | `/api/campaigns/{id}/progress/`           | Poll campaign progress          |
| GET    | `/api/campaign-logs/`                     | List campaign delivery logs     |

### Tracking

| Method | Endpoint                              | Description                    |
|--------|---------------------------------------|--------------------------------|
| GET    | `/api/track/click/{token}/`           | Click redirect (public)        |
| GET/POST| `/api/unsubscribe/{token}/`          | Unsubscribe (public)           |

### Reports

| Method | Endpoint                                  | Description                    |
|--------|-------------------------------------------|--------------------------------|
| GET    | `/api/reports/summary/`                   | Summary report with charts     |
| GET    | `/api/reports/campaigns/`                 | Campaign report list           |
| GET    | `/api/reports/campaign/{id}/`             | Campaign detail report         |
| GET    | `/api/reports/delivery-logs/`             | Delivery logs with search      |
| GET    | `/api/reports/delivery-logs/export/`      | Export delivery logs as CSV    |

### Dashboard

| Method | Endpoint                    | Description               |
|--------|-----------------------------|---------------------------|
| GET    | `/api/dashboard/summary/`  | Dashboard summary stats   |

### Billing

| Method | Endpoint                                        | Description                           |
|--------|--------------------------------------------------|---------------------------------------|
| GET    | `/api/billing/plans/`                            | List available plans (public)         |
| POST   | `/api/billing/signup/free/`                      | Free plan signup                      |
| POST   | `/api/billing/checkout/email/start/`             | Start email verification for checkout |
| POST   | `/api/billing/checkout/email/verify/`            | Verify checkout OTP                   |
| POST   | `/api/billing/invoices/`                         | Create payment invoice                |
| GET    | `/api/billing/invoices/current/`                 | Get current pending invoice           |
| GET    | `/api/billing/invoices/{id}/`                    | Get invoice details                   |
| POST   | `/api/billing/invoices/{id}/verify/`             | Submit tx hash for verification       |
| POST   | `/api/billing/invoices/{id}/replace/`            | Replace invoice (change network)      |
| POST   | `/api/billing/invoices/{id}/cancel/`             | Cancel invoice                        |
| POST   | `/api/billing/invoices/recover/`                 | Recover invoice by email              |
| POST   | `/api/billing/account/invoices/`                 | Existing org renewal/upgrade invoice  |

### Support

| Method | Endpoint                    | Description                  |
|--------|-----------------------------|------------------------------|
| GET    | `/api/support/tickets/`     | List support tickets         |
| POST   | `/api/support/tickets/`     | Create support ticket        |
| GET    | `/api/support/messages/`    | List messages for a ticket   |
| POST   | `/api/support/messages/`    | Send a message               |

### Notifications

| Method | Endpoint                           | Description                   |
|--------|-------------------------------------|-------------------------------|
| GET    | `/api/notifications/`              | List notifications            |
| PATCH  | `/api/notifications/{id}/read/`    | Mark as read                  |
| POST   | `/api/notifications/mark-all-read/`| Mark all as read              |

### Platform (Owner Only)

| Method | Endpoint                                              | Description                        |
|--------|--------------------------------------------------------|------------------------------------|
| GET    | `/api/billing/platform/plans/`                        | List/manage plans (admin)          |
| POST   | `/api/billing/platform/plans/`                        | Create plan                        |
| GET    | `/api/billing/platform/payment-reviews/`              | Payment review queue               |
| POST   | `/api/billing/platform/payment-reviews/{id}/action/`  | Approve/reject/refund payment      |
| POST   | `/api/billing/platform/bsc-transaction-inspect/`      | Inspect BSC transaction            |
| GET    | `/api/platform/billing-configuration/`                | Get billing config                 |
| PUT    | `/api/platform/billing-configuration/`                | Update billing config              |
| GET    | `/api/platform-broadcasts/`                           | List broadcasts                    |
| POST   | `/api/platform-broadcasts/`                           | Create and send broadcast          |

---

## Security

### Application Security
- **Encryption at rest**: SMTP passwords, support mailbox credentials, API keys, and tracking tokens encrypted with Fernet
- **JWT in httpOnly cookies**: Access and refresh tokens stored in secure, httpOnly, SameSite cookies
- **Token rotation**: Refresh tokens are rotated on each use
- **2FA**: RFC 6238 TOTP with ±1 window drift tolerance, QR code setup, 8 backup codes
- **Rate limiting**: Configurable per-endpoint throttles (login, imports, launches, payments)
- **Input validation**: Django REST Framework serializers with strict validation

### Infrastructure Security
- **HTTPS enforcement**: `SECURE_SSL_REDIRECT`, HSTS with 1-year max-age and preload
- **CSP header**: Configurable Content Security Policy with Cloudflare Turnstile allowed
- **CORS**: Explicit origin allow-list; no wildcards in production
- **Security headers**: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
- **Production guards**: `ImproperlyConfigured` raised if debug enabled, weak secret key, missing encryption key, or wildcard hosts in production

### Payment Security
- Only public wallet addresses configured — **no private keys or seed phrases**
- Transaction hash uniqueness enforced at the database level
- Payment security audit events logged with actor and IP hash
- Transfer ledger maintains full resolution history
- Free plan claims deduplicated by IP hash and email hash

---

## Responsible Use

> **Only send to recipients who have explicitly opted in.** Add unsubscribe handling, suppression lists, bounce processing, and jurisdiction-specific compliance controls before production use. Never use purchased or scraped address lists.

---

## License

Mail Flow. All rights reserved.
