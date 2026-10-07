from django.urls import path

from notifications import views

urlpatterns = [
    path("devices/", views.DevicesView.as_view(), name="devices"),
]
