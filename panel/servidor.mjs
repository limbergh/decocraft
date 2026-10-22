// API del panel de DecoCraft — mipanel.decocraftmx.com
//
// Hace tres cosas: la sesión (entrar, salir, comprobar), guardar el catálogo
// y recibir fotos de producto. El catálogo se escribe como archivo estático
// (catalogo.json) dentro de la raíz del sitio, así que las visitas normales
// lo leen desde nginx y este proceso no toca el tráfico público.
//
// La sesión sustituye al auth_basic que había antes. Con auth_basic el login
// era la ventanita del navegador: no se puede maquillar, no se puede explicar
// nada si fallas, y no existe cerrar sesión, porque el navegador reenvía la
// contraseña en cada petición y la única forma de olvidarla es cerrarlo todo.
//
// nginx sigue siendo el portero: pregunta por cada petición a /api/sesion
// (auth_request) y manda a /entrar a quien no traiga cookie válida. Aquí se
// comprueba otra vez en las rutas que escriben, para no depender de que la
// configuración de nginx siga siendo la correcta mañana.
import { createServer } from 'node:http';
import { writeFile, rename, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, createHmac, scryptSync, timingSafeEqual } from 'node:crypto';

const RAIZ = process.env.DECOCRAFT_RAIZ || '/var/www/decocraftmx.com';
const PUERTO = Number(process.env.DECOCRAFT_PUERTO || 8500);
const CUENTA = process.env.DECOCRAFT_CUENTA || '/etc/decocraft/panel.json';
const CATALOGO = join(RAIZ, 'catalogo.json');
const DIR_SUBIDAS = join(RAIZ, 'img', 'subidas');

const MAX_JSON = 2 * 1024 * 1024; // 2 MB de catálogo es muchísimo texto
const MAX_IMG = 8 * 1024 * 1024;
const MAX_PRODUCTOS = 500;
const GALLETA = 'decocraft_sesion';
const DURACION = 30 * 24 * 60 * 60 * 1000; // 30 días: es su teléfono
const MAX_INTENTOS = 10;
const CASTIGO = 15 * 60 * 1000;

// Firmas de archivo, no el content-type: el header lo escribe el cliente.
const FIRMAS = [
  { ext: 'webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  { ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'gif', test: (b) => b.subarray(0, 6).toString('latin1').startsWith('GIF8') },
];

const texto = (v, max) => String(v ?? '').slice(0, max);

// ── Sesión ─────────────────────────────────────────────────────────────────

// Se relee en cada intento en vez de cachearse: cambiar la contraseña no
// debería obligar a reiniciar el servicio.
const cuenta = () => JSON.parse(readFileSync(CUENTA, 'utf8'));

// Comparar con === se delata por el tiempo que tarda: cuantos más caracteres
// acierta quien lo intenta, más tarda en fallar. timingSafeEqual siempre tarda
// lo mismo, pero exige que los dos lados midan igual.
function igual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

const firmar = (datos) => createHmac('sha256', cuenta().secreto).update(datos).digest('base64url');

// La sesión no se guarda en ningún lado: el propio vale lleva dentro quién es
// y hasta cuándo vale, firmado. Sin la firma no se puede fabricar uno.
function crearSesion(usuario) {
  const datos = Buffer.from(JSON.stringify({ usuario, expira: Date.now() + DURACION })).toString('base64url');
  return datos + '.' + firmar(datos);
}

function sesionValida(vale) {
  const [datos, firma] = String(vale || '').split('.');
  if (!datos || !firma || !igual(firma, firmar(datos))) return false;
  try {
    const { expira } = JSON.parse(Buffer.from(datos, 'base64url').toString('utf8'));
    return typeof expira === 'number' && Date.now() < expira;
  } catch {
    return false;
  }
}

function galleta(req) {
  const par = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(GALLETA + '='));
  return par ? par.slice(GALLETA.length + 1) : '';
}

const autenticado = (req) => sesionValida(galleta(req));

// HttpOnly para que ningún script pueda leerla, Secure para que no viaje en
// claro, Lax para que llegue al entrar por un enlace pero no desde otro sitio.
const ponerGalleta = (vale, segundos) =>
  `${GALLETA}=${vale}; Path=/; Max-Age=${segundos}; HttpOnly; Secure; SameSite=Lax`;

// Frenar la fuerza bruta: no es una fortaleza, pero convierte "probar un
// millón de contraseñas" en algo que no se puede hacer en una tarde.
const intentos = new Map();
function castigado(ip) {
  const r = intentos.get(ip);
  if (!r) return false;
  if (Date.now() > r.hasta) { intentos.delete(ip); return false; }
  return r.n >= MAX_INTENTOS;
}
function fallo(ip) {
  const r = intentos.get(ip) || { n: 0, hasta: Date.now() + CASTIGO };
  r.n += 1;
  intentos.set(ip, r);
}

function claveCorrecta(usuario, clave) {
  const c = cuenta();
  // Se calculan los dos siempre, sin cortocircuito, para no filtrar por el
  // tiempo de respuesta si el usuario existe o no.
  const usuarioOk = igual(usuario, c.usuario);
  const claveOk = igual(scryptSync(String(clave ?? ''), c.sal, 64).toString('base64'), c.hash);
  return usuarioOk && claveOk;
}

// ── Catálogo ───────────────────────────────────────────────────────────────

