#!/bin/sh
# Runs migrations (and outside development, collects static files) before the API starts.
# The worker and beat containers set SKIP_MIGRATIONS=1 so only the API migrates.
set -e

if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
    python manage.py migrate --noinput
fi

# In development runserver serves static files itself.
if [ "${DJANGO_DEBUG:-false}" != "true" ]; then
    python manage.py collectstatic --noinput --verbosity 0
fi

exec "$@"
