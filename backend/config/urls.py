from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("core.urls")),
    path("api/v1/", include("accounts.urls")),
    # Before wishlists, so items/autofill/ isn't read as an item id.
    path("api/v1/", include("autofill.urls")),
    path("api/v1/", include("wishlists.urls")),
    path("api/v1/", include("sharing.urls")),
    path("api/v1/", include("affiliate.urls")),
    path("api/v1/", include("notifications.urls")),
    path("api/v1/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/v1/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]

# Uploaded item pictures. In development runserver serves them; in production the proxy does.
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
