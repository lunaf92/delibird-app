from typing import Any, ClassVar

from django.contrib import admin
from django.http import HttpRequest
from django.utils.translation import gettext_lazy as _

from accounts.models import Session, User, normalize_email


class SessionInline(admin.TabularInline[Session, User]):
    model = Session
    fields = ("device_name", "created_at", "last_used_at")
    readonly_fields = ("device_name", "created_at", "last_used_at")
    extra = 0


@admin.register(User)
class UserAdmin(admin.ModelAdmin[User]):
    """People sign in with emailed codes, so there is no password to manage here.
    Superusers set their admin password with `manage.py changepassword`."""

    ordering = ("email",)
    list_display = ("email", "display_name", "language", "is_staff", "date_joined")
    list_filter = ("is_staff", "is_superuser", "is_active", "language")
    search_fields = ("email", "display_name")
    readonly_fields = ("date_joined", "last_login")
    filter_horizontal = ("groups", "user_permissions")
    inlines: ClassVar = [SessionInline]
    fieldsets = (
        (None, {"fields": ("email", "display_name", "language")}),
        (
            _("Permissions"),
            {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")},
        ),
        (_("Dates"), {"fields": ("last_login", "date_joined")}),
    )

    def save_model(self, request: HttpRequest, obj: User, form: Any, change: bool) -> None:
        obj.email = normalize_email(obj.email)
        if not change:
            obj.set_unusable_password()
        super().save_model(request, obj, form, change)
