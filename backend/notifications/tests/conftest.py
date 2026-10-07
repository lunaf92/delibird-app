from typing import Any

import pytest

from notifications import push
from sharing.tests.conftest import ann, bob, bob_client, bob_share, christmas, scarf  # noqa: F401


@pytest.fixture(autouse=True)
def pushes(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """Push messages that would have gone to Expo; each gets an ok ticket."""
    sent: list[dict[str, Any]] = []

    def fake_post(url: str, payload: Any) -> Any:
        if isinstance(payload, list):
            sent.extend(payload)
            return {
                "data": [{"status": "ok", "id": f"ticket-{len(sent)}-{i}"} for i, _ in enumerate(payload)]
            }
        return {"data": {}}

    monkeypatch.setattr(push, "post_json", fake_post)
    return sent
