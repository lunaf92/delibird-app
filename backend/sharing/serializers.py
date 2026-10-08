from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from accounts.models import User
from affiliate.links import shop_link
from sharing.models import Reservation, Share
from wishlists.models import Item, Wishlist
from wishlists.services import list_items


def public_name(user: User) -> str:
    return user.display_name or user.email


class ShareSerializer(serializers.ModelSerializer[Share]):
    """A share as its owner sees it."""

    email = serializers.EmailField(source="invitee_email")
    joined = serializers.SerializerMethodField(help_text="Whether someone has accepted the link.")
    joined_as = serializers.SerializerMethodField(help_text="The name of whoever accepted the link.")

    class Meta:
        model = Share
        fields: tuple[str, ...] = ("id", "email", "joined", "joined_as", "created_at")
        read_only_fields: tuple[str, ...] = ("id", "joined", "joined_as", "created_at")

    def get_joined(self, share: Share) -> bool:
        return share.user_id is not None

    def get_joined_as(self, share: Share) -> str | None:
        return public_name(share.user) if share.user else None


class NewShareSerializer(ShareSerializer):
    link = serializers.CharField(read_only=True, help_text="The person's own link. It is shown only once.")

    class Meta(ShareSerializer.Meta):
        fields = (*ShareSerializer.Meta.fields, "link")
        read_only_fields = (*ShareSerializer.Meta.read_only_fields, "link")


class SharedItemSerializer(serializers.ModelSerializer[Item]):
    """An item as people the list is shared with see it, without anything about reservations."""

    image = serializers.SerializerMethodField()
    shop_url = serializers.SerializerMethodField(
        help_text="The link to open for this item: the shop link itself, or a Delibird link that adds an "
        "affiliate code on the way. Empty when the item has no link."
    )
    affiliate = serializers.SerializerMethodField(help_text="Whether opening shop_url may earn a commission.")

    class Meta:
        model = Item
        fields: tuple[str, ...] = (
            "id",
            "name",
            "url",
            "shop_url",
            "affiliate",
            "description",
            "rating",
            "image",
            "price",
            "currency",
        )

    def get_image(self, item: Item) -> str | None:
        if not item.image:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(item.image.url) if request else item.image.url

    def get_shop_url(self, item: Item) -> str:
        return shop_link(self.context.get("request"), item.url, item.pk, self.context.get("share_id"))[0]

    def get_affiliate(self, item: Item) -> bool:
        return shop_link(self.context.get("request"), item.url, item.pk, self.context.get("share_id"))[1]


class ReservationStateSerializer(serializers.Serializer[Any]):
    status = serializers.ChoiceField(choices=["free", "mine", "taken"])
    by = serializers.CharField(allow_null=True, help_text="Who is getting it, when someone else is.")


class ViewerItemSerializer(SharedItemSerializer):
    """An item as a signed-in viewer sees it: with whether it is taken, and by whom."""

    reservation = serializers.SerializerMethodField()

    class Meta(SharedItemSerializer.Meta):
        fields = (*SharedItemSerializer.Meta.fields, "reservation")

    @extend_schema_field(ReservationStateSerializer)
    def get_reservation(self, item: Item) -> dict[str, str | None]:
        reservations: dict[int, Reservation] = self.context["reservations"]
        reservation = reservations.get(item.pk)
        if reservation is None:
            return {"status": "free", "by": None}
        if reservation.buyer_id == self.context["request"].user.pk:
            return {"status": "mine", "by": None}
        return {"status": "taken", "by": public_name(reservation.buyer)}


class SharedListSerializer(serializers.ModelSerializer[Wishlist]):
    """A list opened through a share link. `role` says how the requester relates to it."""

    owner_name = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField(
        help_text="owner: it's your list. viewer: you accepted this link. invited: sign in or accept to "
        "reserve. anonymous: not signed in."
    )

    class Meta:
        model = Wishlist
        fields = ("id", "name", "owner_name", "role", "items")

    def get_owner_name(self, wishlist: Wishlist) -> str:
        return public_name(wishlist.owner)

    @extend_schema_field(SharedItemSerializer(many=True))
    def get_items(self, wishlist: Wishlist) -> Any:
        return SharedItemSerializer(list_items(wishlist), many=True, context=self.context).data

    @extend_schema_field(serializers.ChoiceField(choices=["owner", "viewer", "invited", "anonymous"]))
    def get_role(self, wishlist: Wishlist) -> str:
        return str(self.context["role"])


class ViewerListSummarySerializer(serializers.ModelSerializer[Wishlist]):
    owner_name = serializers.SerializerMethodField()
    item_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Wishlist
        fields: tuple[str, ...] = ("id", "name", "owner_name", "item_count")

    def get_owner_name(self, wishlist: Wishlist) -> str:
        return public_name(wishlist.owner)


class ViewerListSerializer(ViewerListSummarySerializer):
    items = serializers.SerializerMethodField()

    class Meta(ViewerListSummarySerializer.Meta):
        fields = (*ViewerListSummarySerializer.Meta.fields, "items")

    @extend_schema_field(ViewerItemSerializer(many=True))
    def get_items(self, wishlist: Wishlist) -> Any:
        return ViewerItemSerializer(list_items(wishlist), many=True, context=self.context).data
