from typing import Any, ClassVar

from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from accounts.models import Session, User


class RequestCodeSerializer(serializers.Serializer[None]):
    email = serializers.EmailField()


class VerifySerializer(serializers.Serializer[None]):
    """Either the email and the six-digit code, or the token from the magic link."""

    email = serializers.EmailField(required=False)
    code = serializers.RegexField(r"^\d{6}$", required=False)
    token = serializers.CharField(required=False, max_length=200)
    device_name = serializers.CharField(required=False, allow_blank=True, max_length=200)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        has_code = "email" in attrs and "code" in attrs
        if has_code == ("token" in attrs):
            raise serializers.ValidationError(_("Send either an email and a code, or a token."))
        return attrs


class UserSerializer(serializers.ModelSerializer[User]):
    class Meta:
        model = User
        fields = ("id", "email", "display_name", "language", "theme", "dark_mode", "plain_font")
        read_only_fields = ("id", "email")
        # Required so the schema promises them in responses; PATCH is partial, so updates may still omit them.
        extra_kwargs: ClassVar = {
            name: {"required": True}
            for name in ("display_name", "language", "theme", "dark_mode", "plain_font")
        }


class SignedInSerializer(serializers.Serializer[dict[str, Any]]):
    token = serializers.CharField(help_text="Send it as `Authorization: Bearer <token>`.")
    user = UserSerializer()


class SessionSerializer(serializers.ModelSerializer[Session]):
    current = serializers.SerializerMethodField()

    class Meta:
        model = Session
        fields = ("id", "device_name", "created_at", "last_used_at", "current")
        read_only_fields = fields

    def get_current(self, session: Session) -> bool:
        current: Session | None = self.context.get("current_session")
        return current is not None and current.pk == session.pk
