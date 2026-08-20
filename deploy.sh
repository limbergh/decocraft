#!/usr/bin/env bash
# Publica site/ en el VPS. Uso: ./deploy.sh
set -euo pipefail

VPS_USER=root
VPS_HOST=31.97.43.193
VPS_KEY="${HOME}/.ssh/id_ed25519_milab"
DESTINO=/var/www/decocraftmx.com

cd "$(dirname "$0")"
node build.mjs

echo "→ subiendo site/ a ${VPS_HOST}:${DESTINO}"
tar -czf - -C site . | ssh -i "$VPS_KEY" "${VPS_USER}@${VPS_HOST}" \
  "mkdir -p ${DESTINO} && tar -xzf - -C ${DESTINO} && chown -R www-data:www-data ${DESTINO}"

echo "✓ publicado en https://decocraftmx.com"
