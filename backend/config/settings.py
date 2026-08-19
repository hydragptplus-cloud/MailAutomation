import os
from pathlib import Path
import dj_database_url
from dotenv import load_dotenv
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR.parent / ".env")

DEBUG = os.getenv("DJANGO_DEBUG", "0") == "1"
IS_PRODUCTION = os.getenv("DJANGO_ENV", "development").lower() == "production"
if IS_PRODUCTION and DEBUG:
    raise ImproperlyConfigured("DJANGO_DEBUG must be disabled in production.")
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "")
if IS_PRODUCTION and (not SECRET_KEY or SECRET_KEY in {"change-me", "unsafe-development-key"}):
    raise ImproperlyConfigured("A strong DJANGO_SECRET_KEY is required in production.")
SECRET_KEY = SECRET_KEY or "unsafe-development-key"
ALLOWED_HOSTS = [x.strip() for x in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if x.strip()]
if IS_PRODUCTION and (not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS):
    raise ImproperlyConfigured("Explicit DJANGO_ALLOWED_HOSTS are required in production.")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "django_filters",
    "users",
    "dashboard",
    "templates_app",
    "recipients",
    "campaigns",
    "smtp_manager",
    "email_engine",
    "reports",
    "common",
    "billing",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "common.middleware.SecurityHeadersMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates",
    "DIRS": [BASE_DIR / "templates"],
    "APP_DIRS": True,
    "OPTIONS": {"context_processors": [
        "django.template.context_processors.request",
        "django.contrib.auth.context_processors.auth",
        "django.contrib.messages.context_processors.messages",
    ]},
}]
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=600,
    )
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
AUTH_USER_MODEL = "users.User"

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Dhaka"
USE_I18N = True
USE_TZ = True
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR.parent / "media"
STORAGES: dict[str, dict[str, object]] = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}
MEDIA_STORAGE_BACKEND = os.getenv("MEDIA_STORAGE_BACKEND", "filesystem").lower()
if MEDIA_STORAGE_BACKEND in {"vercel_blob", "blob"}:
    if not os.getenv("BLOB_READ_WRITE_TOKEN"):
        raise ImproperlyConfigured("BLOB_READ_WRITE_TOKEN is required when MEDIA_STORAGE_BACKEND=vercel_blob.")
    if not (os.getenv("BLOB_STORE_ID") or os.getenv("BLOB_PUBLIC_BASE_URL")):
        raise ImproperlyConfigured(
            "BLOB_STORE_ID or BLOB_PUBLIC_BASE_URL is required when MEDIA_STORAGE_BACKEND=vercel_blob."
        )
    STORAGES["default"] = {
        "BACKEND": "common.storage.VercelBlobStorage",
        "OPTIONS": {
            "access": os.getenv("MEDIA_STORAGE_ACCESS", "public"),
            "token": os.getenv("BLOB_READ_WRITE_TOKEN", ""),
            "store_id": os.getenv("BLOB_STORE_ID", ""),
            "public_url_base": os.getenv("BLOB_PUBLIC_BASE_URL", ""),
        },
    }
elif MEDIA_STORAGE_BACKEND not in {"filesystem", "local", ""}:
    raise ImproperlyConfigured("MEDIA_STORAGE_BACKEND must be 'filesystem' or 'vercel_blob'.")
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "users.authentication.SessionJWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
    "DEFAULT_THROTTLE_RATES": {
        "login": "10/minute",
        "file_import": "10/hour",
        "smtp_test": "20/hour",
        "campaign_launch": "20/hour",
        "password_change": "5/hour",
        "public_signup": "5/hour",
        "checkout_email": "5/hour",
        "payment_verify": "10/hour",
        "invoice_recover": "5/hour",
        "otp_verify": "10/hour",
        "transaction_verify": "10/hour",
    },
}
CORS_ALLOWED_ORIGINS = [x.strip() for x in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",") if x.strip()]
if IS_PRODUCTION and any(origin == "*" for origin in CORS_ALLOWED_ORIGINS):
    raise ImproperlyConfigured("Wildcard CORS origins are not allowed in production.")
