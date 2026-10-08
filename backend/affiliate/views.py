from django.http import HttpResponseRedirect
from django.utils.translation import gettext as _
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.views import APIView

from affiliate.links import affiliate_url, read_go_token
from wishlists.models import Item


class GoView(APIView):
    """Opens an item's shop link for someone a list is shared with, adding Delibird's affiliate code when the
    shop has one. It works only through a link Delibird handed out, while the list is still shared with them
    and the item is still on it, so it can't send people anywhere else or reveal other items. It records
    nothing, so the owner can never learn who clicked."""

    permission_classes = (AllowAny,)
    # Opened by the phone's browser, which has no sign-in token; the link itself is the permission.
    authentication_classes = ()

    @extend_schema(
        responses={
            302: OpenApiResponse(description="To the shop"),
            404: OpenApiResponse(description="Unknown link, or no longer shared"),
        }
    )
    def get(self, request: Request, token: str) -> HttpResponseRedirect:
        ids = read_go_token(token)
        if ids is None:
            raise NotFound(_("This link doesn't work any more."))
        share_id, item_id = ids
        # One filter call, so the share is on the same list as the item's entry.
        item = (
            Item.objects.filter(
                pk=item_id, entries__wishlist__shares__pk=share_id, entries__wishlist__shares__revoked_at=None
            )
            .exclude(url="")
            .first()
        )
        if item is None:
            raise NotFound(_("This link doesn't work any more."))
        response = HttpResponseRedirect(affiliate_url(item.url) or item.url)
        response["Cache-Control"] = "no-store"
        response["Referrer-Policy"] = "no-referrer"
        return response
