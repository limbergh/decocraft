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

# El catálogo y las fotos subidas son del sitio en vivo, no del build: se
# excluyen del tar para que una copia local de pruebas no pise lo que hay
# publicado. El resto sí se sobrescribe, que para eso es el deploy.
echo "→ subiendo site/ a ${VPS_HOST}:${DESTINO}"
tar --exclude=./catalogo.json --exclude=./resenas.json --exclude=./ajustes.json --exclude=./img/subidas --exclude=./img/resenas -czf - -C site . | ssh -i "$VPS_KEY" "${VPS_USER}@${VPS_HOST}" \
  "mkdir -p ${DESTINO} && tar -xzf - -C ${DESTINO} && chown -R www-data:www-data ${DESTINO}"

echo "→ actualizando la API del panel"
scp -i "$VPS_KEY" -q panel/servidor.mjs panel/resenas.mjs panel/credenciales.mjs "${VPS_USER}@${VPS_HOST}:${PANEL}/"
ssh -i "$VPS_KEY" "${VPS_USER}@${VPS_HOST}" "systemctl restart decocraft-panel && systemctl is-active decocraft-panel"

echo "✓ https://decocraftmx.com  ·  https://mipanel.decocraftmx.com"
