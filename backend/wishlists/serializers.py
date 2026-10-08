from typing import Any, ClassVar, cast

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from wishlists.models import Item, Wishlist


class WishlistSerializer(serializers.ModelSerializer[Wishlist]):
    item_count = serializers.IntegerField(read_only=True, help_text="How many items the list holds.")
    is_shared = serializers.SerializerMethodField(help_text="Whether anyone has a link to this list.")

    class Meta:
        model = Wishlist
        fields: tuple[str, ...] = (
            "id",
            "name",
            "is_default",
            "position",
            "item_count",
            "is_shared",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "is_default", "position", "item_count", "created_at", "updated_at")

    def get_is_shared(self, wishlist: Wishlist) -> bool:
        return bool(getattr(wishlist, "share_count", 0))


def shared_list_ids(owner_id: int) -> set[int]:
    """The owner's lists anyone has a link to. Depends only on shares, never on reservations."""
    # shares__isnull=False matters: without it, a list with no shares at all matches "not revoked".
    shared = Wishlist.objects.filter(owner_id=owner_id, shares__isnull=False, shares__revoked_at__isnull=True)
    return set(shared.values_list("pk", flat=True))


class ItemSerializer(serializers.ModelSerializer[Item]):
    image = serializers.SerializerMethodField(help_text="Absolute URL of the item's picture, if it has one.")
    lists = serializers.PrimaryKeyRelatedField(
        many=True,
        required=False,
        queryset=Wishlist.objects.none(),
        help_text="Every list the item is on. It is always on the default list, whether or not that is sent.",
    )
    on_shared_list = serializers.SerializerMethodField(
        help_text="Whether the item is on any list someone has a link to."
    )

    class Meta:
        model = Item
        fields = (
            "id",
            "name",
            "url",
            "description",
            "rating",
            "image",
            "price",
            "currency",
            "lists",
            "on_shared_list",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "image", "on_shared_list", "created_at", "updated_at")
        extra_kwargs: ClassVar = {
            "url": {"required": False},
            "description": {"required": False},
            "currency": {"required": False},
        }

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        # Only the requester's own lists can be chosen; anyone else's look like missing ids.
        request = self.context.get("request")
        field = self.fields["lists"]
        if request is not None and isinstance(field, serializers.ManyRelatedField):
            # The stubs type `queryset` as a class-level descriptor; on an instance it is a plain attribute.
            cast(Any, field.child_relation).queryset = Wishlist.objects.filter(owner_id=request.user.pk)

    def to_representation(self, instance: Item) -> dict[str, Any]:
        data = super().to_representation(instance)
        data["lists"] = sorted(entry.wishlist_id for entry in instance.entries.all())
        return data

    def get_image(self, item: Item) -> str | None:
        if not item.image:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(item.image.url) if request else item.image.url

    def get_on_shared_list(self, item: Item) -> bool:
        shared: set[int] | None = self.context.get("shared_list_ids")
        if shared is None:
            shared = shared_list_ids(item.owner_id)
        return any(entry.wishlist_id in shared for entry in item.entries.all())


class WishlistDetailSerializer(WishlistSerializer):
    items = serializers.SerializerMethodField()

    class Meta(WishlistSerializer.Meta):
        fields: tuple[str, ...] = (*WishlistSerializer.Meta.fields, "items")

    @extend_schema_field(ItemSerializer(many=True))
    def get_items(self, wishlist: Wishlist) -> Any:
        from wishlists.services import list_items

        items = list_items(wishlist).prefetch_related("entries")
        context = {**self.context, "shared_list_ids": shared_list_ids(wishlist.owner_id)}
        return ItemSerializer(items, many=True, context=context).data


class ReorderSerializer(serializers.Serializer[None]):
    ids = serializers.ListField(
        child=serializers.IntegerField(), help_text="Every id, in the new order.", allow_empty=True
    )


class ImageUploadSerializer(serializers.Serializer[None]):
    image = serializers.ImageField(help_text="JPEG, PNG, WebP or GIF, up to 10 MB.")
