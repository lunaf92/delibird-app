"""The reservation leak suite: nothing the owner can see may change when items on their lists are reserved.

For every API route the owner can call, the same requests are made twice as the owner, once with nothing
reserved and once with every item on every list reserved, and the responses (status, headers and body) must
be identical. Edits and deletes run inside a savepoint that is rolled back, so both rounds start from the
same data; only values that differ between any two requests (new ids, timestamps, random file names and
tokens) are masked. A route added to the API fails `test_every_api_route_is_in_the_leak_suite` until it is
added here.
"""

import re
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any

import pytest
from django.contrib import admin
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import transaction
from django.test.client import Client
from django.urls import URLPattern, URLResolver, get_resolver, reverse
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import User
from accounts.services import open_session
from notifications import push
from notifications import services as notifications
from notifications.models import PushDevice
from sharing.models import Reservation
from sharing.services import join, share_list
from wishlists.models import Item, Wishlist
from wishlists.services import create_wishlist, put_on_list
from wishlists.tests.helpers import add_item

pytestmark = pytest.mark.django_db

# Routes that never touch lists, items or reservations, and are called before anyone is signed in.
NOT_OWNER_FACING = {"health", "schema", "docs", "auth-verify"}


@dataclass
class World:
    owner: User
    owner_token: str
    default: Wishlist
    christmas: Wishlist
    birthday: Wishlist
    items: list[Item]
    share_tokens: dict[str, str]
    share_ids: dict[str, int]
    other_session_id: int
    viewers: list[User]


def picture() -> SimpleUploadedFile:
    buffer = BytesIO()
    Image.new("RGB", (40, 30), (10, 120, 60)).save(buffer, format="PNG")
    return SimpleUploadedFile("photo.png", buffer.getvalue(), content_type="image/png")


@pytest.fixture
def world(tmp_path: Path, settings: Any) -> World:
    settings.MEDIA_ROOT = tmp_path
    ann = User.objects.create_user("ann@example.com", display_name="Ann")
    bob = User.objects.create_user("bob@example.com", display_name="Bob")
    carol = User.objects.create_user("carol@example.com", display_name="")
    default = ann.wishlists.get(is_default=True)
    christmas = create_wishlist(ann, "Christmas")
    birthday = create_wishlist(ann, "Birthday")
    items = [
        add_item(default, name="Book", price="12.50", currency="EUR", rating=3),
        add_item(default, name="Socks"),
        add_item(christmas, name="Wool scarf", url="https://shop.example.com/scarf", description="Green"),
        add_item(christmas, name="Bike", price="499.00", currency="GBP", rating=5),
        add_item(birthday, name="Cake"),
    ]
    items[2].image.save("x.jpg", picture(), save=True)
    # The bike is on two shared lists, so a reservation made through one shows on the other.
    put_on_list(items[3], birthday)

    shares = {
        "bob-christmas": share_list(christmas, "bob@example.com"),
        "carol-christmas": share_list(christmas, "carol@example.com"),
        "carol-default": share_list(default, "carol@example.com"),
        "dave-birthday": share_list(birthday, "dave@example.com"),  # Invited, never accepted.
    }
    join(shares["bob-christmas"].share, bob)
    join(shares["carol-christmas"].share, carol)
    join(shares["carol-default"].share, carol)

    PushDevice.objects.create(user=ann, token="ExponentPushToken[ann-phone]", platform="android")
    owner_token = open_session(ann, "Laptop")
    open_session(ann, "Phone")
    other = ann.sessions.get(device_name="Phone")
    return World(
        owner=ann,
        owner_token=owner_token,
        default=default,
        christmas=christmas,
        birthday=birthday,
        items=items,
        share_tokens={name: new.token for name, new in shares.items()},
        share_ids={name: new.share.pk for name, new in shares.items()},
        other_session_id=other.pk,
        viewers=[bob, carol],
    )


def reserve_everything(world: World) -> None:
    """Every item on every list gets reserved, some by each viewer, including the never-shared list."""
    for index, item in enumerate(Item.objects.filter(owner=world.owner)):
        Reservation.objects.create(item=item, buyer=world.viewers[index % 2])


