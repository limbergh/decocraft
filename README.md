# DecoCraft

Tienda de regalos y papelería personalizada de Mariana — https://decocraftmx.com

El sitio se diseñó en Claude Design; los artboards (`*.dc.html`) son la fuente
de verdad y `build.mjs` los convierte en el sitio estático que se publica.

## Estructura

| Ruta | Qué es |
|---|---|
| `DecoCraft.dc.html` | Diseño principal: la tienda completa (inicio, catálogo, producto, personalizar, carrito, panel). **Este es el que se publica.** |
| `Inicio A.dc.html`, `Inicio B.dc.html` | Exploraciones alternas de la portada. No se publican. |
| `support.js` | Runtime de Claude Design (renderiza los `.dc.html`). No editar. |
| `_ds/` | Design system del proyecto (tokens, estilos). |
| `build.mjs` | Genera `site/index.html`: mete `<head>` con SEO, apunta React a `/vendor` e imágenes a `/img`. |
| `site/` | Lo que realmente se sirve en el VPS. Se regenera con `build.mjs`. |
| `serve.mjs` | Servidor local para probar `site/` antes de publicar. |
| `deploy.sh` | Build + subida al VPS. |

## Trabajar en el sitio

Se edita el diseño en Claude Design (`DecoCraft.dc.html`) y luego:

```bash
node build.mjs   # regenera site/index.html
node serve.mjs   # http://localhost:4321 para revisar
./deploy.sh      # publica en el VPS
```

Las imágenes nuevas hay que bajarlas a `site/img/` en `.webp` y darlas de alta
en el mapa `IMAGENES` de `build.mjs` (el CDN donde nacen es temporal).

## Publicación

- **VPS** Hostinger `31.97.43.193` (`srv838267.hstgr.cloud`), el mismo de los demás proyectos.
- **Raíz** `/var/www/decocraftmx.com`, servida por nginx (`/etc/nginx/sites-enabled/decocraftmx.com.conf`).
- **Certificado** Let's Encrypt vía certbot, renovación automática.
- **Dominio** `decocraftmx.com` (registrado en Hostinger), apunta por A al VPS.

## Notas

- La tienda es 100% cliente: el catálogo y el carrito viven en `localStorage`
  del navegador y los pedidos salen por WhatsApp. No hay backend ni base de datos.
- El botón **Mi panel** edita el catálogo solo en el navegador de quien lo abre;
  no cambia lo que ven los demás.