// Se reescribe cada producto campo por campo: lo que mande el navegador nunca
// se guarda tal cual.
function limpiarProductos(datos) {
  if (!Array.isArray(datos)) throw new Error('Se esperaba una lista de productos');
  if (datos.length > MAX_PRODUCTOS) throw new Error('Demasiados productos');
  return datos.map((p, i) => {
    if (!p || typeof p !== 'object') throw new Error(`Producto ${i} inválido`);
    return {
      id: texto(p.id, 64) || 'p' + randomUUID().slice(0, 8),
      nombre: texto(p.nombre, 120),
      categoria: texto(p.categoria, 60),
      // Se admiten centavos (99.50), pero no precios negativos ni NaN.
      precio: Number.isFinite(Number(p.precio)) ? Math.max(0, Math.round(Number(p.precio) * 100) / 100) : 0,
      // El precio anterior solo vale si es MAYOR que el de hoy. Si no lo es se
      // guarda en cero, o sea sin rebaja: el sitio no puede acabar enseñando
      // un descuento que no existe aunque alguien fuerce la petición.
      precioAntes: (() => {
        const antes = Number(p.precioAntes);
        const hoy = Number(p.precio);
        if (!Number.isFinite(antes) || !Number.isFinite(hoy) || antes <= hoy) return 0;
        return Math.round(antes * 100) / 100;
      })(),
      desc: texto(p.desc, 600),
      badge: texto(p.badge, 40),
      img: texto(p.img, 300),
      activo: p.activo !== false,
      slot: texto(p.slot, 80) || 'foto de producto',
    };
  });
}

function leerCuerpo(req, limite) {
  return new Promise((resolve, reject) => {
    const trozos = [];
    let total = 0;
    req.on('data', (t) => {
      total += t.length;
      if (total > limite) { reject(new Error('Archivo demasiado grande')); req.destroy(); return; }
      trozos.push(t);
    });
    req.on('end', () => resolve(Buffer.concat(trozos)));
    req.on('error', reject);
  });
}

// Escribir a un temporal y renombrar: si algo falla a medias, el catálogo que
// está publicado no se corrompe.
async function guardarAtomico(ruta, contenido) {
  const tmp = ruta + '.tmp';
  await writeFile(tmp, contenido);
  await rename(tmp, ruta);
}

const responder = (res, codigo, cuerpo, cabeceras = {}) => {
  res.writeHead(codigo, Object.assign({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, cabeceras));
  res.end(JSON.stringify(cuerpo));
};

const servidor = createServer(async (req, res) => {
  const ruta = new URL(req.url, 'http://x').pathname;
  const ip = req.headers['x-real-ip'] || req.socket.remoteAddress || '?';
  try {
    // nginx pregunta aquí por cada petición antes de servir nada.
    if (ruta === '/api/sesion') {
      return autenticado(req) ? responder(res, 200, { ok: true }) : responder(res, 401, { error: 'Sin sesión' });
    }

    if (req.method === 'POST' && ruta === '/api/entrar') {
      if (castigado(ip)) return responder(res, 429, { error: 'Demasiados intentos. Espera 15 minutos y vuelve a probar.' });
      const { usuario, clave } = JSON.parse((await leerCuerpo(req, 4096)).toString('utf8') || '{}');
      if (!claveCorrecta(usuario, clave)) {
        fallo(ip);
        console.log(`entrada fallida desde ${ip}`);
        // El mismo mensaje para usuario inexistente y contraseña mala: decir
        // cuál de los dos falló le regala la mitad del trabajo a quien prueba.
        return responder(res, 401, { error: 'Correo o contraseña incorrectos.' });
      }
      intentos.delete(ip);
      console.log(`entrada correcta desde ${ip}`);
      return responder(res, 200, { ok: true }, { 'set-cookie': ponerGalleta(crearSesion(usuario), DURACION / 1000) });
    }

    if (req.method === 'POST' && ruta === '/api/salir') {
      return responder(res, 200, { ok: true }, { 'set-cookie': ponerGalleta('', 0) });
    }

    // De aquí para abajo se escribe en el disco: nginx ya lo filtró, pero se
    // comprueba igual para no depender solo de su configuración.
    if (!autenticado(req)) return responder(res, 401, { error: 'Sin sesión' });

    if (req.method === 'PUT' && ruta === '/api/catalogo') {
      const cuerpo = await leerCuerpo(req, MAX_JSON);
      const productos = limpiarProductos(JSON.parse(cuerpo.toString('utf8')));
      await guardarAtomico(CATALOGO, JSON.stringify(productos, null, 2));
      console.log(`catálogo guardado: ${productos.length} productos`);
      return responder(res, 200, { ok: true, productos: productos.length });
    }

    if (req.method === 'POST' && ruta === '/api/imagen') {
      const cuerpo = await leerCuerpo(req, MAX_IMG);
      const firma = FIRMAS.find((f) => f.test(cuerpo));
      if (!firma) return responder(res, 415, { error: 'El archivo no es una imagen (png, jpg, webp o gif)' });
      await mkdir(DIR_SUBIDAS, { recursive: true });
      const nombre = `${randomUUID()}.${firma.ext}`;
      await guardarAtomico(join(DIR_SUBIDAS, nombre), cuerpo);
      console.log(`imagen subida: ${nombre} (${Math.round(cuerpo.length / 1024)} KB)`);
      return responder(res, 201, { url: `/img/subidas/${nombre}` });
    }

    return responder(res, 404, { error: 'Ruta desconocida' });
  } catch (e) {
    console.error('error:', e.message);
    return responder(res, 400, { error: e.message });
  }
});

servidor.listen(PUERTO, '127.0.0.1', () => console.log(`panel DecoCraft escuchando en 127.0.0.1:${PUERTO} — raíz ${RAIZ}`));
