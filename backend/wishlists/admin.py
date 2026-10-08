from django.contrib import admin

from wishlists.models import Item, ListEntry, Wishlist


class ListEntryInline(admin.TabularInline[ListEntry, Wishlist]):
    model = ListEntry
    fields = ("item", "position")
    raw_id_fields = ("item",)
    extra = 0


@admin.register(Wishlist)
class WishlistAdmin(admin.ModelAdmin[Wishlist]):
    list_display = ("name", "owner", "is_default", "position", "updated_at")
    search_fields = ("name", "owner__email")
    list_select_related = ("owner",)
    raw_id_fields = ("owner",)
    inlines = (ListEntryInline,)


@admin.register(Item)
class ItemAdmin(admin.ModelAdmin[Item]):
    list_display = ("name", "owner", "price", "currency", "rating", "updated_at")
    search_fields = ("name", "owner__email")
    list_select_related = ("owner",)
    raw_id_fields = ("owner",)
