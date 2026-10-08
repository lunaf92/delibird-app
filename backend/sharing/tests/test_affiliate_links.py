"""Shop links as the people a list is shared with see them, once affiliate links are switched on."""

import pytest
from django.urls import reverse
from pytest_django.fixtures import Settings
from rest_framework.test import APIClient

from affiliate.links import go_token
from sharing.services import NewShare, revoke, share_list
from wishlists.models import Item, Wishlist
from wishlists.services import create_wishlist, take_off_list
from wishlists.tests.helpers import add_item

pytestmark = pytest.mark.django_db

AMAZON = "https://www.amazon.it/dp/B0SCARF"


@pytest.fixture(autouse=True)
def switched_on(settings: Settings) -> None:
    settings.AFFILIATE_ENABLED = True
    settings.AFFILIATE_AMAZON_TAGS = {"amazon.it": "delibird-21"}


@pytest.fixture
def amazon_scarf(scarf: Item) -> Item:
    scarf.url = AMAZON
    scarf.save()
    return scarf


def shared_items(client: APIClient, token: str) -> list[dict[str, object]]:
    return client.get(reverse("shared", args=[token])).json()["items"]  # type: ignore[no-any-return]


def follow(client: APIClient, link: str) -> tuple[int, str | None]:
    response = client.get(link)
    return response.status_code, response.headers.get("Location")


def test_friends_get_a_delibird_link_that_adds_the_tag(amazon_scarf: Item, bob_share: NewShare) -> None:
    [item] = shared_items(APIClient(), bob_share.token)

    assert item["url"] == AMAZON
    assert item["affiliate"] is True
    assert str(item["shop_url"]).startswith("http://testserver/api/v1/go/")
    assert follow(APIClient(), str(item["shop_url"])) == (302, f"{AMAZON}?tag=delibird-21")


def test_signed_in_viewers_get_the_same(
    amazon_scarf: Item, bob_share: NewShare, christmas: Wishlist, bob_client: APIClient
) -> None:
    [item] = bob_client.get(reverse("shared-with-me-list", args=[christmas.pk])).json()["items"]

    assert item["affiliate"] is True
    assert follow(APIClient(), item["shop_url"]) == (302, f"{AMAZON}?tag=delibird-21")


def test_the_owner_always_sees_their_own_link(
    amazon_scarf: Item, bob_share: NewShare, client: APIClient
) -> None:
    [shared] = shared_items(client, bob_share.token)
    own = client.get(reverse("item", args=[amazon_scarf.pk])).json()

    assert (shared["shop_url"], shared["affiliate"]) == (AMAZON, False)
    assert own["url"] == AMAZON
    assert "shop_url" not in own


def test_links_without_a_rule_or_already_tagged_are_unchanged(scarf: Item, bob_share: NewShare) -> None:
    for url in ("", "https://shop.example.com/scarf", f"{AMAZON}?tag=someone-else-21"):
        scarf.url = url
        scarf.save()
        [item] = shared_items(APIClient(), bob_share.token)
        assert (item["shop_url"], item["affiliate"]) == (url, False)


def test_everything_is_unchanged_when_switched_off(
    amazon_scarf: Item, bob_share: NewShare, settings: Settings
) -> None:
    settings.AFFILIATE_ENABLED = False

    [item] = shared_items(APIClient(), bob_share.token)

    assert (item["shop_url"], item["affiliate"]) == (AMAZON, False)


def test_a_link_handed_out_before_switching_off_goes_to_the_plain_link(
    amazon_scarf: Item, bob_share: NewShare, settings: Settings
) -> None:
    [item] = shared_items(APIClient(), bob_share.token)
    settings.AFFILIATE_ENABLED = False

    assert follow(APIClient(), str(item["shop_url"])) == (302, AMAZON)


def test_the_link_stops_working_when_sharing_stops(amazon_scarf: Item, bob_share: NewShare) -> None:
    [item] = shared_items(APIClient(), bob_share.token)
    revoke(bob_share.share)

    assert follow(APIClient(), str(item["shop_url"]))[0] == 404


def test_the_link_stops_working_when_the_item_leaves_the_list(
    amazon_scarf: Item, bob_share: NewShare, christmas: Wishlist
) -> None:
    [item] = shared_items(APIClient(), bob_share.token)
    take_off_list(amazon_scarf, christmas)

    assert follow(APIClient(), str(item["shop_url"]))[0] == 404


def test_links_cannot_be_made_up_for_other_items(
    amazon_scarf: Item, bob_share: NewShare, christmas: Wishlist
) -> None:
    """A share only opens items on its own list, and a link can't be forged or edited."""
    other_list = create_wishlist(christmas.owner, "Birthday")
    hidden = add_item(other_list, name="Hidden", url="https://www.amazon.it/dp/B0HIDDEN")
    stranger = share_list(other_list, "carol@example.com")
    client = APIClient()

    assert follow(client, reverse("affiliate-go", args=[go_token(bob_share.share.pk, hidden.pk)]))[0] == 404
    assert (
        follow(client, reverse("affiliate-go", args=[go_token(stranger.share.pk, amazon_scarf.pk)]))[0] == 404
    )
    [item] = shared_items(client, bob_share.token)
    tampered = str(item["shop_url"]).rstrip("/")
    tampered = tampered[:-1] + ("A" if tampered[-1] != "A" else "B") + "/"
    assert follow(client, tampered)[0] == 404
    assert follow(client, reverse("affiliate-go", args=["made-up"]))[0] == 404


def test_the_redirect_ignores_sign_in_and_is_not_cached(amazon_scarf: Item, bob_share: NewShare) -> None:
    [item] = shared_items(APIClient(), bob_share.token)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION="Bearer not-a-real-session")

    response = client.get(str(item["shop_url"]))

    assert response.status_code == 302
    assert response.headers["Cache-Control"] == "no-store"
    assert response.headers["Referrer-Policy"] == "no-referrer"
