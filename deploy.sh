#!/usr/bin/env bash
# Publica el sitio y la API del panel en el VPS. Uso: ./deploy.sh
set -euo pipefail

VPS_USER=root
VPS_HOST=31.97.43.193
VPS_KEY="${HOME}/.ssh/id_ed25519_milab"
DESTINO=/var/www/decocraftmx.com
PANEL=/opt/decocraft-panel

cd "$(dirname "$0")"
node build.mjs

# tar sobre ssh: solo sobrescribe los archivos del build, así que catalogo.json
# y las fotos que subió Mariana (img/subidas/) se quedan donde están.
echo "→ subiendo site/ a ${VPS_HOST}:${DESTINO}"
tar -czf - -C site . | ssh -i "$VPS_KEY" "${VPS_USER}@${VPS_HOST}" \
  "mkdir -p ${DESTINO} && tar -xzf - -C ${DESTINO} && chown -R www-data:www-data ${DESTINO}"

echo "→ actualizando la API del panel"
scp -i "$VPS_KEY" -q panel/servidor.mjs "${VPS_USER}@${VPS_HOST}:${PANEL}/servidor.mjs"
ssh -i "$VPS_KEY" "${VPS_USER}@${VPS_HOST}" "systemctl restart decocraft-panel && systemctl is-active decocraft-panel"

echo "✓ https://decocraftmx.com  ·  https://mipanel.decocraftmx.com"
