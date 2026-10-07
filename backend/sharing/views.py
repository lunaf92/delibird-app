from typing import Any, cast

from django.conf import settings
from django.db import transaction
from django.db.models import Count, Prefetch, QuerySet
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils.translation import gettext as _
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import generics, serializers, status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from notifications.tasks import send_share_invitation
from sharing import services
from sharing.models import Reservation, Share
from sharing.serializers import (
    NewShareSerializer,
    SharedListSerializer,
    ShareSerializer,
    ViewerListSerializer,
    ViewerListSummarySerializer,
)
from wishlists.models import Item, Wishlist


def current_user(request: Request) -> User:
    return cast(User, request.user)


def ordered_items() -> Prefetch[Any]:
    return Prefetch("items", queryset=Item.objects.order_by("position", "id"))


class ShareListView(generics.ListCreateAPIView[Share]):
    """The people a list is shared with. Adding someone returns their personal link, once."""

    pagination_class = None

    def wishlist(self) -> Wishlist:
        return get_object_or_404(Wishlist, pk=self.kwargs["pk"], owner=current_user(self.request))

    def get_queryset(self) -> QuerySet[Share]:
        return services.active_shares().filter(wishlist=self.wishlist()).select_related("user")

    def get_serializer_class(self) -> type[serializers.BaseSerializer[Share]]:
        return NewShareSerializer if self.request.method == "POST" else ShareSerializer

    def create(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        serializer = ShareSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        wishlist = self.wishlist()
        try:
            new = services.share_list(wishlist, serializer.validated_data["invitee_email"])
        except services.AlreadyShared as error:
            raise ValidationError({"email": [_("This list is already shared with that address.")]}) from error
        link = share_link(new.token)
        transaction.on_commit(lambda: send_share_invitation.delay(new.share.pk, link))
        data = {**ShareSerializer(new.share).data, "link": link}
        return Response(data, status=status.HTTP_201_CREATED)


def share_link(token: str) -> str:
    return f"{settings.APP_URL.rstrip('/')}/shared/{token}"


class ShareDetailView(generics.DestroyAPIView[Share]):
    """Stops sharing with one person. Their link stops working."""

    serializer_class = ShareSerializer

    def get_queryset(self) -> QuerySet[Share]:
        return services.active_shares().filter(wishlist__owner=current_user(self.request))

    def perform_destroy(self, instance: Share) -> None:
        services.revoke(instance)


class SharedListView(APIView):
    """A list opened through someone's link. Needs no account, and never says which items are taken:
    signed-in viewers see that in "Shared with me". The owner gets the same owner-safe view."""

    permission_classes = (AllowAny,)

    @extend_schema(responses={200: SharedListSerializer, 404: OpenApiResponse(description="Unknown link")})
    def get(self, request: Request, token: str) -> Response:
        share = services.share_for_token(token)
        if share is None:
            raise NotFound(_("This link doesn't work any more. Ask for a new one."))
        wishlist = (
            Wishlist.objects.select_related("owner")
            .prefetch_related(ordered_items())
            .get(pk=share.wishlist_id)
        )
        user = request.user if request.user.is_authenticated else None
        if user is None:
            role = "anonymous"
        elif wishlist.owner_id == user.pk:
            role = "owner"
        elif share.user_id == user.pk:
            role = "viewer"
        else:
            role = "invited"
        context = {"request": request, "role": role}
        return Response(SharedListSerializer(wishlist, context=context).data)


class JoinView(APIView):
    """Accepts a link: the list then appears under "Shared with me" and its items can be reserved."""

    @extend_schema(
        request=None,
        responses={
            200: ViewerListSummarySerializer,
            400: OpenApiResponse(description="It's your own list"),
            403: OpenApiResponse(description="Someone else already accepted this link"),
        },
    )
    def post(self, request: Request, token: str) -> Response:
        share = services.share_for_token(token)
        if share is None:
            raise NotFound(_("This link doesn't work any more. Ask for a new one."))
        try:
            services.join(share, current_user(request))
        except services.OwnList as error:
            raise ValidationError({"detail": _("This is your own list.")}) from error
        except services.AcceptedByOther as error:
            raise PermissionDenied(_("Someone else already accepted this link. Ask for your own.")) from error
        wishlist = viewer_lists(current_user(request)).get(pk=share.wishlist_id)
        return Response(ViewerListSummarySerializer(wishlist).data)


def viewer_lists(user: User) -> QuerySet[Wishlist]:
    return (
        services.viewable_lists(user)
        .select_related("owner")
        .annotate(item_count=Count("items", distinct=True))
        .order_by("owner__display_name", "name", "id")
    )


class SharedWithMeView(generics.ListAPIView[Wishlist]):
    """Lists other people shared with you, once you accepted their link."""

    serializer_class = ViewerListSummarySerializer
    pagination_class = None

    def get_queryset(self) -> QuerySet[Wishlist]:
        return viewer_lists(current_user(self.request))


class SharedWithMeDetailView(APIView):
    """One list shared with you, with which items are free, yours, or taken and by whom."""

    @extend_schema(responses={200: ViewerListSerializer})
    def get(self, request: Request, pk: int) -> Response:
        user = current_user(request)
        wishlist = get_object_or_404(viewer_lists(user).prefetch_related(ordered_items()), pk=pk)
        reservations = {
            r.item_id: r for r in Reservation.objects.filter(item__wishlist=wishlist).select_related("buyer")
        }
        context = {"request": request, "reservations": reservations}
        return Response(ViewerListSerializer(wishlist, context=context).data)


class ReservationView(APIView):
    """Reserve an item on a list shared with you, or cancel your reservation. For anyone who can't
    reserve the item, the owner included, the answer is the same 404 as for an item that doesn't exist."""

    @extend_schema(request=None, responses={204: None, 404: OpenApiResponse(), 409: OpenApiResponse()})
    def post(self, request: Request, pk: int) -> Response:
        try:
            services.reserve(current_user(request), pk)
        except services.NotViewable as error:
            raise Http404 from error
        except services.Taken:
            return Response(
                {"detail": _("Someone else is already getting this.")}, status=status.HTTP_409_CONFLICT
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=None, responses={204: None, 404: OpenApiResponse()})
    def delete(self, request: Request, pk: int) -> Response:
        try:
            services.cancel(current_user(request), pk)
        except services.NotViewable as error:
            raise Http404 from error
        return Response(status=status.HTTP_204_NO_CONTENT)
