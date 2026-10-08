"""Reading a product's name, price, currency, description and picture from a shop page.

Sources, best first: schema.org Product data (JSON-LD), then Open Graph and product meta tags, then the
page title. Anything not found is left empty for the person to type.
"""

import html
import json
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin

CURRENCY_SYMBOLS = {"€": "EUR", "£": "GBP", "$": "USD", "CHF": "CHF"}


@dataclass
class Product:
    name: str = ""
    description: str = ""
    price: str | None = None
    currency: str | None = None
    image_url: str | None = None

    @property
    def found_anything(self) -> bool:
        return bool(self.name or self.price or self.image_url)


class PageReader(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.meta: dict[str, str] = {}
        self.json_ld: list[str] = []
        self.title = ""
        self._in_title = False
        self._in_json_ld = False
        self._buffer: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {k.lower(): (v or "") for k, v in attrs}
        if tag == "meta":
            key = (values.get("property") or values.get("name") or values.get("itemprop") or "").lower()
            if key and "content" in values and key not in self.meta:
                self.meta[key] = values["content"].strip()
        elif tag == "title" and not self.title:
            self._in_title = True
            self._buffer = []
        elif tag == "script" and values.get("type", "").lower() == "application/ld+json":
            self._in_json_ld = True
            self._buffer = []

    def handle_data(self, data: str) -> None:
        if self._in_title or self._in_json_ld:
            self._buffer.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "title" and self._in_title:
            self.title = " ".join("".join(self._buffer).split())
            self._in_title = False
        elif tag == "script" and self._in_json_ld:
            self.json_ld.append("".join(self._buffer))
            self._in_json_ld = False


def walk(node: Any) -> list[dict[str, Any]]:
    """Every JSON object in a JSON-LD document, including those inside @graph and lists."""
    found: list[dict[str, Any]] = []
    if isinstance(node, list):
        for child in node:
            found.extend(walk(child))
    elif isinstance(node, dict):
        found.append(node)
        for key in ("@graph", "mainEntity", "itemListElement"):
            if key in node:
                found.extend(walk(node[key]))
    return found


def is_product(node: dict[str, Any]) -> bool:
    kinds = node.get("@type")
    kinds = kinds if isinstance(kinds, list) else [kinds]
    return any(str(kind).lower() in ("product", "productgroup") for kind in kinds)


def first_text(value: Any) -> str:
    if isinstance(value, list):
        value = value[0] if value else ""
    if isinstance(value, dict):
        value = value.get("url") or value.get("contentUrl") or value.get("@id") or ""
    return html.unescape(str(value)).strip() if value is not None else ""


def offer_of(product: dict[str, Any]) -> dict[str, Any]:
    offers = product.get("offers") or {}
    if isinstance(offers, list):
        offers = offers[0] if offers else {}
    if isinstance(offers, dict) and offers.get("@type") == "AggregateOffer" and "lowPrice" in offers:
        return {"price": offers["lowPrice"], "priceCurrency": offers.get("priceCurrency")}
    if isinstance(offers, dict) and "priceSpecification" in offers and "price" not in offers:
        spec = offers["priceSpecification"]
        spec = spec[0] if isinstance(spec, list) and spec else spec
        if isinstance(spec, dict):
            return spec
    return offers if isinstance(offers, dict) else {}


def clean_price(value: Any) -> str | None:
    """'1.299,00', '1,299.00', '39.9', 39.9 → '1299.00', '1299.00', '39.90', '39.90'."""
    if value is None:
        return None
    text = re.sub(r"[^\d.,]", "", str(value))
    if not text:
        return None
    if "," in text and "." in text:
        decimal_mark = "," if text.rfind(",") > text.rfind(".") else "."
        text = text.replace("." if decimal_mark == "," else ",", "").replace(",", ".")
    elif "," in text:
        whole, _, fraction = text.rpartition(",")
        text = f"{whole.replace(',', '')}.{fraction}" if len(fraction) != 3 else text.replace(",", "")
    try:
        amount = Decimal(text)
    except InvalidOperation:
        return None
    if amount < 0 or amount >= Decimal("100000000"):
        return None
    return str(amount.quantize(Decimal("0.01")))


def clean_currency(value: Any) -> str | None:
    text = str(value or "").strip().upper()
    if text in CURRENCY_SYMBOLS:
        return CURRENCY_SYMBOLS[text]
    return text if re.fullmatch(r"[A-Z]{3}", text) else None


def read_product(page: str, base_url: str) -> Product:
    reader = PageReader()
    try:
        reader.feed(page)
        reader.close()
    except Exception:  # noqa: S110 - a broken page just yields whatever was read so far.
        pass

    product = Product()
    for block in reader.json_ld:
        try:
            data = json.loads(block)
        except ValueError:
            continue
        node = next((n for n in walk(data) if is_product(n)), None)
        if node is None:
            continue
        offer = offer_of(node)
        product.name = first_text(node.get("name"))
        product.description = first_text(node.get("description"))
        product.image_url = first_text(node.get("image")) or None
        product.price = clean_price(offer.get("price"))
        product.currency = clean_currency(offer.get("priceCurrency"))
        break

    meta = reader.meta
    product.name = product.name or meta.get("og:title") or meta.get("twitter:title") or reader.title
    product.description = product.description or meta.get("og:description") or meta.get("description") or ""
    product.image_url = product.image_url or meta.get("og:image") or meta.get("twitter:image") or None
    product.price = product.price or clean_price(
        meta.get("product:price:amount") or meta.get("og:price:amount") or meta.get("price")
    )
    product.currency = product.currency or clean_currency(
        meta.get("product:price:currency") or meta.get("og:price:currency") or meta.get("pricecurrency")
    )

    product.name = html.unescape(product.name).strip()[:200]
    product.description = " ".join(html.unescape(product.description).split())[:2000]
    if product.image_url:
        absolute = urljoin(base_url, product.image_url)
        product.image_url = absolute if absolute.startswith(("http://", "https://")) else None
    if product.price is None:
        product.currency = None
    return product
