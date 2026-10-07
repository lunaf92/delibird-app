from django.apps import AppConfig


class WishlistsConfig(AppConfig):
    name = "wishlists"

    def ready(self) -> None:
        from wishlists import signals  # noqa: F401
