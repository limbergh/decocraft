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

## El panel (mipanel.decocraftmx.com)

Mariana entra a `https://mipanel.decocraftmx.com` con su correo y contraseña
(el navegador pide el login antes de mostrar nada) y ahí puede dar de alta,
editar, ocultar o borrar productos, con foto incluida.

Es el mismo sitio: el archivo publicado es uno solo y detecta el subdominio
(`ES_PANEL` en el diseño). En `decocraftmx.com` el botón *Mi panel* ni siquiera
se dibuja.

Cómo se guarda:

```
mipanel.decocraftmx.com                 decocraftmx.com
  panel  --PUT /api/catalogo-->  nginx (usuario+contraseña)
                                   |
                                   v
                          decocraft-panel.service      escribe
                          (node, 127.0.0.1:8500)  ---------------> catalogo.json
                                                                   img/subidas/
                                                                        |
                                    la tienda lo lee como archivo <-----+
```

- **Login** `auth_basic` de nginx contra `/etc/nginx/decocraft.htpasswd`
  (bcrypt, fuera del repo). Para cambiar la contraseña:
  `htpasswd -B /etc/nginx/decocraft.htpasswd marianaherreralugo7@gmail.com`
- **Servicio** `systemctl status decocraft-panel` · logs con
  `journalctl -u decocraft-panel -f`. Solo escucha en 127.0.0.1 y solo puede
  escribir dentro de `/var/www/decocraftmx.com`.
- **El carrito** sigue siendo de cada visitante (`localStorage`); lo que se
  comparte es el catálogo.
- Mientras no exista `catalogo.json`, la tienda muestra los 9 productos de
  ejemplo del diseño (`SEED`). El primer guardado del panel lo crea.
