from pathlib import Path

import pytest

from autofill.parse import clean_price, read_product

PAGES = Path(__file__).parent / "pages"


def page(name: str) -> str:
    return (PAGES / name).read_text()


def test_schema_org_product_in_a_graph() -> None:
    product = read_product(page("shopify_style.html"), "https://northern-knits.example.com/products/scarf")

    assert product.name == "Wool Scarf – Forest Green"
    assert product.description == "Soft merino, 180 cm long."
    assert (product.price, product.currency) == ("39.90", "EUR")
    # The first of several pictures, made absolute.
    assert product.image_url == "https://northern-knits.example.com/files/scarf-1.jpg"


def test_open_graph_and_product_meta_tags() -> None:
    product = read_product(page("woocommerce_style.html"), "https://studio.example.co.uk/mug")

    assert product.name == "Handmade Ceramic Mug"
    assert product.description == "Glazed by hand in Bristol."
    assert (product.price, product.currency) == ("1299.00", "GBP")
    assert product.image_url == "https://studio.example.co.uk/wp-content/uploads/mug.jpg"


def test_lists_aggregate_offers_and_continental_prices() -> None:
    product = read_product(page("italian_shop.html"), "https://negozio.example.it/bici")

    assert product.name == "Bicicletta da città"
    assert (product.price, product.currency) == ("1299.00", "EUR")
    assert product.image_url == "https://negozio.example.it/img/bici.jpg"


def test_the_title_is_the_last_resort() -> None:
    product = read_product(page("title_only.html"), "https://plants.example.com/monstera")

    assert product.name == "Monstera Deliciosa — Plant Shop"
    assert (product.price, product.currency, product.image_url) == (None, None, None)
    assert product.found_anything


def test_a_page_with_nothing_useful() -> None:
    product = read_product("<html><body><p>Hello</p></body></html>", "https://example.com/")

    assert not product.found_anything


def test_broken_html_does_not_crash() -> None:
    assert read_product("<html><head><title>Half a page", "https://example.com/").name == ""


def test_protocol_relative_and_odd_pictures() -> None:
    html = (
        '<meta property="og:title" content="X"><meta property="og:image" content="//cdn.example.com/a.jpg">'
    )
    assert read_product(html, "https://shop.example.com/x").image_url == "https://cdn.example.com/a.jpg"
    html = '<meta property="og:title" content="X"><meta property="og:image" content="javascript:alert(1)">'
    assert read_product(html, "https://shop.example.com/x").image_url is None


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("39.9", "39.90"),
        (39.9, "39.90"),
        ("39,90", "39.90"),
        ("1.299,00", "1299.00"),
        ("1,299.00", "1299.00"),
        ("1,299", "1299.00"),
        ("€ 12", "12.00"),
        ("", None),
        ("free", None),
        (None, None),
        ("123456789", None),
    ],
)
def test_prices(raw: object, expected: str | None) -> None:
    assert clean_price(raw) == expected


def test_currency_without_price_is_dropped() -> None:
    html = '<meta property="og:title" content="X"><meta property="product:price:currency" content="EUR">'
    product = read_product(html, "https://shop.example.com/x")

    assert (product.price, product.currency) == (None, None)
