from datetime import timedelta
from typing import Any, cast

from django.conf import settings
from django.db.models import QuerySet
from django.utils.translation import get_language
from django.utils.translation import gettext as _
from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import generics, serializers, status
from rest_framework.exceptions import Throttled, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts import services
from accounts.models import Language, LoginCode, Session, User, normalize_email
from accounts.serializers import (
    RequestCodeSerializer,
    SessionSerializer,
    SignedInSerializer,
    UserSerializer,
    VerifySerializer,
)
from accounts.tasks import send_login_email

Detail = inline_serializer("Detail", {"detail": serializers.CharField()})


def current_user(request: Request) -> User:
    return cast(User, request.user)


def current_session(request: Request) -> Session:
    return cast(Session, request.auth)


def client_ip(request: Request) -> str:
    return str(request.META.get("REMOTE_ADDR", "unknown"))


def request_language() -> str:
    """The language LocaleMiddleware picked from Accept-Language, if it is one we support."""
    language = (get_language() or "").split("-")[0]
    return language if language in Language.values else Language.ENGLISH


def lifetime_minutes() -> int:
    return int(settings.LOGIN_CODE_LIFETIME.total_seconds() // 60)


def check_rate_limit(key: str, limit: tuple[int, timedelta]) -> None:
    count, window = limit
    if services.rate_limited(key, count, window):
        raise Throttled(
            wait=window.total_seconds(), detail=_("Too many attempts. Wait a few minutes and try again.")
        )


class RequestCodeView(APIView):
    """Emails a sign-in code and magic link. Answers the same way whether or not the account exists."""

    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(
        request=RequestCodeSerializer,
        responses={202: Detail, 429: OpenApiResponse(Detail, description="Too many requests")},
    )
    def post(self, request: Request) -> Response:
        serializer = RequestCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = normalize_email(serializer.validated_data["email"])

        check_rate_limit(f"request-code:ip:{client_ip(request)}", settings.LOGIN_CODE_RATE_PER_IP)
        check_rate_limit(f"request-code:email:{email}", settings.LOGIN_CODE_RATE_PER_EMAIL)

        user = User.objects.filter(email=email).first()
        language = user.language if user else request_language()
        code, token = services.create_login_code(email)
        send_login_email.delay(email, code, token, language)

        detail = _("We've emailed you a sign-in code. It expires in %(minutes)d minutes.") % {
            "minutes": lifetime_minutes()
        }
        return Response({"detail": detail}, status=status.HTTP_202_ACCEPTED)


class VerifyView(APIView):
    """Exchanges a code (or a magic-link token) for a session token. The first sign-in creates the account."""

    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(
        request=VerifySerializer,
        responses={200: SignedInSerializer, 400: Detail, 429: OpenApiResponse(Detail)},
    )
    def post(self, request: Request) -> Response:
        serializer = VerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        check_rate_limit(f"verify:ip:{client_ip(request)}", settings.LOGIN_VERIFY_RATE_PER_IP)

        try:
            if "token" in data:
                email = services.check_token(data["token"])
            else:
                email = services.check_code(data["email"], data["code"])
            user = services.get_or_create_user(email, request_language())
        except services.InvalidCode as error:
            raise ValidationError({"detail": _("That code is wrong or has expired.")}) from error

        device_name = data.get("device_name") or request.headers.get("User-Agent", "")
        token = services.open_session(user, device_name)
        return Response(SignedInSerializer({"token": token, "user": user}).data)


class LogoutView(APIView):
    """Ends the session this request was made with."""

    @extend_schema(request=None, responses={204: None})
    def post(self, request: Request) -> Response:
        current_session(request).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SessionListView(generics.ListAPIView[Session]):
    """The devices signed in to this account. `current` marks the one making the request."""

    serializer_class = SessionSerializer
    pagination_class = None

    def get_queryset(self) -> QuerySet[Session]:
        return Session.objects.filter(user=current_user(self.request))

    def get_serializer_context(self) -> dict[str, Any]:
        return {**super().get_serializer_context(), "current_session": self.request.auth}


class SessionDetailView(generics.DestroyAPIView[Session]):
    """Signs a device out of this account."""

    serializer_class = SessionSerializer

    def get_queryset(self) -> QuerySet[Session]:
        return Session.objects.filter(user=current_user(self.request))


class MeView(generics.RetrieveUpdateDestroyAPIView[User]):
    """The signed-in account. Deleting it removes the account and everything that belongs to it."""

    serializer_class = UserSerializer
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_object(self) -> User:
        return current_user(self.request)

    def perform_destroy(self, instance: User) -> None:
        # Sessions and everything else the account owns go with it (on_delete=CASCADE).
        LoginCode.objects.filter(email=instance.email).delete()
        instance.delete()