@pytest.fixture(autouse=True)
def push_outbox(monkeypatch: pytest.MonkeyPatch) -> list[Any]:
    """Push messages are recorded instead of sent to Expo."""
    sent: list[Any] = []

    def fake_post(url: str, payload: Any) -> Any:
        if isinstance(payload, list):
            sent.extend(payload)
            return {
                "data": [{"status": "ok", "id": f"ticket-{len(sent)}-{i}"} for i, _ in enumerate(payload)]
            }
        return {"data": {}}

    monkeypatch.setattr(push, "post_json", fake_post)
    return sent


@dataclass
class Call:
    route: str
    method: str
    url: Callable[[World], str]
    body: Callable[[World], Any] | None = None
    changes_data: bool = False
    multipart: bool = False
    signed_in: bool = True


CALLS: list[Call] = [
    # Accounts
    Call("me", "get", lambda w: reverse("me")),
    Call("me", "patch", lambda w: reverse("me"), lambda w: {"display_name": "Annie"}, changes_data=True),
    Call("me", "delete", lambda w: reverse("me"), changes_data=True),
    Call("auth-sessions", "get", lambda w: reverse("auth-sessions")),
    Call(
        "auth-session",
        "delete",
        lambda w: reverse("auth-session", args=[w.other_session_id]),
        changes_data=True,
    ),
    Call("auth-logout", "post", lambda w: reverse("auth-logout"), changes_data=True),
    Call(
        "auth-request-code",
        "post",
        lambda w: reverse("auth-request-code"),
        lambda w: {"email": "ann@example.com"},
        changes_data=True,
        signed_in=False,
    ),
    # Lists
    Call("lists", "get", lambda w: reverse("lists")),
    Call("lists", "post", lambda w: reverse("lists"), lambda w: {"name": "Wedding"}, changes_data=True),
    Call(
        "lists-reorder",
        "post",
        lambda w: reverse("lists-reorder"),
        lambda w: {"ids": [w.birthday.pk, w.christmas.pk, w.default.pk]},
        changes_data=True,
    ),
    Call("list", "get", lambda w: reverse("list", args=[w.christmas.pk])),
    Call("list", "get", lambda w: reverse("list", args=[w.default.pk])),
    Call("list", "get", lambda w: reverse("list", args=[w.birthday.pk])),
    Call(
        "list",
        "patch",
        lambda w: reverse("list", args=[w.christmas.pk]),
        lambda w: {"name": "Xmas"},
        changes_data=True,
    ),
    Call("list", "delete", lambda w: reverse("list", args=[w.christmas.pk]), changes_data=True),
    Call("list", "delete", lambda w: reverse("list", args=[w.birthday.pk]), changes_data=True),
    Call("list", "delete", lambda w: reverse("list", args=[w.default.pk]), changes_data=True),
    # Items
    Call("list-items", "get", lambda w: reverse("list-items", args=[w.christmas.pk])),
    Call("list-items", "get", lambda w: reverse("list-items", args=[w.birthday.pk])),
    Call("list-items", "get", lambda w: reverse("list-items", args=[w.default.pk])),
    Call(
        "list-items",
        "post",
        lambda w: reverse("list-items", args=[w.christmas.pk]),
        lambda w: {"name": "Gloves", "price": "20.00"},
        changes_data=True,
    ),
    Call(
        "list-items-reorder",
        "post",
        lambda w: reverse("list-items-reorder", args=[w.christmas.pk]),
        lambda w: {"ids": [w.items[3].pk, w.items[2].pk]},
        changes_data=True,
    ),
    Call("item", "get", lambda w: reverse("item", args=[w.items[2].pk])),
    Call("item", "get", lambda w: reverse("item", args=[w.items[0].pk])),
    Call("item", "get", lambda w: reverse("item", args=[w.items[3].pk])),
    Call(
        "item",
        "patch",
        lambda w: reverse("item", args=[w.items[2].pk]),
        lambda w: {"name": "Red wool scarf", "rating": 2},
        changes_data=True,
    ),
    Call(
        "item",
        "patch",
        lambda w: reverse("item", args=[w.items[3].pk]),
        lambda w: {"wishlist": w.default.pk},
        changes_data=True,
    ),
    Call(
        "item",
        "patch",
        lambda w: reverse("item", args=[w.items[3].pk]),
        lambda w: {"lists": [w.christmas.pk]},
        changes_data=True,
    ),
    Call("item", "delete", lambda w: reverse("item", args=[w.items[2].pk]), changes_data=True),
    Call("item", "delete", lambda w: reverse("item", args=[w.items[3].pk]), changes_data=True),
    # Putting items on lists and taking them off.
    Call(
        "list-item",
        "put",
        lambda w: reverse("list-item", args=[w.christmas.pk, w.items[1].pk]),
        changes_data=True,
    ),
    Call(
        "list-item",
        "delete",
        lambda w: reverse("list-item", args=[w.christmas.pk, w.items[3].pk]),
        changes_data=True,
    ),
    Call(
        "list-item",
        "delete",
        lambda w: reverse("list-item", args=[w.birthday.pk, w.items[3].pk]),
        changes_data=True,
    ),
    Call(
        "list-item",
        "delete",
        lambda w: reverse("list-item", args=[w.default.pk, w.items[2].pk]),
        changes_data=True,
    ),
    Call("item", "delete", lambda w: reverse("item", args=[w.items[4].pk]), changes_data=True),
    Call(
        "item-image",
        "put",
        lambda w: reverse("item-image", args=[w.items[3].pk]),
        lambda w: {"image": picture()},
        changes_data=True,
        multipart=True,
    ),
    Call("item-image", "delete", lambda w: reverse("item-image", args=[w.items[2].pk]), changes_data=True),
    # Sharing, as the owner
    Call("list-shares", "get", lambda w: reverse("list-shares", args=[w.christmas.pk])),
    Call("list-shares", "get", lambda w: reverse("list-shares", args=[w.birthday.pk])),
    Call(
        "list-shares",
        "post",
        lambda w: reverse("list-shares", args=[w.christmas.pk]),
        lambda w: {"email": "erin@example.com"},
        changes_data=True,
    ),
    Call(
        "share", "delete", lambda w: reverse("share", args=[w.share_ids["bob-christmas"]]), changes_data=True
    ),
    Call("shared", "get", lambda w: reverse("shared", args=[w.share_tokens["bob-christmas"]])),
    Call("shared", "get", lambda w: reverse("shared", args=[w.share_tokens["dave-birthday"]])),
    Call("shared", "get", lambda w: reverse("shared", args=[w.share_tokens["carol-default"]])),
    Call(
        "shared-join",
        "post",
        lambda w: reverse("shared-join", args=[w.share_tokens["carol-default"]]),
        changes_data=True,
    ),
    Call("shared-with-me", "get", lambda w: reverse("shared-with-me")),
    Call("shared-with-me-list", "get", lambda w: reverse("shared-with-me-list", args=[w.christmas.pk])),
    # Push notifications for the owner's phone.
    Call(
        "devices",
        "post",
        lambda w: reverse("devices"),
        lambda w: {"token": "ExponentPushToken[ann-tablet]", "platform": "ios"},
        changes_data=True,
    ),
    Call(
        "devices",
        "delete",
        lambda w: reverse("devices"),
        lambda w: {"token": "ExponentPushToken[ann-phone]"},
        changes_data=True,
    ),
    # Reserving is refused for the owner exactly as for an item that does not exist.
    Call(
        "item-reservation",
        "post",
        lambda w: reverse("item-reservation", args=[w.items[2].pk]),
        changes_data=True,
    ),
    Call(
        "item-reservation",
        "delete",
        lambda w: reverse("item-reservation", args=[w.items[3].pk]),
        changes_data=True,
    ),
]

