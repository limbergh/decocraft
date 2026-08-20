// API del panel de DecoCraft — mipanel.decocraftmx.com
//
// Solo hace dos cosas: guardar el catálogo y recibir fotos de producto.
// El catálogo se escribe como archivo estático (catalogo.json) dentro de la
// raíz del sitio, así que las visitas normales lo leen desde nginx y este
// proceso no toca el tráfico público.
//
// El login NO se valida aquí: nginx protege el subdominio entero con
// auth_basic y este proceso solo escucha en 127.0.0.1, así que nada llega
// sin haber pasado por la contraseña.
import { createServer } from 'node:http';
import { writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const RAIZ = process.env.DECOCRAFT_RAIZ || '/var/www/decocraftmx.com';
const PUERTO = Number(process.env.DECOCRAFT_PUERTO || 8500);
const CATALOGO = join(RAIZ, 'catalogo.json');
const DIR_SUBIDAS = join(RAIZ, 'img', 'subidas');

const MAX_JSON = 2 * 1024 * 1024; // 2 MB de catálogo es muchísimo texto
const MAX_IMG = 8 * 1024 * 1024;
const MAX_PRODUCTOS = 500;

// Firmas de archivo, no el content-type: el header lo escribe el cliente.
const FIRMAS = [
  { ext: 'webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  { ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'gif', test: (b) => b.subarray(0, 6).toString('latin1').startsWith('GIF8') },
];

const texto = (v, max) => String(v ?? '').slice(0, max);

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

const responder = (res, codigo, cuerpo) => {
  const json = JSON.stringify(cuerpo);
  res.writeHead(codigo, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(json);
};

const servidor = createServer(async (req, res) => {
  const ruta = new URL(req.url, 'http://x').pathname;
  try {
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
