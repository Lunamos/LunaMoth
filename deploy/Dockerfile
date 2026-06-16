# LunaMoth — one-click server image (plan Track E / Track F).
#
# We install the prebuilt WHEEL, which carries the built frontend (front/webui/)
# via package-data — so this image needs NO node and NO source/dist tree, just
# the wheel. Build the wheel first with `scripts/build-wheel.sh` (it emits
# dist/*.whl), then build this image from the repo root:
#
#   scripts/build-wheel.sh
#   docker build -f deploy/Dockerfile -t lunamoth:latest .
#
# Single-stage python:3.12-slim, mirroring reference/AstrBot/Dockerfile but
# leaner (AstrBot copies source + installs node; we don't have to).
FROM python:3.12-slim

WORKDIR /app

# ripgrep backs the search_files tool; git is handy for chara terminal work.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        ripgrep \
        git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Copy the prebuilt wheel(s) produced by scripts/build-wheel.sh. The wheel
# bundles front/webui/, so the served UI is inside the install — no extra steps.
# Install with the server + messaging extras (websockets/qrcode) straight from
# the wheel file so `lunamoth desktop` and the gateways work out of the box.
COPY dist/*.whl /tmp/wheels/
RUN set -eux; \
    whl="$(ls /tmp/wheels/*.whl | head -n1)"; \
    python -m pip install --no-cache-dir "${whl}[server,messaging]"; \
    rm -rf /tmp/wheels

# Sessions, cards and config live under ~/.lunamoth — persist it via a volume.
ENV LUNAMOTH_HOME=/root/.lunamoth
VOLUME ["/root/.lunamoth"]

# The supervisor's HTTP renderer (6180) + WS gateway (6181 = http+1, the
# deterministic non-loopback default so a reverse proxy can pin it). Bound to
# 0.0.0.0 by the entrypoint; put a TLS reverse proxy in front past loopback (README).
EXPOSE 6180 6181

# The entrypoint generates an access token if LUNAMOTH_TOKEN is unset and prints
# it (the wildcard bind needs a token — the gate), then serves headless. Set
# LUNAMOTH_TOKEN to pin a known token; LUNAMOTH_PORT to change the port.
COPY deploy/entrypoint.sh /usr/local/bin/lunamoth-entrypoint
RUN chmod +x /usr/local/bin/lunamoth-entrypoint
ENTRYPOINT ["/usr/local/bin/lunamoth-entrypoint"]
