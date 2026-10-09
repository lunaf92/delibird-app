from celery import shared_task

from notifications import push, services
from sharing.models import Share


@shared_task
def send_share_invitation(share_id: int, link: str) -> None:
    share = (
        Share.objects.select_related("wishlist__owner").filter(pk=share_id, revoked_at__isnull=True).first()
    )
    if share is not None:
        services.invite(share, link)


@shared_task
def notify_buyers() -> int:
    """Run by Celery beat every minute."""
    services.notify_buyers()
    services.remove_orphaned_reservations()
    return services.send_pending()


@shared_task
def check_push_receipts() -> None:
    """Run by Celery beat every 15 minutes."""
    push.check_receipts()


@shared_task
def forget_sent() -> int:
    """Run by Celery beat every hour."""
    return services.forget_sent()
