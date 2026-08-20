// Genera site/index.html a partir del diseño DecoCraft.dc.html (Claude Design).
// Cambios respecto al original:
//   - <head> real con SEO / Open Graph / favicon (los buscadores y WhatsApp
//     no ejecutan JS, así que esto tiene que estar en el HTML servido).
//   - React se sirve desde /vendor en vez de unpkg (window.__resources es el
//     hook que expone support.js para eso).
//   - Las imágenes apuntan a /img/*.webp locales en vez del CDN de Higgsfield,
//     que es temporal y pesa 36 MB en PNG (900 KB ya en webp).
//
// Uso:  node build.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'DecoCraft.dc.html';
const OUT = 'site/index.html';

// ── Configuración del sitio ────────────────────────────────────────────────
const DOMINIO = 'https://decocraftmx.com';
const WHATSAPP = '525655802250'; // +52 56 5580 2250
const TITULO = 'DecoCraft — Regalos y papelería personalizada hecha a mano';
const DESC =
  'Vasos, stickers, playeras, agendas y box lunch personalizados a mano. ' +
  'Elige un diseño listo o pide el tuyo 100% personalizado. Envíos a todo México.';

// UUID del CDN → nombre local. Mismo orden que el objeto FOTO del diseño.
const IMAGENES = {
  '1e285194-b27c-498d-afd7-2540db8192fb': 'hero',
  '41a369fb-2643-4bf9-ab96-93cc87020e2a': 'vasos',
  'c062f3e0-8d2e-4b81-9c20-9c89b0d0652d': 'stickers',
  '4e4e9a0d-1abb-42cc-bd7e-f8d771ded7fe': 'papeleria',
  '7cbebbf3-e9fb-4050-a467-48c13d90e4dc': 'playeras',
  '08e3e4b3-f4b3-4390-9808-f229a729e12b': 'agendas',
  '220b9473-eb5c-4037-b773-c8a3bccbe7ab': 'boxlunch',
  'b6f08091-72d3-4262-a076-fbde1ea596e8': 'custom-vaso',
  '69543782-01ed-4d85-b59f-e9cbfe19ec3b': 'custom-playera',
  '384e72eb-c0a6-45a5-82bc-131cce1c3899': 'custom-tote',
  'c9956b36-b2e2-4ab6-af41-90b48b2507dc': 'custom-stickers',
  '2b0c62da-fbfb-41e6-bc80-6c9b74179281': 'custom-box',
  '111ebf45-e610-4cca-8f0e-de8855c7c61a': 'review-ana',
  '8961db32-5295-4841-8324-7de5daa63fbb': 'review-regina',
  'ac1cd492-9285-4bb0-af32-38ea9e60b919': 'review-fernanda',
  '3a1a07a7-751e-48a0-9e93-a8bc210650aa': 'review-daniela',
  '49c8fe0a-57df-4a21-8d5f-8bdb97036edc': 'review-karla',
};

const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_33nBsiFZ2wzzZFjadkZaAjO6Rd1/';

let html = readFileSync(SRC, 'utf8');
const fallos = [];

// ── 1. Imágenes: CDN → /img/*.webp ─────────────────────────────────────────
// El diseño arma unas URLs por concatenación (IMG + 'uuid.png') y otras
// completas, así que se resuelve el prefijo primero y luego se mapea por UUID.
html = html.replace(/const IMG = '[^']*';/, "const IMG = './img/';");
html = html.replace(new RegExp(CDN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + 'hf_\\d+_\\d+_', 'g'), './img/');
html = html.replace(/'?(\.\/img\/)?hf_\d+_\d+_([0-9a-f-]{36})\.png'?/g, (m, _p, uuid) => {
  const nombre = IMAGENES[uuid];
  if (!nombre) { fallos.push(uuid); return m; }
  return m.startsWith("'") ? `'${nombre}.webp'` : `${nombre}.webp`;
});
html = html.replace(/([0-9a-f-]{36})\.png/g, (m, uuid) => (IMAGENES[uuid] ? `${IMAGENES[uuid]}.webp` : m));
html = html.replace(/assets\/logo\.png/g, 'assets/logo.webp');