VOLATILE_KEYS = re.compile(r"(_at|^id|^link|^token)$")
FILE_NAMES = re.compile(r"/media/items/[0-9a-f]{32}\.jpg")


def mask(value: Any, key: str = "") -> Any:
    if isinstance(value, dict):
        return {k: mask(v, k) for k, v in value.items()}
    if isinstance(value, list):
        return [mask(v, key) for v in value]
    if VOLATILE_KEYS.search(key):
        return "<masked>"
    if isinstance(value, str):
        return FILE_NAMES.sub("/media/items/<file>.jpg", value)
    return value


def masked_email(text: str) -> str:
    return re.sub(r"token=[\w-]+", "token=<masked>", re.sub(r"\b\d{6}\b", "<code>", text))


def perform(world: World, call: Call) -> dict[str, Any]:
    client = APIClient()
    if call.signed_in:
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {world.owner_token}")
    body = call.body(world) if call.body else None
    send = getattr(client, call.method)
    response = send(call.url(world), body, format="multipart" if call.multipart else "json")
    headers = {k: v for k, v in response.items() if k.lower() not in {"content-length"}}
    content: Any = response.content
    if call.changes_data and content:
        content = mask(response.json())
    return {"status": response.status_code, "headers": headers, "body": content}


def run_all(world: World, push_outbox: list[Any]) -> list[dict[str, Any]]:
    results = []
    for call in CALLS:
        mail.outbox.clear()
        push_outbox.clear()
        if call.changes_data:
            savepoint = transaction.savepoint_create()
            result = perform(world, call)
            # Whatever the notifications worker would send after this request is part of what the owner sees.
            notifications.notify_buyers()
            notifications.remove_orphaned_reservations()
            notifications.send_pending()
            transaction.savepoint_rollback(savepoint)
        else:
            result = perform(world, call)
        result["emails"] = [
            (m.to, masked_email(str(m.subject)), masked_email(str(m.body)))
            for m in mail.outbox
            if "ann@example.com" in m.to
        ]
        result["pushes"] = [message for message in push_outbox if "ann-" in str(message["to"])]
        results.append({"call": f"{call.method.upper()} {call.route}", **result})
    return results


