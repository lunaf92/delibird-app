import re

from django.core.mail import EmailMessage, EmailMultiAlternatives
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import User
from accounts.services import open_session


def sign_in_as(client: APIClient, user: User, device_name: str = "Test phone") -> str:
    """Opens a session for `user` and makes `client` send its token. Returns the token."""
    token = open_session(user, device_name)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return token


def code_from(message: EmailMessage) -> str:
    match = re.search(r"^\s+(\d{6})$", str(message.body), re.MULTILINE)
    assert match, message.body
    return match.group(1)


def token_from(message: EmailMessage) -> str:
    match = re.search(r"/sign-in/verify\?token=([\w-]+)", str(message.body))
    assert match, message.body
    return match.group(1)


def html_of(message: EmailMessage) -> str:
    assert isinstance(message, EmailMultiAlternatives)
    [(content, mimetype)] = message.alternatives
    assert mimetype == "text/html"
    return str(content)


def request_code(client: APIClient, email: str, **headers: str) -> int:
    response = client.post(reverse("auth-request-code"), {"email": email}, format="json", headers=headers)
    return response.status_code
