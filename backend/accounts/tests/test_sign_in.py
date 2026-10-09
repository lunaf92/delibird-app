from datetime import timedelta

import pytest
from django.core import mail
from django.urls import reverse
from django.utils import timezone
from pytest_django.fixtures import Settings
from rest_framework.test import APIClient

from accounts.models import LoginCode, Session, User
from accounts.services import hash_token
from accounts.tasks import clear_expired_login_codes
from accounts.tests.helpers import code_from, html_of, request_code, token_from

pytestmark = pytest.mark.django_db


def verify(client: APIClient, **body: str) -> tuple[int, dict[str, object]]:
    response = client.post(reverse("auth-verify"), body, format="json")
    return response.status_code, response.json()


def test_request_code_emails_a_code_and_magic_link(client: APIClient, settings: Settings) -> None:
    settings.APP_URL = "http://192.168.1.50:8081"

    assert request_code(client, "ann@example.com") == 202

    [message] = mail.outbox
    assert message.to == ["ann@example.com"]
    code = code_from(message)
    token = token_from(message)
    assert message.subject == f"Your Strena sign-in code: {code}"
    assert f"http://192.168.1.50:8081/sign-in/verify?token={token}" in message.body
    assert code in html_of(message)
    assert f"http://192.168.1.50:8081/sign-in/verify?token={token}" in html_of(message)


def test_only_hashes_are_stored(client: APIClient) -> None:
    request_code(client, "ann@example.com")
    code, token = code_from(mail.outbox[0]), token_from(mail.outbox[0])

    login_code = LoginCode.objects.get()
    stored = {login_code.code_hash, login_code.token_hash}
    assert code not in str(stored)
    assert token not in str(stored)
    assert login_code.token_hash == hash_token(token)


def test_unknown_and_known_emails_get_the_same_answer(client: APIClient) -> None:
    User.objects.create_user("known@example.com")

    known = client.post(reverse("auth-request-code"), {"email": "known@example.com"}, format="json")
    unknown = client.post(reverse("auth-request-code"), {"email": "new@example.com"}, format="json")

    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()


def test_first_sign_in_creates_the_account(client: APIClient) -> None:
    request_code(client, "Ann@Example.COM")

    status, body = verify(client, email="ANN@example.com", code=code_from(mail.outbox[0]))

    assert status == 200
    user = User.objects.get()
    assert user.email == "ann@example.com"
    assert not user.has_usable_password()
    assert body["user"] == {
        "id": user.pk,
        "email": "ann@example.com",
        "display_name": "",
        "language": "en",
        "theme": "ink",
        "dark_mode": "follow",
        "plain_font": False,
    }
    assert Session.objects.get().token_hash == hash_token(str(body["token"]))


def test_signing_in_again_uses_the_same_account(client: APIClient) -> None:
    user = User.objects.create_user("ann@example.com", display_name="Ann")
    request_code(client, "ann@example.com")

    status, body = verify(client, email="ann@example.com", code=code_from(mail.outbox[0]))

    assert status == 200
    assert body["user"] == {
        "id": user.pk,
        "email": "ann@example.com",
        "display_name": "Ann",
        "language": "en",
        "theme": "ink",
        "dark_mode": "follow",
        "plain_font": False,
    }
    assert User.objects.count() == 1


def test_magic_link_token_signs_in(client: APIClient) -> None:
    request_code(client, "ann@example.com")

    status, body = verify(client, token=token_from(mail.outbox[0]))

    assert status == 200
    assert body["user"]["email"] == "ann@example.com"  # type: ignore[index]


def test_device_name_is_saved(client: APIClient) -> None:
    request_code(client, "ann@example.com")
    code = code_from(mail.outbox[0])

    verify(client, email="ann@example.com", code=code, device_name="Pixel 9")

    assert Session.objects.get().device_name == "Pixel 9"


def test_device_name_falls_back_to_the_user_agent(client: APIClient) -> None:
    request_code(client, "ann@example.com")
    code = code_from(mail.outbox[0])

    client.post(
        reverse("auth-verify"),
        {"email": "ann@example.com", "code": code},
        format="json",
        headers={"User-Agent": "Firefox on Linux"},
    )

    assert Session.objects.get().device_name == "Firefox on Linux"


def test_wrong_code_is_refused(client: APIClient) -> None:
    request_code(client, "ann@example.com")
    code = code_from(mail.outbox[0])
    wrong = f"{(int(code) + 1) % 1_000_000:06d}"

    status, body = verify(client, email="ann@example.com", code=wrong)

    assert status == 400
    assert body == {"detail": "That code is wrong or has expired."}
    assert LoginCode.objects.get().attempts == 1
    assert not User.objects.exists()


def test_code_stops_working_after_five_wrong_attempts(client: APIClient) -> None:
    request_code(client, "ann@example.com")
    code = code_from(mail.outbox[0])
    wrong = f"{(int(code) + 1) % 1_000_000:06d}"
    for _ in range(5):
        verify(client, email="ann@example.com", code=wrong)

    status, _body = verify(client, email="ann@example.com", code=code)

    assert status == 400
    assert not Session.objects.exists()


def test_expired_code_is_refused(client: APIClient) -> None:
    request_code(client, "ann@example.com")
    LoginCode.objects.update(expires_at=timezone.now() - timedelta(seconds=1))

    status, _body = verify(client, email="ann@example.com", code=code_from(mail.outbox[0]))

    assert status == 400


