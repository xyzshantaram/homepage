#!/bin/sh
set -e

mkdir -p "$MEDIA_DIR" "$(dirname "$COMMENTS_DB")" "$(dirname "$CAP_STATE")"
chown -R bun:bun /app/data

exec gosu bun "$@"