// ── 2. Número de WhatsApp ──────────────────────────────────────────────────
// Está en dos lados: el default de la prop (en data-props) y el respaldo del
// propio código. Los dos son el número de ejemplo del diseño.
const WHATSAPP_EJEMPLO = '5215512345678';
html = html.replaceAll(WHATSAPP_EJEMPLO, WHATSAPP);

// ── 3. <head> real: SEO + favicon + React local ────────────────────────────
const head = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${TITULO}</title>
<meta name="description" content="${DESC}">
<link rel="canonical" href="${DOMINIO}/">
<meta name="theme-color" content="#fff8dc">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="DecoCraft">
<meta property="og:locale" content="es_MX">
<meta property="og:url" content="${DOMINIO}/">
<meta property="og:title" content="${TITULO}">
<meta property="og:description" content="${DESC}">
<meta property="og:image" content="${DOMINIO}/img/hero.webp">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${TITULO}">
<meta name="twitter:description" content="${DESC}">
<meta name="twitter:image" content="${DOMINIO}/img/hero.webp">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="image" href="/img/hero.webp">
<script>
  // support.js consulta este mapa antes de ir al CDN (ver cdnScriptFor).
  window.__resources = {
    "https://unpkg.com/react@18.3.1/umd/react.production.min.js": "./vendor/react.production.min.js",
    "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js": "./vendor/react-dom.production.min.js"
  };
</script>
<script>
  // DIAGNÓSTICO TEMPORAL — quitar cuando esté resuelto lo del contenido que
  // desaparece. Guarda el último error de JavaScript en el propio teléfono,
  // para poder leerlo después entrando a decocraftmx.com/?diag=1
  window.addEventListener('error', function (e) {
    try {
      localStorage.setItem('decocraft.error', JSON.stringify({
        mensaje: e.message,
        pila: ((e.error && e.error.stack) || '').slice(0, 1200),
        ancho: window.innerWidth,
        cuando: new Date().toString()
      }, null, 1));
    } catch (_) {}
  });
  window.addEventListener('unhandledrejection', function (e) {
    try {
      localStorage.setItem('decocraft.error', JSON.stringify({
        mensaje: 'promesa sin capturar: ' + e.reason,
        pila: ((e.reason && e.reason.stack) || '').slice(0, 1200),
        ancho: window.innerWidth,
        cuando: new Date().toString()
      }, null, 1));
    } catch (_) {}
  });
  if (location.search.indexOf('diag=1') !== -1) {
    document.addEventListener('DOMContentLoaded', function () {
      var caja = document.createElement('pre');
      caja.textContent = localStorage.getItem('decocraft.error') || 'No hay ningún error registrado en este teléfono.';
      caja.style.cssText = 'position:fixed;inset:0;z-index:99999;margin:0;padding:16px;background:#fff;color:#111;font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;overflow:auto';
      document.body.appendChild(caja);
    });
  }
</script>
<script src="./support.js"></script>`;

const headOriginal =
  '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<script src="./support.js"></script>';
if (!html.includes(headOriginal)) throw new Error('El <head> del diseño cambió; revisa build.mjs');
html = html.replace(headOriginal, head);
html = html.replace('<html>', '<html lang="es">');

// ── 4. Verificación ────────────────────────────────────────────────────────
if (fallos.length) throw new Error('UUID sin mapear en IMAGENES: ' + [...new Set(fallos)].join(', '));
if (html.includes('cloudfront.net')) throw new Error('Quedaron URLs del CDN sin reemplazar');
if (html.includes('logo.png')) throw new Error('Quedó una referencia a logo.png');
if (html.includes(WHATSAPP_EJEMPLO)) throw new Error('Quedó el WhatsApp de ejemplo en el sitio');

writeFileSync(OUT, html);
console.log(`OK  ${OUT}  (${(html.length / 1024).toFixed(0)} KB)  WhatsApp: ${WHATSAPP}`);
