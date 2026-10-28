#!/bin/sh
set -eu
# Never make an ephemeral fallback data directory for a production deployment.
if [ "${APP_ENV:-}" = "production" ]; then
  test "${PROD_DATA_DIR:-}" = "/var/data/docdetailing" || { echo 'Unexpected production mount'; exit 1; }
  test -d "$PROD_DATA_DIR" || { echo 'Persistent disk is not attached'; exit 1; }
  chown node:node "$PROD_DATA_DIR"
  chmod 700 "$PROD_DATA_DIR"
fi
exec gosu node "$@"
