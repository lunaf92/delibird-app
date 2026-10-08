"""Affiliate links: Delibird can earn a small commission when a friend buys a gift through a shop link.

Off unless AFFILIATE_ENABLED is set. Stored links are never changed and the owner always sees their own
link. Only the people a list is shared with get a Delibird link (/go/...), which works out the affiliate
version when it's clicked, so tags can change or the feature can be switched off without touching any
item. A link that already carries someone's affiliate or referral code is left alone.
"""

from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from django.conf import settings
from django.core import signing
from django.urls import reverse
from rest_framework.request import Request

GO_SALT = "affiliate.go"

# Query parameters that affiliate networks and referral schemes put in links. A link with any of them
# already earns for someone, so it isn't touched.
REFERRAL_PARAMS = frozenset(
    {
        "tag",  # Amazon Associates
        "ascsubtag",
        "aff",
        "aff_id",
        "affid",
        "affiliate",
        "affiliate_id",
        "awc",  # Awin
        "clickref",
        "irclickid",  # Impact
        "ranmid",  # Rakuten
        "raneaid",
        "ransiteid",
        "sscid",  # ShareASale
        "campid",  # eBay Partner Network
        "referral",
        "referral_code",
        "ref_code",
    }
)


def amazon_tag(host: str) -> str | None:
    """The Amazon Associates tag for an Amazon site, from AFFILIATE_AMAZON_TAGS, e.g. amazon.it."""
    for domain, tag in settings.AFFILIATE_AMAZON_TAGS.items():
        if tag and (host == domain or host.endswith("." + domain)):
            return tag
    return None


def affiliate_url(url: str) -> str | None:
    """The affiliate version of a shop link, or None when the feature is off, the shop has no rule, or the
    link already carries someone's code."""
    if not settings.AFFILIATE_ENABLED or not url:
        return None
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        return None
    query = parse_qsl(parts.query, keep_blank_values=True)
    if any(key.lower() in REFERRAL_PARAMS for key, _value in query):
        return None
    tag = amazon_tag(parts.hostname.lower())
    if tag is None:
        return None
    return urlunsplit(parts._replace(query=urlencode([*query, ("tag", tag)])))


def go_token(share_id: int, item_id: int) -> str:
    return signing.dumps([share_id, item_id], salt=GO_SALT, compress=True)


def read_go_token(token: str) -> tuple[int, int] | None:
    try:
        share_id, item_id = signing.loads(token, salt=GO_SALT)
    except (signing.BadSignature, ValueError, TypeError):
        return None
    if not isinstance(share_id, int) or not isinstance(item_id, int):
        return None
    return share_id, item_id


def shop_link(request: Request | None, url: str, item_id: int, share_id: int | None) -> tuple[str, bool]:
    """The link someone opens for an item, and whether it may earn a commission. `share_id` is the share the
    person sees the list through, or None for the owner, whose links are never changed."""
    if share_id is None or affiliate_url(url) is None:
        return url, False
    path = reverse("affiliate-go", args=[go_token(share_id, item_id)])
    return (request.build_absolute_uri(path) if request else path), True
