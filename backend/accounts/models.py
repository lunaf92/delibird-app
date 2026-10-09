from __future__ import annotations

from typing import Any, ClassVar

from django.conf import settings
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


def normalize_email(email: str) -> str:
    """Emails are stored and compared in lowercase, so Ann@Example.com and ann@example.com are one account."""
    return email.strip().lower()


class Language(models.TextChoices):
    ENGLISH = "en", _("English")
    ITALIAN = "it", _("Italian")
    SPANISH = "es", _("Spanish")


class Look(models.TextChoices):
    """The app's hand-drawn colour schemes."""

    INK = "ink", _("Black ink")
    PAPER = "paper", _("Paper and red marker")
    CHALK = "chalk", _("Chalkboard")
    SKY = "sky", _("Light blue")
    MEADOW = "meadow", _("Green")


class DarkMode(models.TextChoices):
    FOLLOW = "follow", _("Follow my phone")
    LIGHT = "light", _("Always light")
    DARK = "dark", _("Always dark")


class UserManager(BaseUserManager["User"]):
    def create_user(self, email: str, **extra_fields: Any) -> User:
        user = self.model(email=normalize_email(email), **extra_fields)
        user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email: str, password: str | None = None, **extra_fields: Any) -> User:
        """Only superusers get a password, so they can sign in to the Django admin."""
        user = self.model(email=normalize_email(email), is_staff=True, is_superuser=True, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user


class User(AbstractBaseUser, PermissionsMixin):
    """An account. People sign in with a code sent to their email, never with a password."""

    email = models.EmailField(_("email"), unique=True)
    display_name = models.CharField(_("display name"), max_length=100, blank=True)
    language = models.CharField(_("language"), max_length=2, choices=Language, default=Language.ENGLISH)
    # How the app looks, kept on the account so it follows the person to every device.
    theme = models.CharField(_("look"), max_length=10, choices=Look, default=Look.INK)
    dark_mode = models.CharField(_("dark mode"), max_length=10, choices=DarkMode, default=DarkMode.FOLLOW)
    plain_font = models.BooleanField(_("plain font"), default=False)
    is_staff = models.BooleanField(_("staff status"), default=False)
    is_active = models.BooleanField(_("active"), default=True)
    date_joined = models.DateTimeField(_("date joined"), default=timezone.now)

    objects: ClassVar[UserManager] = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS: ClassVar[list[str]] = []

    class Meta:
        verbose_name = _("user")
        verbose_name_plural = _("users")

    def __str__(self) -> str:
        return self.email

    def clean(self) -> None:
        super().clean()
        self.email = normalize_email(self.email)


class LoginCode(models.Model):
    """A pending sign-in: a six-digit code and a magic-link token, both stored only as hashes."""

    email = models.EmailField(db_index=True)
    code_hash = models.CharField(max_length=64)
    token_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(db_index=True)
    attempts = models.PositiveSmallIntegerField(default=0)

    def __str__(self) -> str:
        return f"{self.email} (expires {self.expires_at:%Y-%m-%d %H:%M})"

    @property
    def is_usable(self) -> bool:
        return self.expires_at > timezone.now() and self.attempts < settings.LOGIN_CODE_MAX_ATTEMPTS


class Session(models.Model):
    """A signed-in device. The bearer token is stored only as a hash, so any session can be revoked."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="sessions")
    token_hash = models.CharField(max_length=64, unique=True)
    device_name = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering: ClassVar[list[str]] = ["-last_used_at"]

    def __str__(self) -> str:
        return f"{self.user} on {self.device_name or 'unknown device'}"
