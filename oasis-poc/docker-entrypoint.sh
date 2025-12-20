#!/bin/sh
set -euo pipefail

APP_USER=${APP_USER:-appuser}
CUSTOM_CA_PATH=${CUSTOM_CA_PATH:-/usr/local/share/ca-certificates/custom-ca.crt}

if [ "$(id -u)" -eq 0 ]; then
  update-ca-certificates >/dev/null 2>&1 || true
fi

if [ -f "$CUSTOM_CA_PATH" ]; then
  export SSL_CERT_FILE="$CUSTOM_CA_PATH"
  export REQUESTS_CA_BUNDLE="$CUSTOM_CA_PATH"
fi

if [ "$(id -u)" -eq 0 ] && id "$APP_USER" >/dev/null 2>&1; then
  exec gosu "$APP_USER" "$@"
fi

exec "$@"
