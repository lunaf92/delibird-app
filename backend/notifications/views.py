from typing import cast

from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from notifications.models import PushDevice


class DeviceSerializer(serializers.Serializer[None]):
    token = serializers.RegexField(r"^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$", max_length=200)
    platform = serializers.ChoiceField(choices=PushDevice.Platform.choices)


class DeviceTokenSerializer(serializers.Serializer[None]):
    token = serializers.CharField(max_length=200)


class DevicesView(APIView):
    """Registers this phone for push notifications, or stops them."""

    @extend_schema(request=DeviceSerializer, responses={204: None})
    def post(self, request: Request) -> Response:
        serializer = DeviceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # A phone that changed hands belongs to whoever registered it last.
        PushDevice.objects.update_or_create(
            token=serializer.validated_data["token"],
            defaults={"user": cast(User, request.user), "platform": serializer.validated_data["platform"]},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=DeviceTokenSerializer, responses={204: None})
    def delete(self, request: Request) -> Response:
        serializer = DeviceTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        PushDevice.objects.filter(
            token=serializer.validated_data["token"], user=cast(User, request.user)
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
