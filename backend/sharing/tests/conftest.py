import pytest
from rest_framework.test import APIClient

from accounts.models import User
from accounts.tests.helpers import sign_in_as
from sharing.services import NewShare, join, share_list
from wishlists.models import Item, Wishlist
from wishlists.services import create_wishlist
from wishlists.tests.helpers import add_item


@pytest.fixture
def ann(client: APIClient, db: None) -> User:
    user = User.objects.create_user("ann@example.com", display_name="Ann")
    sign_in_as(client, user)
    return user


@pytest.fixture
def christmas(ann: User) -> Wishlist:
    return create_wishlist(ann, "Christmas")


@pytest.fixture
def scarf(christmas: Wishlist) -> Item:
    return add_item(christmas, name="Wool scarf", price="39.90")


@pytest.fixture
def bob(db: None) -> User:
    return User.objects.create_user("bob@example.com", display_name="Bob")


@pytest.fixture
def bob_client(bob: User) -> APIClient:
    client = APIClient()
    sign_in_as(client, bob)
    return client


@pytest.fixture
def bob_share(christmas: Wishlist, bob: User) -> NewShare:
    new = share_list(christmas, "bob@example.com")
    join(new.share, bob)
    return new
