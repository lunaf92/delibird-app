from django.urls import path

from wishlists import views

urlpatterns = [
    path("lists/", views.WishlistListView.as_view(), name="lists"),
    path("lists/reorder/", views.WishlistReorderView.as_view(), name="lists-reorder"),
    path("lists/<int:pk>/", views.WishlistDetailView.as_view(), name="list"),
    path("lists/<int:pk>/items/", views.ItemListView.as_view(), name="list-items"),
    path("lists/<int:pk>/items/reorder/", views.ItemReorderView.as_view(), name="list-items-reorder"),
    path("lists/<int:pk>/items/<int:item_id>/", views.ListItemView.as_view(), name="list-item"),
    path("items/<int:pk>/", views.ItemDetailView.as_view(), name="item"),
    path("items/<int:pk>/image/", views.ItemImageView.as_view(), name="item-image"),
]
