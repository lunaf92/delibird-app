from core.tasks import ping


def test_ping_task_runs() -> None:
    assert ping.apply().get() == "pong"
