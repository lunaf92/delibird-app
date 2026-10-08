from typing import Any, cast

from django.db.models import Count, Q, QuerySet
from django.shortcuts import get_object_or_404
from django.utils.translation import gettext as _
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from wishlists import services
from wishlists.images import InvalidImage, normalise_image
from wishlists.models import Item, Wishlist
from wishlists.serializers import (
    ImageUploadSerializer,
    ItemSerializer,
    ReorderSerializer,
    WishlistDetailSerializer,
    WishlistSerializer,
    shared_list_ids,
)
from wishlists.signals import item_edited


def owner(request: Request) -> User:
    return cast(User, request.user)


def own_wishlists(request: Request) -> QuerySet[Wishlist]:
    # Explicit order: the aggregate's GROUP BY would otherwise drop Meta.ordering.
    return (
        Wishlist.objects.filter(owner=owner(request))
        .annotate(
            item_count=Count("entries", distinct=True),
            # Depends only on the list's shares, never on reservations.
            share_count=Count("shares", filter=Q(shares__revoked_at__isnull=True), distinct=True),
        )
        .order_by("position", "id")
    )


def own_items(request: Request) -> QuerySet[Item]:
    return Item.objects.filter(owner=owner(request)).prefetch_related("entries")


def item_response(request: Request, item: Item, status_code: int = status.HTTP_200_OK) -> Response:
    item = own_items(request).get(pk=item.pk)
    return Response(ItemSerializer(item, context={"request": request}).data, status=status_code)


def ordered(request: Request, reorder: Any) -> Response:
    serializer = ReorderSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        reorder(serializer.validated_data["ids"])
    except services.WrongOrder as error:
        raise ValidationError({"ids": [_("Send every id exactly once, in the new order.")]}) from error
    return Response(status=status.HTTP_204_NO_CONTENT)


class WishlistListView(generics.ListCreateAPIView[Wishlist]):
    """The signed-in person's lists, default list included, in their chosen order."""

    serializer_class = WishlistSerializer
    pagination_class = None

    def get_queryset(self) -> QuerySet[Wishlist]:
        return own_wishlists(self.request)

    def create(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        wishlist = services.create_wishlist(owner(request), serializer.validated_data["name"])
        created = self.get_queryset().get(pk=wishlist.pk)
        return Response(self.get_serializer(created).data, status=status.HTTP_201_CREATED)


class WishlistDetailView(generics.RetrieveUpdateDestroyAPIView[Wishlist]):
    """One list with its items. The default list holds every item; it can be renamed but not deleted.
    Deleting another list takes its items off it, but keeps them on the default list."""

    serializer_class = WishlistDetailSerializer
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_queryset(self) -> QuerySet[Wishlist]:
        return own_wishlists(self.request)

    def perform_destroy(self, instance: Wishlist) -> None:
        if instance.is_default:
            raise ValidationError({"detail": _("Your default list can't be deleted.")})
        for item in services.list_items(instance):
            services.take_off_list(item, instance)
        instance.delete()


class WishlistReorderView(APIView):
    """Sets the order of all the signed-in person's lists."""

    @extend_schema(request=ReorderSerializer, responses={204: None})
    def post(self, request: Request) -> Response:
        return ordered(request, lambda ids: services.reorder_lists(owner(request), ids))


class ItemListView(generics.ListCreateAPIView[Item]):
    """The items on one list, in that list's order. A new item goes at the end of this list and of the
    default list, and of any other lists named in `lists`."""

    serializer_class = ItemSerializer
    pagination_class = None

    def wishlist(self) -> Wishlist:
        return get_object_or_404(Wishlist, pk=self.kwargs["pk"], owner=owner(self.request))

    def get_queryset(self) -> QuerySet[Item]:
        return services.list_items(self.wishlist()).prefetch_related("entries")

    def get_serializer_context(self) -> dict[str, Any]:
        return {
            **super().get_serializer_context(),
            "shared_list_ids": shared_list_ids(owner(self.request).pk),
        }

    def create(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        lists = [self.wishlist(), *data.pop("lists", [])]
        item = services.add_item(owner(request), lists, **data)
        return item_response(request, item, status.HTTP_201_CREATED)


class ListItemView(APIView):
    """Puts one of your existing items on this list (PUT), or takes it off (DELETE). Taking an item off
    the default list deletes it everywhere."""

    def objects(self, request: Request, pk: int, item_id: int) -> tuple[Wishlist, Item]:
        wishlist = get_object_or_404(Wishlist, pk=pk, owner=owner(request))
        return wishlist, get_object_or_404(own_items(request), pk=item_id)

    @extend_schema(request=None, responses={200: ItemSerializer})
    def put(self, request: Request, pk: int, item_id: int) -> Response:
        wishlist, item = self.objects(request, pk, item_id)
        services.put_on_list(item, wishlist)
        return item_response(request, item)

    @extend_schema(request=None, responses={204: None})
    def delete(self, request: Request, pk: int, item_id: int) -> Response:
        wishlist, item = self.objects(request, pk, item_id)
        if not item.entries.filter(wishlist=wishlist).exists():
            return Response(status=status.HTTP_404_NOT_FOUND)
        services.take_off_list(item, wishlist)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ItemReorderView(APIView):
    """Sets the order of all the items on one list."""

    @extend_schema(request=ReorderSerializer, responses={204: None})
    def post(self, request: Request, pk: int) -> Response:
        wishlist = get_object_or_404(Wishlist, pk=pk, owner=owner(request))
        return ordered(request, lambda ids: services.reorder_items(wishlist, ids))


class ItemDetailView(generics.RetrieveUpdateDestroyAPIView[Item]):
    """One item, on every list it is on. Sending `lists` sets exactly which lists it is on (it always stays
    on the default list). Deleting it removes it from every list."""

    serializer_class = ItemSerializer
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_queryset(self) -> QuerySet[Item]:
        return own_items(self.request)

    def update(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        item = self.get_object()
        serializer = self.get_serializer(item, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        lists = data.pop("lists", None)
        for field, value in data.items():
            setattr(item, field, value)
        item.save()
        item_edited.send(sender=Item, item=item, deleted=False)
        if lists is not None:
            services.set_lists(item, lists)
        return item_response(request, item)

    def perform_destroy(self, instance: Item) -> None:
        services.delete_item(instance)


class ItemImageView(APIView):
    """Adds or replaces an item's picture (multipart upload), or removes it."""

    parser_classes = (MultiPartParser, FormParser)

    def item(self, request: Request, pk: int) -> Item:
        return get_object_or_404(own_items(request), pk=pk)

    @extend_schema(request={"multipart/form-data": ImageUploadSerializer}, responses={200: ItemSerializer})
    def put(self, request: Request, pk: int) -> Response:
        item = self.item(request, pk)
        upload = request.FILES.get("image")
        if upload is None:
            raise ValidationError({"image": [_("Choose a picture to upload.")]})
        try:
            content = normalise_image(upload)
        except InvalidImage as error:
            raise ValidationError(
                {"image": [_("Use a JPEG, PNG, WebP or GIF picture of up to 10 MB.")]}
            ) from error
        old = item.image.name if item.image else None
        item.image.save(content.name or "image.jpg", content, save=True)
        if old:
            item.image.storage.delete(old)
        item_edited.send(sender=Item, item=item, deleted=False)
        return item_response(request, item)

    @extend_schema(request=None, responses={200: ItemSerializer})
    def delete(self, request: Request, pk: int) -> Response:
        item = self.item(request, pk)
        if item.image:
            item.image.delete(save=True)
            item_edited.send(sender=Item, item=item, deleted=False)
        return item_response(request, item)
