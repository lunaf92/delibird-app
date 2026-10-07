from collections.abc import Iterator

import pytest
from django.core.cache import cache
from pytest_django.fixtures import Settings
from rest_framework.test import APIClient


@pytest.fixture(autouse=True)
def local_cache(settings: Settings) -> Iterator[None]:
    """Rate-limit counters live in memory during tests, so tests never touch the shared Redis."""
    settings.CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def eager_celery(settings: Settings) -> None:
    """Tasks run inline, so a test can check the email a request sent."""
    settings.CELERY_TASK_ALWAYS_EAGER = True
    settings.CELERY_TASK_EAGER_PROPAGATES = True


@pytest.fixture
def client() -> APIClient:
    return APIClient()
