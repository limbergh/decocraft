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

- **Login** página propia en `/entrar`, con sesión en cookie firmada
  (HttpOnly, Secure, SameSite=Lax, 30 días). nginx pregunta por cada petición
  al servicio si la cookie vale (`auth_request`) y manda a `/entrar` a quien
  no traiga una. Dentro del panel hay **Cerrar sesión**.
- **La cuenta** vive en `/etc/decocraft/panel.json` (fuera del repo): usuario,
  el scrypt de la contraseña con su sal, y el secreto que firma las sesiones.
  Para cambiarla, en el VPS como root:
  `node /opt/decocraft-panel/credenciales.mjs marianaherreralugo7@gmail.com`
  La pide sin mostrarla y no hace falta reiniciar nada. Conserva el secreto,
  así que no echa fuera a quien ya estaba dentro en otro dispositivo.
- **Diez intentos fallidos** por IP dejan esa IP fuera 15 minutos.
- **Servicio** `systemctl status decocraft-panel` · logs con
  `journalctl -u decocraft-panel -f`. Solo escucha en 127.0.0.1 y solo puede
  escribir dentro de `/var/www/decocraftmx.com`.
- **El carrito** sigue siendo de cada visitante (`localStorage`); lo que se
  comparte es el catálogo.
- Mientras no exista `catalogo.json`, la tienda muestra los 9 productos de
  ejemplo del diseño (`SEED`). El primer guardado del panel lo crea.

## Reseñas de clientes

Las deja cualquiera desde la ficha del producto (estrellas, texto y foto
opcional), pero **no se publica ninguna hasta que Mariana la aprueba** en el
panel. Mientras tanto no existen para la tienda: ni el texto ni la foto son
alcanzables por URL.

```
ficha del producto                         panel
  POST /api/resena-foto  ─┐
  POST /api/resena       ─┴─> /var/lib/decocraft  ──> Publicar ─┐
     (sin sesión,            pendientes.json                    │
      con freno por IP)      fotos/                             v
                                                        resenas.json
                                                        img/resenas/
                                                      (archivos del sitio,
                                                       los lee la tienda)
```

- **Moderación** en el panel: cada reseña pendiente sale con su foto, y los
  botones *Publicar* y *Descartar*. Descartar borra también la foto.
- **Contra el spam**: 3 reseñas por hora y una por producto al día desde la
  misma IP; se rechaza la misma reseña repetida (comparando sin acentos,
  mayúsculas ni espacios); el producto tiene que existir en el catálogo; la
  foto se valida por su firma de archivo, no por lo que diga el navegador.
  Las fotos subidas que nunca llegan a una reseña se barren a las 24 horas.
- **Rutas públicas**: en `decocraftmx.com` solo existen `/api/resena` y
  `/api/resena-foto`. Cualquier otra ruta de `/api/` responde 404; el resto
  del servicio vive únicamente en `mipanel`, con sesión.
- **El carrusel del inicio** sale de las reseñas aprobadas. Si no hay
  ninguna, la sección no se dibuja.

## Categorías y menú

Las categorías no son una lista cerrada: **son las que usan los productos**.
Para crear una, se escribe en el campo Categoría de un producto y se guarda.
Las seis de siempre salen primero aunque se queden vacías; las nuevas se
añaden detrás. Una categoría sin productos no aparece en la tienda.

El menú de arriba lo arma Mariana: en el panel, **Menú de la tienda** lista
todas sus categorías y marca las que quiere ver arriba. Se guarda en
`ajustes.json` (otro archivo estático que lee la tienda). Una categoría
marcada que se quede sin productos no deja una entrada muerta en el menú.

Las categorías nuevas no tienen foto de archivo, así que en el carrusel del
inicio toman la del primer producto que haya dentro.
