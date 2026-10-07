from drf_spectacular.extensions import OpenApiAuthenticationExtension
from drf_spectacular.openapi import AutoSchema


class BearerTokenScheme(OpenApiAuthenticationExtension):  # type: ignore[no-untyped-call]
    """Describes BearerTokenAuthentication in the OpenAPI schema."""

    target_class = "accounts.authentication.BearerTokenAuthentication"
    name = "bearerAuth"

    def get_security_definition(self, auto_schema: AutoSchema) -> dict[str, str]:
        return {"type": "http", "scheme": "bearer"}
