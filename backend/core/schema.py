from typing import Any


def responses_have_every_field(result: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
    """drf-spectacular postprocessing hook.

    Fields with defaults are optional in requests, but the API always sends every field back, so response
    components (those without the Request suffix) mark all their properties as required. That keeps the
    app's generated types exact.
    """
    for name, component in result.get("components", {}).get("schemas", {}).items():
        if name.endswith("Request") or "properties" not in component:
            continue
        component["required"] = sorted(component["properties"])
    return result
