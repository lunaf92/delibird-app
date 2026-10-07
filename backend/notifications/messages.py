"""What each notification says, in the recipient's language, by email and as a push message."""

from dataclasses import dataclass
from typing import Any

from django.conf import settings
from django.template.loader import render_to_string
from django.utils import translation
from django.utils.translation import gettext as _


@dataclass
class Message:
    subject: str
    push_title: str
    push_body: str
    text: str
    html: str
    path: str


def app_link(path: str) -> str:
    return f"{settings.APP_URL.rstrip('/')}{path}"


def compose(kind: str, payload: dict[str, Any], language: str) -> Message:
    with translation.override(language):
        names = {
            "owner": payload["owner_name"],
            "list": payload["list_name"],
            "item": payload.get("item_name", ""),
        }
        if kind == "list_shared":
            subject = _("%(owner)s shared a wishlist with you: %(list)s") % names
            push_title = _("A list was shared with you")
            push_body = _("%(owner)s shared “%(list)s” with you.") % names
            path = payload["path"]
            link = payload["link"]
        elif kind == "item_changed":
            subject = _("“%(item)s” changed") % names
            push_title = subject
            push_body = (
                _("%(owner)s changed something you're getting. Take a look before you buy it.") % names
            )
            path = f"/shared-with-me/{payload['list_id']}"
            link = app_link(path)
        else:
            subject = _("“%(item)s” was removed") % names
            push_title = subject
            push_body = _("%(owner)s removed something you were getting from “%(list)s”.") % names
            path = f"/shared-with-me/{payload['list_id']}"
            link = app_link(path)
        context = {"kind": kind, "link": link, **names}
        return Message(
            subject=subject,
            push_title=push_title,
            push_body=push_body,
            text=render_to_string("notifications/email/notification.txt", context),
            html=render_to_string("notifications/email/notification.html", context),
            path=path,
        )
