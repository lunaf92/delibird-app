"""Sending push notifications through Expo's push service (which forwards to FCM and APNs)."""

import json
import logging
import urllib.request
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.utils import timezone

from notifications.models import PushDevice, PushTicket

logger = logging.getLogger(__name__)


@dataclass
class PushMessage:
    device: PushDevice
    title: str
    body: str
    data: dict[str, Any]


def post_json(url: str, payload: Any) -> Any:
    """POSTs JSON to Expo and returns the decoded answer. Replaced in tests."""
    request = urllib.request.Request(  # noqa: S310 - the URL comes from settings, not from users.
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=10) as response:  # noqa: S310
        return json.loads(response.read())


def send(messages: list[PushMessage]) -> None:
    """Sends up to 100 messages per request. Devices Expo no longer knows are removed."""
    if not settings.PUSH_ENABLED or not messages:
        return
    for start in range(0, len(messages), 100):
        batch = messages[start : start + 100]
        payload = [
            {"to": m.device.token, "title": m.title, "body": m.body, "data": m.data, "sound": "default"}
            for m in batch
        ]
        try:
            answer = post_json(settings.EXPO_PUSH_SEND_URL, payload)
        except OSError:
            logger.warning("Expo push service unreachable; %d messages not sent", len(batch))
            continue
        for message, ticket in zip(batch, answer.get("data", []), strict=False):
            if ticket.get("status") == "ok" and ticket.get("id"):
                PushTicket.objects.get_or_create(ticket_id=ticket["id"], defaults={"device": message.device})
            elif ticket.get("details", {}).get("error") == "DeviceNotRegistered":
                PushDevice.objects.filter(pk=message.device.pk).delete()


def check_receipts(older_than: timedelta = timedelta(minutes=15)) -> None:
    """Expo reports delivery problems in receipts a little after sending; drop devices that are gone."""
    if not settings.PUSH_ENABLED:
        return
    tickets = list(PushTicket.objects.filter(created_at__lte=timezone.now() - older_than)[:1000])
    if not tickets:
        return
    try:
        answer = post_json(settings.EXPO_PUSH_RECEIPTS_URL, {"ids": [t.ticket_id for t in tickets]})
    except OSError:
        logger.warning("Expo push service unreachable; receipts not checked")
        return
    receipts = answer.get("data", {})
    for ticket in tickets:
        receipt = receipts.get(ticket.ticket_id, {})
        if receipt.get("details", {}).get("error") == "DeviceNotRegistered":
            PushDevice.objects.filter(pk=ticket.device_id).delete()
    # A receipt is kept for a day at most; anything older is no use any more.
    PushTicket.objects.filter(pk__in=[t.pk for t in tickets]).delete()
