from django.urls import path

from autofill import views

urlpatterns = [
    path("items/autofill/", views.AutofillView.as_view(), name="item-autofill"),
    path("items/<int:pk>/image/from-url/", views.ImageFromUrlView.as_view(), name="item-image-from-url"),
]
