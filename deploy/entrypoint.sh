#!/bin/sh
# LunaMoth container entrypoint. The supervisor refuses a 0.0.0.0 bind without a
# token (the access gate). For a turn-key `docker compose up`, generate one if the
# operator didn't supply LUNAMOTH_TOKEN, and print it so `docker compose logs`
# shows how to authenticate. cmd_desktop honors the LUNAMOTH_TOKEN env.
set -e

PORT="${LUNAMOTH_PORT:-6180}"

if [ -z "${LUNAMOTH_TOKEN:-}" ]; then
  LUNAMOTH_TOKEN="$(python -c 'import secrets; print(secrets.token_urlsafe(24))')"
  export LUNAMOTH_TOKEN
  GENERATED=1
fi

echo "============================================================"
if [ "${GENERATED:-0}" = "1" ]; then
  echo " LunaMoth: generated an access token (set LUNAMOTH_TOKEN to pin it)"
else
  echo " LunaMoth: using the provided LUNAMOTH_TOKEN"
fi
echo " token: ${LUNAMOTH_TOKEN}"
echo " open : http://<this-host>:${PORT}/#token=${LUNAMOTH_TOKEN}"
echo " (put a TLS reverse proxy in front for anything past loopback — see README)"
echo "============================================================"

exec lunamoth desktop --host 0.0.0.0 --port "${PORT}" --no-open
