from django.urls import path

from accounts import views

urlpatterns = [
    path("auth/request-code/", views.RequestCodeView.as_view(), name="auth-request-code"),
    path("auth/verify/", views.VerifyView.as_view(), name="auth-verify"),
    path("auth/logout/", views.LogoutView.as_view(), name="auth-logout"),
    path("auth/sessions/", views.SessionListView.as_view(), name="auth-sessions"),
    path("auth/sessions/<int:pk>/", views.SessionDetailView.as_view(), name="auth-session"),
    path("me/", views.MeView.as_view(), name="me"),
]