def test_owner_sees_nothing_change_when_everything_is_reserved(world: World, push_outbox: list[Any]) -> None:
    item_rows_before = list(Item.objects.order_by("pk").values())
    before = run_all(world, push_outbox)

    reserve_everything(world)
    assert Reservation.objects.count() == 5

    assert list(Item.objects.order_by("pk").values()) == item_rows_before
    after = run_all(world, push_outbox)
    for expected, actual in zip(before, after, strict=True):
        assert actual == expected, expected["call"]


def test_owner_cannot_reserve_and_is_told_the_item_does_not_exist(world: World) -> None:
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {world.owner_token}")
    missing = client.post(reverse("item-reservation", args=[999999]))
    reserve_everything(world)

    for item in world.items:
        for method in ("post", "delete"):
            response = getattr(client, method)(reverse("item-reservation", args=[item.pk]))
            assert (response.status_code, response.content) == (missing.status_code, missing.content)


def test_reservations_are_hidden_from_the_django_admin() -> None:
    assert Reservation not in admin.site._registry


def test_admin_item_pages_do_not_change_when_reserved(world: World) -> None:
    world.owner.is_staff = world.owner.is_superuser = True
    world.owner.save()
    client = Client()
    client.force_login(world.owner)
    pages = [
        reverse("admin:wishlists_item_changelist"),
        reverse("admin:wishlists_item_change", args=[world.items[2].pk]),
        reverse("admin:wishlists_wishlist_change", args=[world.christmas.pk]),
        reverse("admin:index"),
    ]
    before = [client.get(page).content for page in pages]
    reserve_everything(world)
    after = [client.get(page).content for page in pages]

    masked = [re.sub(rb'name="csrfmiddlewaretoken" value="[^"]+"', b"", page) for page in before]
    assert [re.sub(rb'name="csrfmiddlewaretoken" value="[^"]+"', b"", page) for page in after] == masked


def api_route_names() -> set[str]:
    def walk(patterns: list[URLPattern | URLResolver], prefix: str) -> Iterator[tuple[str, str | None]]:
        for pattern in patterns:
            route = prefix + str(pattern.pattern)
            if isinstance(pattern, URLResolver):
                yield from walk(pattern.url_patterns, route)
            else:
                yield route, pattern.name

    return {
        name or route for route, name in walk(get_resolver().url_patterns, "") if route.startswith("api/v1/")
    }


def test_every_api_route_is_in_the_leak_suite() -> None:
    covered = {call.route for call in CALLS}
    assert api_route_names() - NOT_OWNER_FACING == covered
