import pytest
from django.urls import reverse
from rest_framework.test import APIClient


@pytest.fixture
def client() -> APIClient:
    return APIClient()


@pytest.fixture
def redis_up(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("core.health.redis_ok", lambda: True)


@pytest.mark.django_db
@pytest.mark.usefixtures("redis_up")
def test_health_ok(client: APIClient) -> None:
    response = client.get(reverse("health"))

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "database": True,
        "redis": True,
        "language": "en",
        "message": "The server is running.",
    }


@pytest.mark.django_db
def test_health_reports_redis_down(client: APIClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("core.health.redis_ok", lambda: False)

    response = client.get(reverse("health"))

    assert response.status_code == 503
    assert response.json()["status"] == "degraded"
    assert response.json()["redis"] is False


@pytest.mark.django_db
@pytest.mark.usefixtures("redis_up")
@pytest.mark.parametrize(
    ("language", "message"),
    [
        ("it", "Il server è in funzione."),
        ("es", "El servidor está funcionando."),
    ],
)
def test_health_is_translated(client: APIClient, language: str, message: str) -> None:
    response = client.get(reverse("health"), headers={"Accept-Language": language})

    assert response.json()["language"] == language
    assert response.json()["message"] == message


def test_schema_is_served(client: APIClient) -> None:
    response = client.get(reverse("schema"))

    assert response.status_code == 200
    assert b"/api/v1/health/" in response.content