CORS_ALLOW_CREDENTIALS = True

CELERY_BROKER_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = CELERY_BROKER_URL
CACHE_REDIS_URL = os.getenv("CACHE_REDIS_URL", "redis://localhost:6379/1" if IS_PRODUCTION else "")
if CACHE_REDIS_URL:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": CACHE_REDIS_URL,
            "KEY_PREFIX": os.getenv("CACHE_KEY_PREFIX", "mailflow"),
        }
    }
else:
    CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 300
CELERY_BEAT_SCHEDULE = {
    "dispatch-scheduled-campaigns-every-minute": {
        "task": "campaigns.tasks.dispatch_scheduled_campaigns",
        "schedule": 60.0,
    },
    "expire-payment-invoices-every-five-minutes": {
        "task": "billing.tasks.expire_payment_invoices",
        "schedule": 300.0,
    },
}

EMAIL_BACKEND = os.getenv("EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend")
EMAIL_HOST = os.getenv("EMAIL_HOST", "localhost")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "1025"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "0") == "1"
EMAIL_USE_SSL = os.getenv("EMAIL_USE_SSL", "0") == "1"
MAIL_FLOW_SENDER_NAME = os.getenv("MAIL_FLOW_SENDER_NAME", "Mail Flow Billing")
MAIL_FLOW_SENDER_EMAIL = os.getenv("MAIL_FLOW_SENDER_EMAIL", os.getenv("DEFAULT_FROM_EMAIL", "billing@example.com"))
MAIL_FLOW_REPLY_TO = os.getenv("MAIL_FLOW_REPLY_TO", "")
DEFAULT_FROM_EMAIL = f"{MAIL_FLOW_SENDER_NAME} <{MAIL_FLOW_SENDER_EMAIL}>"
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
FIELD_ENCRYPTION_KEY = os.getenv("FIELD_ENCRYPTION_KEY") or ""
if IS_PRODUCTION and not FIELD_ENCRYPTION_KEY:
    raise ImproperlyConfigured("FIELD_ENCRYPTION_KEY is required in production.")
if IS_PRODUCTION:
    from cryptography.fernet import Fernet
    try:
        Fernet(FIELD_ENCRYPTION_KEY.encode())
    except (ValueError, TypeError) as exc:
        raise ImproperlyConfigured("FIELD_ENCRYPTION_KEY must be a valid Fernet key.") from exc
EMAIL_BATCH_SIZE = int(os.getenv("EMAIL_BATCH_SIZE", "200"))
EMAIL_SEND_DELAY_SECONDS = float(os.getenv("EMAIL_SEND_DELAY_SECONDS", "0.2"))
DATA_UPLOAD_MAX_MEMORY_SIZE = int(os.getenv("MAX_UPLOAD_SIZE_BYTES", str(25 * 1024 * 1024)))
FILE_UPLOAD_MAX_MEMORY_SIZE = DATA_UPLOAD_MAX_MEMORY_SIZE

SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SAMESITE = "Strict"
SECURE_SSL_REDIRECT = not DEBUG
SECURE_HSTS_SECONDS = int(os.getenv("SECURE_HSTS_SECONDS", "31536000")) if not DEBUG else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG
SECURE_HSTS_PRELOAD = not DEBUG
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_REFERRER_POLICY = "no-referrer"
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
CSRF_TRUSTED_ORIGINS = [x.strip() for x in os.getenv("CSRF_TRUSTED_ORIGINS", "").split(",") if x.strip()]
CHECKOUT_SESSION_COOKIE_NAME = os.getenv("CHECKOUT_SESSION_COOKIE_NAME", "mailflow_checkout")
PRECHECKOUT_SESSION_COOKIE_NAME = os.getenv("PRECHECKOUT_SESSION_COOKIE_NAME", "mailflow_precheckout")
CHECKOUT_SESSION_COOKIE_SECURE = os.getenv("CHECKOUT_SESSION_COOKIE_SECURE", "1" if not DEBUG else "0") == "1"
TURNSTILE_SECRET_KEY = os.getenv("TURNSTILE_SECRET_KEY", "")
TURNSTILE_EXPECTED_HOSTNAME = os.getenv("TURNSTILE_EXPECTED_HOSTNAME", "")
TURNSTILE_CHECKOUT_ACTION = os.getenv("TURNSTILE_CHECKOUT_ACTION", "checkout")
CONTENT_SECURITY_POLICY = os.getenv(
    "CONTENT_SECURITY_POLICY",
    "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
)

