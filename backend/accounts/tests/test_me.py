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
        "theme": "ink",
        "dark_mode": "follow",
        "plain_font": False,
    }


def test_the_look_is_saved_on_the_account(client: APIClient, ann: User) -> None:
    response = client.patch(
        reverse("me"), {"theme": "chalk", "dark_mode": "dark", "plain_font": True}, format="json"
    )

    assert response.status_code == 200
    assert {k: response.json()[k] for k in ("theme", "dark_mode", "plain_font")} == {
        "theme": "chalk",
        "dark_mode": "dark",
        "plain_font": True,
    }
    ann.refresh_from_db()
    assert (ann.theme, ann.dark_mode, ann.plain_font) == ("chalk", "dark", True)


@pytest.mark.parametrize("change", [{"theme": "neon"}, {"dark_mode": "sometimes"}, {"plain_font": "maybe"}])
def test_unknown_looks_are_refused(client: APIClient, ann: User, change: dict[str, str]) -> None:
    response = client.patch(reverse("me"), change, format="json")

    assert response.status_code == 400
    ann.refresh_from_db()
    assert (ann.theme, ann.dark_mode, ann.plain_font) == ("ink", "follow", False)


def test_the_look_is_only_for_the_account_itself(ann: User) -> None:
    """Nobody else's requests can read or change it: /me/ is always the signed-in person."""
    bob = User.objects.create_user("bob@example.com", theme="sky")
    bob_client = APIClient()
    sign_in_as(bob_client, bob)

    bob_client.patch(reverse("me"), {"theme": "meadow"}, format="json")

    ann.refresh_from_db()
    assert ann.theme == "ink"
    assert APIClient().get(reverse("me")).status_code == 401


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
