#!/bin/sh
# Puts a backup made by backup.sh back: ./deploy/restore.sh backups/delibird-db-<stamp>.dump backups/delibird-media-<stamp>.tar.gz
# Everything added since that backup is replaced by it. The app is stopped while it runs.
set -eu
cd "$(dirname "$0")/.."
COMPOSE=${COMPOSE:-"docker compose -f docker-compose.prod.yml"}
DB_DUMP=${1:?Give the database dump (delibird-db-....dump)}
MEDIA_TAR=${2:-}

$COMPOSE stop web api worker beat
$COMPOSE exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' \
    < "$DB_DUMP"
if [ -n "$MEDIA_TAR" ]; then
    $COMPOSE run --rm --no-deps -T --entrypoint sh api -c 'find /app/media -mindepth 1 -delete && tar -C /app/media -xzf -' \
        < "$MEDIA_TAR"
fi
$COMPOSE up -d
echo "Restored $DB_DUMP${MEDIA_TAR:+ and $MEDIA_TAR}"