SIMPLE_JWT = {
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": False,
    "UPDATE_LAST_LOGIN": True,
}

# Direct USDT billing. These are public wallet/contract identifiers only.
USDT_BDT_RATE = os.getenv("USDT_BDT_RATE", "122.0000")
PAYMENT_QUOTE_MINUTES = int(os.getenv("PAYMENT_QUOTE_MINUTES", "30"))
PAYMENT_TON_WALLET = os.getenv("PAYMENT_TON_WALLET", "UQCc1yYCN1q8Js-WPqA2k8kCBFr9nDbOo18j0vsH2dhxTR9s")
PAYMENT_EVM_WALLET = os.getenv("PAYMENT_EVM_WALLET", "0xd34D15736148C0e9DC185CCf2D94B648c48e1CdB")
PAYMENT_TRON_WALLET = os.getenv("PAYMENT_TRON_WALLET", "TWYfWJ3o3Bj2RdT5EHogghm3KbWzoWqx4u")
USDT_ETH_CONTRACT = os.getenv("USDT_ETH_CONTRACT", "0xdAC17F958D2ee523a2206206994597C13D831ec7")
USDT_BSC_CONTRACT = os.getenv("USDT_BSC_CONTRACT", "0x55d398326f99059fF775485246999027B3197955")
USDT_TRON_CONTRACT = os.getenv("USDT_TRON_CONTRACT", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t")
USDT_TON_MASTER = os.getenv("USDT_TON_MASTER", "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs")
ETH_RPC_URL = os.getenv("ETH_RPC_URL", "https://ethereum-rpc.publicnode.com")
BSC_RPC_URL = os.getenv("BSC_RPC_URL", "https://bsc-dataseed-public.bnbchain.org")
TRON_API_URL = os.getenv("TRON_API_URL", "https://api.trongrid.io")
TRON_API_KEY = os.getenv("TRON_API_KEY", "")
TONCENTER_API_URL = os.getenv("TONCENTER_API_URL", "https://toncenter.com/api/v3")
TONCENTER_API_KEY = os.getenv("TONCENTER_API_KEY", "")
PAYMENT_CONFIRMATIONS_BSC = int(os.getenv("PAYMENT_CONFIRMATIONS_BSC", "12"))
PAYMENT_CONFIRMATIONS_ETHEREUM = int(os.getenv("PAYMENT_CONFIRMATIONS_ETHEREUM", "12"))
PAYMENT_REQUIRE_DUAL_PROVIDER = os.getenv("PAYMENT_REQUIRE_DUAL_PROVIDER", "0") == "1"
PAYMENT_NETWORK_BSC_ENABLED = os.getenv("PAYMENT_NETWORK_BSC_ENABLED", "0" if IS_PRODUCTION else "1") == "1"
PAYMENT_NETWORK_ETHEREUM_ENABLED = os.getenv("PAYMENT_NETWORK_ETHEREUM_ENABLED", "0" if IS_PRODUCTION else "1") == "1"
PAYMENT_NETWORK_TRON_ENABLED = os.getenv("PAYMENT_NETWORK_TRON_ENABLED", "0" if IS_PRODUCTION else "1") == "1"
PAYMENT_NETWORK_TON_ENABLED = os.getenv("PAYMENT_NETWORK_TON_ENABLED", "0" if IS_PRODUCTION else "1") == "1"
TRUST_X_FORWARDED_FOR = os.getenv("TRUST_X_FORWARDED_FOR", "0") == "1"
