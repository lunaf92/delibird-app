import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import LoginCode, Session, User
from accounts.services import create_login_code
from accounts.tests.helpers import sign_in_as

pytestmark = pytest.mark.django_db


@pytest.fixture
def ann(client: APIClient) -> User:
    user = User.objects.create_user("ann@example.com", display_name="Ann")
    sign_in_as(client, user)
    return user


def test_get_profile(client: APIClient, ann: User) -> None:
    response = client.get(reverse("me"))

    assert response.json() == {
        "id": ann.pk,
        "email": "ann@example.com",
        "display_name": "Ann",
        "language": "en",
    }


def test_update_display_name_and_language(client: APIClient, ann: User) -> None:
    response = client.patch(reverse("me"), {"display_name": "Annie", "language": "it"}, format="json")

    assert response.status_code == 200
    assert response.json()["display_name"] == "Annie"
    ann.refresh_from_db()
    assert (ann.display_name, ann.language) == ("Annie", "it")


def test_email_cannot_be_changed(client: APIClient, ann: User) -> None:
    client.patch(reverse("me"), {"email": "evil@example.com"}, format="json")

    ann.refresh_from_db()
    assert ann.email == "ann@example.com"


def test_unsupported_language_is_refused(client: APIClient, ann: User) -> None:
    response = client.patch(reverse("me"), {"language": "fr"}, format="json")

    assert response.status_code == 400
    assert "language" in response.json()


def test_put_is_not_allowed(client: APIClient, ann: User) -> None:
    response = client.put(reverse("me"), {"display_name": "Annie", "language": "en"}, format="json")

    assert response.status_code == 405


def test_delete_account_removes_the_user_and_their_data(client: APIClient, ann: User) -> None:
    sign_in_as(APIClient(), ann, "Phone")
    bob = User.objects.create_user("bob@example.com")
    sign_in_as(APIClient(), bob)
    create_login_code("ann@example.com")

    response = client.delete(reverse("me"))

    assert response.status_code == 204
    assert not User.objects.filter(email="ann@example.com").exists()
    assert not Session.objects.filter(user_id=ann.pk).exists()
    assert client.get(reverse("me")).status_code == 401
    assert Session.objects.filter(user=bob).count() == 1
    assert not LoginCode.objects.exists()
