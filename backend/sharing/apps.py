from django.apps import AppConfig


class SharingConfig(AppConfig):
    name = "sharing"

    def ready(self) -> None:
        from sharing import signals  # noqa: F401
