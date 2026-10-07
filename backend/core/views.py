from django.utils.translation import get_language
from django.utils.translation import gettext as _
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from core import health


class HealthView(APIView):
    """Reports whether the API can reach its database and Redis."""

    @extend_schema(
        responses=inline_serializer(
            "Health",
            {
                "status": serializers.ChoiceField(choices=["ok", "degraded"]),
                "database": serializers.BooleanField(),
                "redis": serializers.BooleanField(),
                "language": serializers.CharField(),
                "message": serializers.CharField(),
            },
        )
    )
    def get(self, request: Request) -> Response:
        database = health.database_ok()
        redis = health.redis_ok()
        healthy = database and redis
        return Response(
            {
                "status": "ok" if healthy else "degraded",
                "database": database,
                "redis": redis,
                "language": get_language(),
                "message": _("The server is running.") if healthy else _("The server has a problem."),
            },
            status=status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE,
        )
