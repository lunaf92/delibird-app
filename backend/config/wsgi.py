import os

from django.core.wsgi import get_wsgi_application

from core.chunked import accept_chunked_bodies

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

application = accept_chunked_bodies(get_wsgi_application())
