from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Session, User
from accounts.tests.helpers import sign_in_as

pytestmark = pytest.mark.django_db


@pytest.fixture
def ann() -> User:
    return User.objects.create_user("ann@example.com", display_name="Ann")


def test_bearer_token_authenticates(client: APIClient, ann: User) -> None:
    sign_in_as(client, ann)

    response = client.get(reverse("me"))

    assert response.status_code == 200
    assert response.json()["email"] == "ann@example.com"


def test_requests_without_a_token_are_refused(client: APIClient) -> None:
    response = client.get(reverse("me"))

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


@pytest.mark.parametrize("header", ["Bearer not-a-token", "Bearer", "Bearer two parts"])
def test_bad_tokens_are_refused(client: APIClient, header: str) -> None:
    client.credentials(HTTP_AUTHORIZATION=header)

    assert client.get(reverse("me")).status_code == 401


def test_inactive_accounts_are_refused(client: APIClient, ann: User) -> None:
    sign_in_as(client, ann)
    User.objects.filter(pk=ann.pk).update(is_active=False)

    assert client.get(reverse("me")).status_code == 401


def test_health_and_schema_stay_public(client: APIClient) -> None:
    client.credentials(HTTP_AUTHORIZATION="Bearer not-a-token")

    assert client.get(reverse("health")).status_code in (200, 503)
    assert client.get(reverse("schema")).status_code == 200


def test_using_a_session_updates_last_used(client: APIClient, ann: User) -> None:
    sign_in_as(client, ann)
    an_hour_ago = timezone.now() - timedelta(hours=1)
    Session.objects.update(last_used_at=an_hour_ago)

    client.get(reverse("me"))

    assert Session.objects.get().last_used_at > an_hour_ago


def test_logout_ends_only_the_current_session(client: APIClient, ann: User) -> None:
    sign_in_as(client, ann, "Laptop")
    other = APIClient()
    sign_in_as(other, ann, "Phone")

    assert client.post(reverse("auth-logout")).status_code == 204

    assert client.get(reverse("me")).status_code == 401
    assert other.get(reverse("me")).status_code == 200
    assert list(Session.objects.values_list("device_name", flat=True)) == ["Phone"]


def test_sessions_list_marks_the_current_one(client: APIClient, ann: User) -> None:
    sign_in_as(APIClient(), ann, "Phone")
    sign_in_as(client, ann, "Laptop")
    sign_in_as(APIClient(), User.objects.create_user("bob@example.com"), "Bob's phone")

    response = client.get(reverse("auth-sessions"))

    assert response.status_code == 200
    sessions = {s["device_name"]: s["current"] for s in response.json()}
    assert sessions == {"Phone": False, "Laptop": True}
    assert set(response.json()[0]) == {"id", "device_name", "created_at", "last_used_at", "current"}


def test_signing_out_another_device(client: APIClient, ann: User) -> None:
    phone = APIClient()
    sign_in_as(phone, ann, "Phone")
    sign_in_as(client, ann, "Laptop")
    phone_session = Session.objects.get(device_name="Phone")

    response = client.delete(reverse("auth-session", args=[phone_session.pk]))

    assert response.status_code == 204
    assert phone.get(reverse("me")).status_code == 401
    assert client.get(reverse("me")).status_code == 200


def test_cannot_sign_out_someone_elses_session(client: APIClient, ann: User) -> None:
    bob = User.objects.create_user("bob@example.com")
    bob_client = APIClient()
    sign_in_as(bob_client, bob)
    sign_in_as(client, ann)

    response = client.delete(reverse("auth-session", args=[Session.objects.get(user=bob).pk]))

    assert response.status_code == 404
    assert bob_client.get(reverse("me")).status_code == 200
