from django.urls import path

from affiliate import views

urlpatterns = [
    path("go/<str:token>/", views.GoView.as_view(), name="affiliate-go"),
]
