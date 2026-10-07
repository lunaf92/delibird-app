from datetime import timedelta

from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.request import Request

from accounts.models import Session, User
from accounts.services import hash_token

# last_used_at is only rewritten when it is older than this, so every request doesn't write to the database.
LAST_USED_RESOLUTION = timedelta(minutes=1)


class BearerTokenAuthentication(BaseAuthentication):
    """Reads `Authorization: Bearer <token>` and finds the session it belongs to."""

    keyword = "Bearer"

    def authenticate(self, request: Request) -> tuple[User, Session] | None:
        parts = get_authorization_header(request).split()
        if not parts or parts[0].lower() != self.keyword.lower().encode():
            return None
        if len(parts) != 2:
            raise AuthenticationFailed(_("Invalid authorization header."))
        try:
            token = parts[1].decode()
        except UnicodeError as error:
            raise AuthenticationFailed(_("Invalid authorization header.")) from error

        session = Session.objects.select_related("user").filter(token_hash=hash_token(token)).first()
        if session is None or not session.user.is_active:
            raise AuthenticationFailed(_("Your session has ended. Sign in again."))

        now = timezone.now()
        if now - session.last_used_at > LAST_USED_RESOLUTION:
            Session.objects.filter(pk=session.pk).update(last_used_at=now)
            session.last_used_at = now
        return session.user, session

    def authenticate_header(self, request: Request) -> str:
        return self.keyword
