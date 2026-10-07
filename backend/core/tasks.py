from celery import shared_task


@shared_task
def ping() -> str:
    """Round trip check for the worker; see the README for how to call it."""
    return "pong"
