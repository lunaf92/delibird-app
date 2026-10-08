import pytest
from pytest_django.fixtures import Settings

from affiliate.links import affiliate_url, go_token, read_go_token


@pytest.fixture(autouse=True)
def amazon_tags(settings: Settings) -> None:
    settings.AFFILIATE_ENABLED = True
    settings.AFFILIATE_AMAZON_TAGS = {
        "amazon.it": "delibird-21",
        "amazon.co.uk": "delibird-uk-21",
        "amazon.es": "",
    }


def test_off_by_default_changes_nothing(settings: Settings) -> None:
    settings.AFFILIATE_ENABLED = False

    assert affiliate_url("https://www.amazon.it/dp/B0SCARF") is None


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://www.amazon.it/dp/B0SCARF", "https://www.amazon.it/dp/B0SCARF?tag=delibird-21"),
        ("https://amazon.it/dp/B0SCARF", "https://amazon.it/dp/B0SCARF?tag=delibird-21"),
        (
            "https://www.amazon.it/Sciarpa/dp/B0SCARF/ref=sr_1_1?keywords=sciarpa&th=1",
            "https://www.amazon.it/Sciarpa/dp/B0SCARF/ref=sr_1_1?keywords=sciarpa&th=1&tag=delibird-21",
        ),
        (
            "https://WWW.AMAZON.CO.UK/dp/B0BIKE#reviews",
            "https://WWW.AMAZON.CO.UK/dp/B0BIKE?tag=delibird-uk-21#reviews",
        ),
    ],
)
def test_amazon_links_get_the_tag_for_their_site(url: str, expected: str) -> None:
    assert affiliate_url(url) == expected


@pytest.mark.parametrize(
    "url",
    [
        "https://www.amazon.it/dp/B0SCARF?tag=someone-else-21",  # Already earns for someone.
        "https://www.amazon.it/dp/B0SCARF?TAG=someone-else-21",
        "https://www.amazon.it/dp/B0SCARF?ascsubtag=x",
        "https://www.amazon.es/dp/B0SCARF",  # No tag set for this site.
        "https://www.amazon.de/dp/B0SCARF",  # Not configured at all.
        "https://amzn.eu/d/abc123",  # Short links can't be tagged without following them.
        "https://notamazon.it/dp/B0SCARF",
        "https://www.amazon.it.example.com/dp/B0SCARF",
        "https://shop.example.com/scarf?awc=1234_abc",
        "https://shop.example.com/scarf",
        "ftp://www.amazon.it/dp/B0SCARF",
        "",
    ],
)
def test_other_links_are_left_alone(url: str) -> None:
    assert affiliate_url(url) is None


def test_go_tokens_round_trip_and_reject_tampering() -> None:
    token = go_token(7, 42)

    assert read_go_token(token) == (7, 42)
    assert read_go_token(token[:-1] + ("A" if token[-1] != "A" else "B")) is None
    assert read_go_token("not-a-token") is None
    assert read_go_token("") is None
