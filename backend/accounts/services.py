"""Passwordless sign-in: issuing and checking login codes, and opening and closing sessions."""

import hashlib
import hmac
import secrets
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from django.utils.crypto import salted_hmac

from accounts.models import LoginCode, Session, User, normalize_email


class InvalidCode(Exception):
    """The code or link is wrong, expired, used up or never existed. Callers can't tell which."""


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def hash_code(email: str, code: str) -> str:
    # Keyed with SECRET_KEY and the email: a six-digit code is too short for a plain hash to hide it.
    return salted_hmac("accounts.login-code", f"{email}:{code}", algorithm="sha256").hexdigest()


def rate_limited(key: str, limit: int, window: timedelta) -> bool:
    """Counts one hit for `key` and says whether it went over `limit` in the current window."""
    cache_key = f"ratelimit:{key}"
    cache.add(cache_key, 0, timeout=int(window.total_seconds()))
    try:
        hits = cache.incr(cache_key)
    except ValueError:  # The window expired between add and incr.
        cache.set(cache_key, 1, timeout=int(window.total_seconds()))
        hits = 1
    return hits > limit


def create_login_code(email: str) -> tuple[str, str]:
    """Replaces any pending codes for this email with a new one. Returns the code and the magic-link token."""
    email = normalize_email(email)
    code = f"{secrets.randbelow(1_000_000):06d}"
    token = secrets.token_urlsafe(32)
    with transaction.atomic():
        LoginCode.objects.filter(email=email).delete()
        LoginCode.objects.create(
            email=email,
            code_hash=hash_code(email, code),
            token_hash=hash_token(token),
            expires_at=timezone.now() + settings.LOGIN_CODE_LIFETIME,
        )
    return code, token


def check_code(email: str, code: str) -> str:
    """Uses up the pending code for this email if `code` matches. Returns the email it belonged to."""
    email = normalize_email(email)
    with transaction.atomic():
        login_code = LoginCode.objects.select_for_update().filter(email=email).first()
        if login_code is None or not login_code.is_usable:
            raise InvalidCode
        matches = hmac.compare_digest(login_code.code_hash, hash_code(email, code))
        if matches:
            login_code.delete()
        else:
            # Counted before raising, so leaving the transaction doesn't roll the attempt back.
            LoginCode.objects.filter(pk=login_code.pk).update(attempts=F("attempts") + 1)
    if not matches:
        raise InvalidCode
    return email


def check_token(token: str) -> str:
    """Uses up the pending code this magic-link token belongs to. Returns its email."""
    with transaction.atomic():
        login_code = LoginCode.objects.select_for_update().filter(token_hash=hash_token(token)).first()
        if login_code is None or not login_code.is_usable:
            raise InvalidCode
        login_code.delete()
    return login_code.email


def get_or_create_user(email: str, language: str) -> User:
    """Signing in and signing up are one flow: the first successful sign-in creates the account."""
    user = User.objects.filter(email=email).first()
    if user is None:
        user = User.objects.create_user(email, language=language)
    if not user.is_active:
        raise InvalidCode
    return user


def open_session(user: User, device_name: str) -> str:
    """Starts a session and returns its bearer token. Only the token's hash is kept."""
    token = secrets.token_urlsafe(32)
    Session.objects.create(user=user, token_hash=hash_token(token), device_name=device_name[:200])
    return token


def clear_expired_login_codes() -> int:
    deleted, _ = LoginCode.objects.filter(expires_at__lte=timezone.now()).delete()
    return deleted
