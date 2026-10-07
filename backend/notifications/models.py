from typing import ClassVar

from django.conf import settings
from django.db import models


class PushDevice(models.Model):
    """A phone that receives push notifications through Expo. Removed when Expo reports it gone."""

    class Platform(models.TextChoices):
        ANDROID = "android"
        IOS = "ios"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="push_devices")
    token = models.CharField(max_length=200, unique=True)
    platform = models.CharField(max_length=10, choices=Platform)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.user} ({self.platform})"


class Notification(models.Model):
    """Something to tell someone, by email and push. The worker drains the ones not yet sent."""

    class Kind(models.TextChoices):
        ITEM_CHANGED = "item_changed"
        ITEM_DELETED = "item_deleted"

    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    kind = models.CharField(max_length=20, choices=Kind)
    payload = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering: ClassVar[list[str]] = ["created_at", "id"]

    def __str__(self) -> str:
        return f"{self.kind} for {self.recipient}"


class PushTicket(models.Model):
    """An Expo push ticket, checked later for a receipt in case the device is gone."""

    device = models.ForeignKey(PushDevice, on_delete=models.CASCADE, related_name="+")
    ticket_id = models.CharField(max_length=100, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.ticket_id
