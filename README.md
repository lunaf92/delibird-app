# Delibird

A wishlist app for friends and family: keep several gift lists, share each one with chosen people, and let them
quietly mark what they are buying without the owner ever finding out.

- [Requirements](https://claude.ai/code/artifact/7993bc48-24eb-4fb6-a142-0e8b93826293)
- [Implementation plan](https://claude.ai/code/artifact/aff4b9db-bd93-4a46-809c-6128edc8bc9f)

| Folder     | What lives there                                                               |
| ---------- | ------------------------------------------------------------------------------ |
| `app/`     | Expo app (React Native, TypeScript, Expo Router) for web, Android and iOS      |
| `backend/` | Django + Django REST Framework API, Celery worker and beat                      |
| `.github/` | CI: lint, type-check and tests for both sides on every pull request            |

Production deployment files (`deploy/`) arrive with the home-network release milestone.

## What you need

- Docker with the Compose plugin
- Node.js 22 and npm
- Python 3.13, only if you want to run backend tools outside Docker

## Run it locally

```sh
cp .env.example .env            # then set DJANGO_SECRET_KEY and POSTGRES_PASSWORD
docker compose up --build       # Postgres, Redis, API, worker, beat and Mailpit
```

- API health: http://localhost:8000/api/v1/health/
- API docs (Swagger): http://localhost:8000/api/v1/docs/
- Django admin: http://localhost:8000/admin/ (create a user with `docker compose exec api python manage.py createsuperuser`)
- Mailpit (every email the app sends): http://localhost:8025

In a second terminal, start the app:

```sh
cd app
cp .env.example .env
npm install
npm run web                     # opens the web app on http://localhost:8081
```

The home screen shows whether the server is healthy and lets you switch between English, Italian and Spanish.

Check that the Celery worker picks up jobs:

```sh
docker compose exec api python manage.py shell -c "from core.tasks import ping; print(ping.delay().get(timeout=10))"
```

## Phones on the home Wi-Fi

1. Find the Linux machine's LAN address (for example `192.168.1.50`) and give it a fixed lease in the router.
2. In the root `.env`, add it to `DJANGO_ALLOWED_HOSTS`.
3. In `app/.env`, set `EXPO_PUBLIC_API_URL=http://192.168.1.50:8000`.
4. Build and install a development build (Expo Go is not enough, the share sheet will need native code):
   - with an Android phone plugged in or an emulator running: `cd app && npx expo run:android` (needs the Android SDK), or
   - in the cloud: `cd app && npx eas-cli@latest build --profile development --platform android` (needs a free Expo account), then install the APK from the link it prints.
5. Run `npm start` in `app/` and open the project from the development build.

Android allows plain HTTP to the LAN server through `expo-build-properties`. iPhones need the paid Apple Developer
account for development builds, so until then iPhone users use the website.

## Tests and checks

Backend (inside Docker, so nothing needs installing):

```sh
docker compose exec api pytest
docker compose exec api ruff check .
docker compose exec api ruff format --check .
docker compose exec api mypy .
```

App:

```sh
cd app
npm test
npm run lint
npm run typecheck
npm run format:check
```

CI runs all of these on every pull request. To run the formatters before each commit:

```sh
pip install pre-commit && pre-commit install
```

## Translations

- App text lives in `app/src/i18n/locales/{en,it,es}.json`.
- Server text (emails, push, API messages) uses Django's gettext. After adding strings, run
  `docker compose exec api python manage.py makemessages -l it -l es`, translate them in
  `backend/locale/<lang>/LC_MESSAGES/django.po`, then `docker compose exec api python manage.py compilemessages`.
  The compiled `.mo` files are committed, so running the tests needs no gettext on your machine.
