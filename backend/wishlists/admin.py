from django.contrib import admin

from wishlists.models import Item, Wishlist


class ItemInline(admin.TabularInline[Item, Wishlist]):
    model = Item
    fields = ("name", "price", "currency", "rating", "position")
    extra = 0


@admin.register(Wishlist)
class WishlistAdmin(admin.ModelAdmin[Wishlist]):
    list_display = ("name", "owner", "is_default", "position", "updated_at")
    search_fields = ("name", "owner__email")
    list_select_related = ("owner",)
    raw_id_fields = ("owner",)
    inlines = (ItemInline,)


@admin.register(Item)
class ItemAdmin(admin.ModelAdmin[Item]):
    list_display = ("name", "wishlist", "price", "currency", "rating", "updated_at")
    search_fields = ("name", "wishlist__name", "wishlist__owner__email")
    list_select_related = ("wishlist",)
    raw_id_fields = ("wishlist",)
