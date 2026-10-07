from django.urls import path

from sharing import views

urlpatterns = [
    path("lists/<int:pk>/shares/", views.ShareListView.as_view(), name="list-shares"),
    path("shares/<int:pk>/", views.ShareDetailView.as_view(), name="share"),
    path("shared/<str:token>/", views.SharedListView.as_view(), name="shared"),
    path("shared/<str:token>/join/", views.JoinView.as_view(), name="shared-join"),
    path("shared-with-me/", views.SharedWithMeView.as_view(), name="shared-with-me"),
    path("shared-with-me/<int:pk>/", views.SharedWithMeDetailView.as_view(), name="shared-with-me-list"),
    path("items/<int:pk>/reservation/", views.ReservationView.as_view(), name="item-reservation"),
]
