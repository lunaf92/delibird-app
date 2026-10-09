#!/bin/sh
# Backs up the home server: the database and the uploaded pictures, into backups/ (or the folder given).
# Keeps the 14 newest of each. Run it from cron, for example every night at 3:
#   0 3 * * * cd /path/to/checkout && ./deploy/backup.sh >> backups/backup.log 2>&1
set -eu
cd "$(dirname "$0")/.."
COMPOSE=${COMPOSE:-"docker compose -f docker-compose.prod.yml"}
DEST=${1:-backups}
STAMP=$(date +%Y-%m-%d_%H%M%S)
mkdir -p "$DEST"

$COMPOSE exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
    > "$DEST/strena-db-$STAMP.dump.part"
mv "$DEST/strena-db-$STAMP.dump.part" "$DEST/strena-db-$STAMP.dump"

$COMPOSE exec -T api tar -C /app/media -czf - . > "$DEST/strena-media-$STAMP.tar.gz.part"
mv "$DEST/strena-media-$STAMP.tar.gz.part" "$DEST/strena-media-$STAMP.tar.gz"

# Only the newest 14 of each.
for kind in db media; do
    ls -1t "$DEST"/strena-"$kind"-* 2>/dev/null | tail -n +15 | while read -r old; do rm -f -- "$old"; done
done
echo "Backed up to $DEST/strena-db-$STAMP.dump and $DEST/strena-media-$STAMP.tar.gz"
