from typing import Any, cast

from rest_framework import serializers

from wishlists.models import Item, Wishlist


class WishlistSerializer(serializers.ModelSerializer[Wishlist]):
    item_count = serializers.IntegerField(read_only=True, help_text="How many items the list holds.")

    class Meta:
        model = Wishlist
        fields: tuple[str, ...] = (
            "id",
            "name",
            "is_default",
            "position",
            "item_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "is_default", "position", "item_count", "created_at", "updated_at")


class ItemSerializer(serializers.ModelSerializer[Item]):
    image = serializers.SerializerMethodField(help_text="Absolute URL of the item's picture, if it has one.")

    class Meta:
        model = Item
        fields = (
            "id",
            "wishlist",
            "name",
            "url",
            "description",
            "rating",
            "image",
            "price",
            "currency",
            "position",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "image", "position", "created_at", "updated_at")
        extra_kwargs: dict[str, dict[str, Any]] = {
            # Set from the URL when adding; on update it moves the item to another of the owner's lists.
            "wishlist": {"required": False},
            "url": {"required": False},
            "description": {"required": False},
            "currency": {"required": False},
        }

    def get_image(self, item: Item) -> str | None:
        if not item.image:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(item.image.url) if request else item.image.url

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        # Items can only be moved between the requester's own lists; anyone else's look like missing ids.
        request = self.context.get("request")
        field = self.fields["wishlist"]
        if request is not None and isinstance(field, serializers.PrimaryKeyRelatedField):
            # The stubs type `queryset` as a class-level descriptor; on an instance it is a plain attribute.
            cast(Any, field).queryset = Wishlist.objects.filter(owner_id=request.user.pk)


class WishlistDetailSerializer(WishlistSerializer):
    items = ItemSerializer(many=True, read_only=True)

    class Meta(WishlistSerializer.Meta):
        fields: tuple[str, ...] = (*WishlistSerializer.Meta.fields, "items")


class ReorderSerializer(serializers.Serializer[None]):
    ids = serializers.ListField(
        child=serializers.IntegerField(), help_text="Every id, in the new order.", allow_empty=True
    )


class ImageUploadSerializer(serializers.Serializer[None]):
    image = serializers.ImageField(help_text="JPEG, PNG, WebP or GIF, up to 10 MB.")