def test_expired_magic_link_is_refused(client: APIClient) -> None:
    request_code(client, "ann@example.com")
    LoginCode.objects.update(expires_at=timezone.now() - timedelta(seconds=1))

    status, _body = verify(client, token=token_from(mail.outbox[0]))

    assert status == 400


def test_code_works_only_once(client: APIClient) -> None:
    request_code(client, "ann@example.com")
    code, token = code_from(mail.outbox[0]), token_from(mail.outbox[0])
    verify(client, email="ann@example.com", code=code)

    assert verify(client, email="ann@example.com", code=code)[0] == 400
    assert verify(client, token=token)[0] == 400


def test_new_code_replaces_the_old_one(client: APIClient) -> None:
    request_code(client, "ann@example.com")
    request_code(client, "ann@example.com")
    first, second = mail.outbox

    assert verify(client, token=token_from(first))[0] == 400
    assert verify(client, email="ann@example.com", code=code_from(second))[0] == 200


def test_unknown_token_is_refused(client: APIClient) -> None:
    assert verify(client, token="not-a-real-token")[0] == 400


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"email": "ann@example.com"},
        {"email": "ann@example.com", "code": "123456", "token": "abc"},
        {"email": "ann@example.com", "code": "12345"},
    ],
)
def test_verify_needs_a_code_or_a_token(client: APIClient, body: dict[str, str]) -> None:
    assert verify(client, **body)[0] == 400


def test_inactive_account_cannot_sign_in(client: APIClient) -> None:
    User.objects.create_user("ann@example.com", is_active=False)
    request_code(client, "ann@example.com")

    assert verify(client, email="ann@example.com", code=code_from(mail.outbox[0]))[0] == 400


def test_requests_are_rate_limited_per_email(client: APIClient, settings: Settings) -> None:
    settings.LOGIN_CODE_RATE_PER_EMAIL = (3, timedelta(minutes=15))
    statuses = [request_code(client, "Ann@example.com" if n % 2 else "ann@example.com") for n in range(4)]

    assert statuses == [202, 202, 202, 429]
    assert len(mail.outbox) == 3
    assert request_code(client, "bob@example.com") == 202


def test_requests_are_rate_limited_per_ip(client: APIClient, settings: Settings) -> None:
    settings.LOGIN_CODE_RATE_PER_IP = (3, timedelta(hours=1))
    statuses = [request_code(client, f"person{n}@example.com") for n in range(4)]

    assert statuses == [202, 202, 202, 429]
    other_ip = client.post(
        reverse("auth-request-code"), {"email": "x@example.com"}, format="json", REMOTE_ADDR="10.0.0.9"
    )
    assert other_ip.status_code == 202


def test_rate_limit_is_the_same_for_unknown_emails(client: APIClient, settings: Settings) -> None:
    settings.LOGIN_CODE_RATE_PER_EMAIL = (1, timedelta(minutes=15))
    User.objects.create_user("known@example.com")

    for email in ("known@example.com", "unknown@example.com"):
        assert request_code(client, email) == 202
        assert request_code(client, email) == 429


def test_verify_is_rate_limited_per_ip(client: APIClient, settings: Settings) -> None:
    settings.LOGIN_VERIFY_RATE_PER_IP = (2, timedelta(minutes=15))

    statuses = [verify(client, token="guess")[0] for _ in range(3)]

    assert statuses == [400, 400, 429]


@pytest.mark.parametrize(
    ("language", "subject_start", "body_text"),
    [
        ("en", "Your Strena sign-in code", "Your code to sign in to Strena is:"),
        ("it", "Il tuo codice di accesso a Strena", "Il tuo codice per accedere a Strena è:"),
        ("es", "Tu código para entrar en Strena", "Tu código para entrar en Strena es:"),
    ],
)
def test_email_is_in_the_account_language(
    client: APIClient, language: str, subject_start: str, body_text: str
) -> None:
    User.objects.create_user("ann@example.com", language=language)

    # The account's saved language wins over the language of the device asking.
    request_code(client, "ann@example.com", **{"Accept-Language": "en" if language != "en" else "it"})

    [message] = mail.outbox
    assert message.subject.startswith(subject_start)
    assert body_text in message.body
    assert body_text in html_of(message)


def test_new_account_uses_the_language_it_signed_up_in(client: APIClient) -> None:
    request_code(client, "ann@example.com", **{"Accept-Language": "es"})
    code = code_from(mail.outbox[0])
    assert mail.outbox[0].subject.startswith("Tu código para entrar en Strena")

    client.post(
        reverse("auth-verify"),
        {"email": "ann@example.com", "code": code},
        format="json",
        headers={"Accept-Language": "es"},
    )

    assert User.objects.get().language == "es"


def test_beat_job_clears_expired_codes(client: APIClient) -> None:
    request_code(client, "old@example.com")
    request_code(client, "new@example.com")
    LoginCode.objects.filter(email="old@example.com").update(expires_at=timezone.now() - timedelta(minutes=1))

    assert clear_expired_login_codes.apply().get() == 1
    assert list(LoginCode.objects.values_list("email", flat=True)) == ["new@example.com"]
