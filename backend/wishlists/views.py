from typing import Any, cast

from django.db.models import Count, Q, QuerySet
from django.shortcuts import get_object_or_404
from django.utils.translation import gettext as _
from drf_spectacular.utils import extend_schema
from rest_framework import generics, serializers, status
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
)
from wishlists.signals import item_edited


def owner(request: Request) -> User:
    return cast(User, request.user)


def own_wishlists(request: Request) -> QuerySet[Wishlist]:
    # Explicit order: the aggregate's GROUP BY would otherwise drop Meta.ordering.
    return (
        Wishlist.objects.filter(owner=owner(request))
        .annotate(
            item_count=Count("items", distinct=True),
            # Depends only on the list's shares, never on reservations.
            share_count=Count("shares", filter=Q(shares__revoked_at__isnull=True), distinct=True),
        )
        .order_by("position", "id")
    )


def own_items(request: Request) -> QuerySet[Item]:
    return Item.objects.filter(wishlist__owner=owner(request))


def apply_order[M: (Wishlist, Item)](request: Request, queryset: QuerySet[M]) -> Response:
    serializer = ReorderSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        services.reorder(queryset, serializer.validated_data["ids"])
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
    """One list with its items. The default list can be renamed but not deleted."""

    serializer_class = WishlistDetailSerializer
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_queryset(self) -> QuerySet[Wishlist]:
        return own_wishlists(self.request).prefetch_related("items")

    def perform_destroy(self, instance: Wishlist) -> None:
        if instance.is_default:
            raise ValidationError({"detail": _("Your default list can't be deleted.")})
        instance.delete()


class WishlistReorderView(APIView):
    """Sets the order of all the signed-in person's lists."""

    @extend_schema(request=ReorderSerializer, responses={204: None})
    def post(self, request: Request) -> Response:
        return apply_order(request, Wishlist.objects.filter(owner=owner(request)))


class ItemListView(generics.ListCreateAPIView[Item]):
    """The items on one list, in order. New items go to the end."""

    serializer_class = ItemSerializer
    pagination_class = None

    def wishlist(self) -> Wishlist:
        return get_object_or_404(Wishlist, pk=self.kwargs["pk"], owner=owner(self.request))

    def get_queryset(self) -> QuerySet[Item]:
        return self.wishlist().items.all()

    def perform_create(self, serializer: serializers.BaseSerializer[Item]) -> None:
        data = {key: value for key, value in serializer.validated_data.items() if key != "wishlist"}
        serializer.instance = services.add_item(self.wishlist(), **data)


class ItemReorderView(APIView):
    """Sets the order of all the items on one list."""

    @extend_schema(request=ReorderSerializer, responses={204: None})
    def post(self, request: Request, pk: int) -> Response:
        wishlist = get_object_or_404(Wishlist, pk=pk, owner=owner(request))
        return apply_order(request, wishlist.items.all())


class ItemDetailView(generics.RetrieveUpdateDestroyAPIView[Item]):
    """One item. Sending another of your lists as `wishlist` moves the item to the end of that list."""

    serializer_class = ItemSerializer
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_queryset(self) -> QuerySet[Item]:
        return own_items(self.request)

    def perform_update(self, serializer: serializers.BaseSerializer[Item]) -> None:
        item = cast(Item, serializer.instance)
        data = dict(serializer.validated_data)
        target = data.pop("wishlist", None)
        if target is not None:
            services.move_item(item, target)
        for field, value in data.items():
            setattr(item, field, value)
        item.save()
        item_edited.send(sender=Item, item=item, deleted=False)

    def perform_destroy(self, instance: Item) -> None:
        item_edited.send(sender=Item, item=instance, deleted=True)
        instance.delete()


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
        return Response(ItemSerializer(item, context={"request": request}).data)

    @extend_schema(request=None, responses={200: ItemSerializer})
    def delete(self, request: Request, pk: int) -> Response:
        item = self.item(request, pk)
        if item.image:
            item.image.delete(save=True)
            item_edited.send(sender=Item, item=item, deleted=False)
        return Response(ItemSerializer(item, context={"request": request}).data)
