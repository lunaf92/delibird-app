from pathlib import Path

import pytest
from pytest_django.fixtures import Settings
from rest_framework.test import APIClient

from accounts.models import User
from accounts.tests.helpers import sign_in_as


@pytest.fixture(autouse=True)
def media_root(settings: Settings, tmp_path: Path) -> Path:
    """Uploaded pictures go to a throwaway folder."""
    settings.MEDIA_ROOT = tmp_path
    return tmp_path


@pytest.fixture
def ann(client: APIClient, db: None) -> User:
    user = User.objects.create_user("ann@example.com", display_name="Ann")
    sign_in_as(client, user)
    return user


@pytest.fixture
def bob(db: None) -> User:
    return User.objects.create_user("bob@example.com", display_name="Bob")
