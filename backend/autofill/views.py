from datetime import timedelta
from typing import cast

from django.core.files.base import ContentFile
from django.core.validators import URLValidator
from django.shortcuts import get_object_or_404
from django.utils.translation import gettext as _
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.exceptions import Throttled, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.services import rate_limited
from autofill.fetch import FetchFailed, FetchRefused, fetch
from autofill.parse import read_product
from wishlists.images import InvalidImage, normalise_image
from wishlists.models import Item
from wishlists.serializers import ItemSerializer
from wishlists.signals import item_edited
from wishlists.views import item_response

MAX_PAGE_BYTES = 2 * 1024 * 1024
MAX_IMAGE_BYTES = 10 * 1024 * 1024
# Each fetch makes the server go out to the internet, so keep it to what a person plausibly does by hand.
RATE_LIMIT = (30, timedelta(minutes=10))


class LinkSerializer(serializers.Serializer[None]):
    url = serializers.CharField(max_length=2000, validators=[URLValidator(schemes=["http", "https"])])


class AutofillSerializer(serializers.Serializer[None]):
    found = serializers.BooleanField(
        help_text="Whether anything was read. If not, keep the link and type the rest."
    )
    url = serializers.CharField(help_text="The link to save: the one sent, or where it led.")
    name = serializers.CharField(allow_blank=True)
    description = serializers.CharField(allow_blank=True)
    price = serializers.DecimalField(max_digits=10, decimal_places=2, allow_null=True)
    currency = serializers.CharField(allow_null=True)
    image_url = serializers.CharField(allow_null=True, help_text="A picture to fetch with image/from-url/.")


def owner(request: Request) -> User:
    return cast(User, request.user)


def check_rate(request: Request) -> None:
    count, window = RATE_LIMIT
    if rate_limited(f"autofill:user:{request.user.pk}", count, window):
        raise Throttled(wait=window.total_seconds(), detail=_("Too many links at once. Wait a few minutes."))


def link_from(request: Request) -> str:
    serializer = LinkSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    return str(serializer.validated_data["url"])


def refused(error: FetchRefused) -> ValidationError:
    return ValidationError({"url": [_("This link can't be read: it isn't a public web address.")]})


class AutofillView(APIView):
    """Reads a shop page and suggests the item's name, price, currency, description and picture. When the
    shop can't be read, `found` is false and the link is still returned, so it can be saved as it is."""

    @extend_schema(request=LinkSerializer, responses={200: AutofillSerializer})
    def post(self, request: Request) -> Response:
        url = link_from(request)
        check_rate(request)
        empty = {"found": False, "url": url, "name": "", "description": "", "price": None, "currency": None}
        try:
            page = fetch(url, accept=("text/html", "application/xhtml"), max_bytes=MAX_PAGE_BYTES)
        except FetchRefused as error:
            raise refused(error) from error
        except FetchFailed:
            return Response({**empty, "image_url": None})
        product = read_product(page.body.decode("utf-8", errors="replace"), page.url)
        return Response(
            {
                "found": product.found_anything,
                "url": url,
                "name": product.name,
                "description": product.description,
                "price": product.price,
                "currency": product.currency,
                "image_url": product.image_url,
            }
        )


class ImageFromUrlView(APIView):
    """Downloads a picture (for example the one autofill found) and stores it as the item's picture."""

    @extend_schema(request=LinkSerializer, responses={200: ItemSerializer})
    def post(self, request: Request, pk: int) -> Response:
        item = get_object_or_404(Item.objects.filter(owner=owner(request)), pk=pk)
        url = link_from(request)
        check_rate(request)
        try:
            image = fetch(url, accept=("image/",), max_bytes=MAX_IMAGE_BYTES)
            content = normalise_image(ContentFile(image.body, name="picture"))
        except FetchRefused as error:
            raise refused(error) from error
        except (FetchFailed, InvalidImage) as error:
            raise ValidationError(
                {"url": [_("That picture couldn't be downloaded. Add one from your device.")]}
            ) from error
        old = item.image.name if item.image else None
        item.image.save(content.name or "image.jpg", content, save=True)
        if old:
            item.image.storage.delete(old)
        item_edited.send(sender=Item, item=item, deleted=False)
        return item_response(request, item)
