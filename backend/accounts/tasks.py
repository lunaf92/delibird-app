from celery import shared_task
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils import translation
from django.utils.http import urlencode
from django.utils.translation import gettext as _

from accounts import services


@shared_task
def send_login_email(email: str, code: str, token: str, language: str) -> None:
    """Sends the sign-in code and magic link, in plain text and HTML, in the recipient's language."""
    with translation.override(language):
        context = {
            "code": code,
            "link": f"{settings.APP_URL.rstrip('/')}/sign-in/verify?{urlencode({'token': token})}",
            "minutes": int(settings.LOGIN_CODE_LIFETIME.total_seconds() // 60),
        }
        message = EmailMultiAlternatives(
            subject=_("Your Delibird sign-in code: %(code)s") % {"code": code},
            body=render_to_string("accounts/email/sign_in.txt", context),
            to=[email],
        )
        message.attach_alternative(render_to_string("accounts/email/sign_in.html", context), "text/html")
        message.send()


@shared_task
def clear_expired_login_codes() -> int:
    """Run by Celery beat: removes sign-in codes that can no longer be used."""
    return services.clear_expired_login_codes()
