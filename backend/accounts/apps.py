from django.apps import AppConfig


class AccountsConfig(AppConfig):
    name = "accounts"

    def ready(self) -> None:
        # Registers the bearer token scheme with drf-spectacular.
        from accounts import schema  # noqa: F401
