# Strena

A wishlist app for friends and family: keep several gift lists, share each one with chosen people, and let them
quietly mark what they are buying without the owner ever finding out.

The app was called Delibird while it was being built. Behind the scenes some names still say `delibird` (the
repository, the Android package, the database and the backup files), so phones that already have it installed
update in place and existing data keeps working.

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

If port 8000 is already in use on your machine, set `API_PORT` in `.env` (for example `API_PORT=8001`), use that
port in the addresses below, and set `EXPO_PUBLIC_API_URL` in `app/.env` to match.

- API health: http://localhost:8000/api/v1/health/
- API docs (Swagger): http://localhost:8000/api/v1/docs/
- Django admin: http://localhost:8000/admin/ (create an admin with `docker compose exec api python manage.py createsuperuser`;
  it asks for an email and a password. Only superusers have a password, for the admin; everyone else signs in with a code)
- Mailpit (every email the app sends): http://localhost:8025

In a second terminal, start the app:

```sh
cd app
cp .env.example .env
npm install
npm run web                     # opens the web app on http://localhost:8081
```

Sign in with any email address: the app sends a six-digit code and a magic link, which you can read in Mailpit
at http://localhost:8025. The first sign-in with a new address creates the account (sign-up is open for now, while the
app only runs on the home network). Settings has your display name, language, signed-in devices, sign out and
account deletion.

Each account starts with a default list, which holds every item. You can add more lists (Birthday, Christmas…),
reorder them, and fill them with items (name, link, notes, a 1–5 star rating, price and currency, and a picture).
An item can be on any number of lists: add it from a list, or pick "Add items you already have". Editing an item
changes it everywhere; taking it off a list keeps it on the others, and deleting it removes it from all of them.
A reservation belongs to the item, so a gift reserved through one shared list shows as taken on the others. Uploaded pictures are re-encoded on the server
(JPEG, at most 1600 px, metadata removed) and kept in `backend/media/` during development.

Share a list from its Sharing screen: each person gets their own link (`APP_URL/shared/…`), which works without
an account. People who sign in from it add the list to "Shared with me", where they can say which items they'll
get. The owner never sees what is taken; `backend/sharing/tests/test_leaks.py` checks that for every API route, and
CI fails if a new route isn't covered.

### Adding from shops

Paste a shop link in a new item and press "Fill in from link": the server reads the page (schema.org Product
data, Open Graph and product tags, or the page title) and fills in the name, price, currency, notes and picture.
Shops that block it (an error status, or a robot-check or captcha page such as Amazon's) still keep the link, and the app says why nothing was filled in: blocked by the shop, too slow, unreachable, unreadable, or not a public address. When nothing can be read, the app guesses the name from the link itself where it reads like one (IKEA's `/p/kallax-shelving-unit-white-stained-oak-effect-00324518/` becomes "Kallax shelving unit white stained oak effect"), only into an empty name, and says it's a guess. `APP_URL/add?url=<link>` starts a new item from a link, and is where the
phone share sheet will land once it's added. The server only fetches public internet addresses (never the home
network), over http or https, with a short timeout and size limits.

### Looks

The app is drawn as if in pen on paper: thick wobbly outlines, offset shadows, pencil-shaded tiles for items
without a picture, Permanent Marker for titles and main buttons and Patrick Hand for the rest. Settings has
five looks (Black ink, Paper and red marker, Chalkboard, Light blue, Green), a dark mode that follows the phone
or is always light or dark (dark uses Chalkboard), and a plain, easy-to-read font instead of handwriting. The
choice is saved on the account (`theme`, `dark_mode`, `plain_font` on `/api/v1/me/`), so it follows the person
to every device; before signing in the device remembers its own. The palettes live in `app/src/theme/looks.ts`,
and a test checks every look's contrast. Phones draw slightly simpler corners than the web, which can draw the
uneven elliptical ones.

### Notifications

The worker sends emails (seen in Mailpit locally) when a list is shared with someone, and, within a minute, when
an item someone reserved is edited or deleted. Push notifications to phones go through Expo's push service and
need, once:

1. An EAS project for the app: `cd app && npx eas-cli@latest init` (adds `extra.eas.projectId` to `app.json`).
2. For Android, a Firebase project with FCM: add its `google-services.json` to `app/` (and `"googleServicesFile":
   "./google-services.json"` under `android` in `app.json`), and upload the FCM v1 service account key with
   `npx eas-cli@latest credentials`.
3. A new development build. Then Settings → "Also notify this phone".

iPhones need the paid Apple Developer account for push. Set `PUSH_ENABLED=false` in `.env` to stop the server
from contacting Expo.

Magic links open `APP_URL` from `.env` (default `http://localhost:8081`, the web app). For phones on the home Wi-Fi,
set it to the web app's LAN address, for example `http://192.168.1.50:8081`.

### Upgrading a database from the Foundations milestone

The Accounts milestone replaced Django's built-in user model, which Django can't migrate in place. If you ran the
stack before, recreate the development database once (this deletes its data):

```sh
docker compose down -v
docker compose up --build
```

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

## Run it on the home server

The home server (a Linux machine at `192.168.0.24`) runs a production-style stack from
`docker-compose.prod.yml`: Caddy on port 80 serves the web app and passes `/api`, `/admin`, `/static` and
`/media` to Django, which runs under gunicorn with the Celery worker and beat beside it. Postgres and Redis are
only reachable inside Docker, everything restarts by itself after a crash or a reboot, and email goes out
through a real SMTP account (Mailpit is only for development). It is plain HTTP on the home Wi-Fi for now; with
a domain later, Caddy can switch to HTTPS by itself (see `deploy/Caddyfile`).

**Once, on the router:** reserve `192.168.0.24` for the server (a DHCP reservation for its network card), so
the address in everyone's links never changes.

