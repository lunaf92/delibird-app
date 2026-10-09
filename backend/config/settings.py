"""Django settings. Every value that differs between machines comes from the environment."""

import os
from datetime import timedelta
from pathlib import Path

import django_stubs_ext
from django.core.exceptions import ImproperlyConfigured
from django.utils.translation import gettext_lazy as _

# Lets classes such as ModelAdmin[User] be subscripted at runtime, as the type stubs expect.
django_stubs_ext.monkeypatch()

BASE_DIR = Path(__file__).resolve().parent.parent


def env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if value is None:
        raise ImproperlyConfigured(f"Set the {name} environment variable.")
    return value


def env_bool(name: str, default: bool = False) -> bool:
    return env(name, str(default)).lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in env(name, default).split(",") if item.strip()]


DEBUG = env_bool("DJANGO_DEBUG")
SECRET_KEY = env("DJANGO_SECRET_KEY")

# The placeholders from .env.example. Outside development they would leave the server open, so refuse them.
EXAMPLE_VALUES = {"DJANGO_SECRET_KEY": "change-me-to-a-long-random-string", "POSTGRES_PASSWORD": "change-me"}
if not DEBUG:
    for name, example in EXAMPLE_VALUES.items():
        if os.environ.get(name, "") in ("", example):
            raise ImproperlyConfigured(f"Set {name} in .env to a real secret before running in production.")
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS")
CORS_ALLOWED_ORIGINS = env_list("DJANGO_CORS_ALLOWED_ORIGINS")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "drf_spectacular",
    "core",
    "accounts",
    "wishlists",
    "sharing",
    "notifications",
    "autofill",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB", "delibird"),
        "USER": env("POSTGRES_USER", "delibird"),
        "PASSWORD": env("POSTGRES_PASSWORD", ""),
        "HOST": env("POSTGRES_HOST", "localhost"),
        "PORT": env("POSTGRES_PORT", "5432"),
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS: list[dict[str, str]] = []

# Languages: English, Italian and Spanish from the first version.
LANGUAGE_CODE = "en"
LANGUAGES = [
    ("en", _("English")),
    ("it", _("Italian")),
    ("es", _("Spanish")),
]
LOCALE_PATHS = [BASE_DIR / "locale"]
USE_I18N = True
TIME_ZONE = "UTC"
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = Path(env("DJANGO_MEDIA_ROOT", str(BASE_DIR / "media")))

REDIS_URL = env("REDIS_URL", "redis://localhost:6379/0")

CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL
CELERY_TASK_ALWAYS_EAGER = env_bool("CELERY_TASK_ALWAYS_EAGER")
CELERY_BEAT_SCHEDULE: dict[str, dict[str, object]] = {
    "clear-expired-login-codes": {
        "task": "accounts.tasks.clear_expired_login_codes",
        "schedule": timedelta(hours=1),
    },
    "notify-buyers": {
        "task": "notifications.tasks.notify_buyers",
        "schedule": timedelta(minutes=1),
    },
    "check-push-receipts": {
        "task": "notifications.tasks.check_push_receipts",
        "schedule": timedelta(minutes=15),
    },
}

# Push notifications go through Expo's push service, which needs no key.
PUSH_ENABLED = env_bool("PUSH_ENABLED", True)
EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send"
EXPO_PUSH_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts"

# Rate limits and other short-lived counters.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": env("REDIS_CACHE_URL", REDIS_URL),
        "KEY_PREFIX": "delibird",
    }
}

# Sign-in. Links in sign-in emails open the app at APP_URL.
APP_URL = env("APP_URL", "http://localhost:8081")
LOGIN_CODE_LIFETIME = timedelta(minutes=10)
LOGIN_CODE_MAX_ATTEMPTS = 5
# (requests, window): how often a code can be requested, and verify attempted, before the API answers 429.
LOGIN_CODE_RATE_PER_EMAIL = (5, timedelta(minutes=15))
LOGIN_CODE_RATE_PER_IP = (20, timedelta(hours=1))
LOGIN_VERIFY_RATE_PER_IP = (30, timedelta(minutes=15))

MAILERS = {
    "default": {
        "BACKEND": "django.core.mail.backends.smtp.EmailBackend",
        "OPTIONS": {
            "host": env("EMAIL_HOST", "localhost"),
            "port": int(env("EMAIL_PORT", "1025")),
            "username": env("EMAIL_HOST_USER", ""),
            "password": env("EMAIL_HOST_PASSWORD", ""),
            "use_tls": env_bool("EMAIL_USE_TLS"),
            # For providers that want SSL from the start (usually port 465) instead of STARTTLS (587).
            "use_ssl": env_bool("EMAIL_USE_SSL"),
        },
    }
}
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", "Strena <noreply@localhost>")

REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_AUTHENTICATION_CLASSES": ["accounts.authentication.BearerTokenAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Strena API",
    "DESCRIPTION": "API for the Strena wishlist app.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SERVE_AUTHENTICATION": [],
    "COMPONENT_SPLIT_REQUEST": True,
    "POSTPROCESSING_HOOKS": [
        "drf_spectacular.hooks.postprocess_schema_enums",
        "core.schema.responses_have_every_field",
    ],
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": env("DJANGO_LOG_LEVEL", "INFO")},
}