**Once, on the server** (Docker with the compose plugin installed):

1. Get the code: `git clone git@github.com:lunaf92/delibird-app.git && cd delibird-app`.
2. `cp .env.example .env`, then edit `.env` following its "Home server" section:
   - `DJANGO_DEBUG=false`, and a real `DJANGO_SECRET_KEY` and `POSTGRES_PASSWORD`. Make them with
     `python3 -c "import secrets; print(secrets.token_urlsafe(50))"`. The server refuses to start with the
     example values.
   - The addresses: `APP_URL=http://192.168.0.24`, and the matching `DJANGO_ALLOWED_HOSTS`,
     `DJANGO_CSRF_TRUSTED_ORIGINS` and `DJANGO_CORS_ALLOWED_ORIGINS`.
   - The email account sign-in codes are sent from: `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`,
     `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS` (port 587) or `EMAIL_USE_SSL` (port 465), and `DEFAULT_FROM_EMAIL`.
     Any SMTP account works: for Gmail, turn on 2-step verification, create an app password and use
     `smtp.gmail.com`, port 587, TLS; providers such as Brevo or Mailjet have free tiers too.
3. Start it: `docker compose -f docker-compose.prod.yml up -d --build`. The first build takes a few minutes
   (it builds the web app too). Then open `http://192.168.0.24` on any device on the Wi-Fi.
4. Optionally, an admin account for `http://192.168.0.24/admin/`:
   `docker compose -f docker-compose.prod.yml exec api python manage.py createsuperuser`. Everyone else simply
   signs in with their email in the app; the first sign-in creates the account.

**Updating** to the latest `master`: `git pull && docker compose -f docker-compose.prod.yml up -d --build`.
Migrations run by themselves when the API starts. `docker compose -f docker-compose.prod.yml logs -f api` shows
what the server is doing, and `ps` shows each part's health.

**Backups:** `./deploy/backup.sh` saves the database and the uploaded pictures into `backups/` and keeps the 14
newest. Run it every night from cron (`crontab -e`, with the path to your checkout):

```
0 3 * * * cd /path/to/delibird-app && ./deploy/backup.sh >> backups/backup.log 2>&1
```

Copy `backups/` somewhere else from time to time (another disk or a cloud drive): a backup on the same disk
doesn't survive the disk. To restore one (this replaces everything since, and stops the app meanwhile):
`./deploy/restore.sh backups/delibird-db-<date>.dump backups/delibird-media-<date>.tar.gz`.

**The Android app** has the server's address built in, so rebuild it once for the home server: in `app/.env`
set `EXPO_PUBLIC_API_URL=http://192.168.0.24`, then `cd app && npx expo prebuild --platform android && cd android
&& ./gradlew assembleRelease`, and install `app/android/app/build/outputs/apk/release/app-release.apk` on each
phone (copy it over, or `adb install`). Plain HTTP to the server is already allowed in the app's settings.

**iPhones** use the website: open `http://192.168.0.24` in Safari and "Add to Home Screen". For sharing links
from other apps there is a free Shortcuts workaround, **not tested yet**: in the Shortcuts app make a new
shortcut, turn on "Show in Share Sheet" (receives URLs and Safari web pages), add "URL Encode" with the
Shortcut Input, then "Open URLs" with `http://192.168.0.24/add?url=` followed by the encoded text. Sharing a
page to that shortcut opens Strena's new-item screen with the link filled in.

**If a device can't reach the server:** with NordVPN on that device (or on the server), turn on its LAN access
with `nordvpn set lan-discovery on`, or the VPN hides the home network. On the server only port 80 is used, so
the clash over port 8000 on the laptop doesn't apply there.

### HTTPS with a domain

The server is reached from anywhere at `https://strena.app`. The server's own nginx, which already serves other
sites on ports 80 and 443, ends HTTPS with a Let's Encrypt certificate and forwards to Strena on port 8080
(`HTTP_PORT=8080` in `.env`).

1. At the domain registrar, point an A record for `strena.app` at the home's public IP, and forward
   ports 80 and 443 on the router to the server if that isn't done already.
2. On the server, add the site and get its certificate:

   ```sh
   sudo cp deploy/nginx-strena.conf /etc/nginx/sites-available/strena
   sudo ln -s /etc/nginx/sites-available/strena /etc/nginx/sites-enabled/strena
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d strena.app --redirect
   ```

3. In `.env`: `APP_URL=https://strena.app`, add `strena.app` to `DJANGO_ALLOWED_HOSTS`, and add
   `https://strena.app` to `DJANGO_CSRF_TRUSTED_ORIGINS` and `DJANGO_CORS_ALLOWED_ORIGINS`. Then
   `docker compose -f docker-compose.prod.yml up -d --build`: the web app is built with `APP_URL` as its API
   address, and sign-in emails link there.
4. Rebuild the Android app with `EXPO_PUBLIC_API_URL=https://strena.app` in `app/.env`, so it works away from home
   too.

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

## API types

The app's TypeScript types for the API are generated from the backend's OpenAPI schema. After changing an endpoint
or serializer, regenerate both and commit them (CI fails if they are out of date):

```sh
docker compose exec api python manage.py spectacular --format openapi-json --validate --file openapi.json
cd app && npm run api:types
```

## Translations

- App text lives in `app/src/i18n/locales/{en,it,es}.json`.
- Server text (emails, push, API messages) uses Django's gettext. After adding strings, run
  `docker compose exec api python manage.py makemessages -l it -l es`, translate them in
  `backend/locale/<lang>/LC_MESSAGES/django.po`, then `docker compose exec api python manage.py compilemessages`.
  The compiled `.mo` files are committed, so running the tests needs no gettext on your machine.
