// Reseñas de producto: las deja cualquiera, pero no se publica ninguna hasta
// que Mariana la aprueba desde el panel.
//
// Dos almacenes a propósito:
//   /var/lib/decocraft   lo que está por revisar. Fuera de la web: ni las
//                        reseñas ni sus fotos son alcanzables por URL.
//   <raíz del sitio>     lo aprobado. resenas.json e img/resenas/ se sirven
//                        como archivos estáticos, así que la tienda las lee
//                        sin tocar este proceso.
//
// Aprobar mueve la foto de un sitio al otro. Rechazar la borra.
import { readFileSync, existsSync, createReadStream } from 'node:fs';
import { writeFile, rename, mkdir, unlink, readdir, stat, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const MAX_TEXTO = 600;
const MAX_NOMBRE = 40;
const MIN_TEXTO = 10;
const MAX_PENDIENTES = 300;

// Un visitante puede dejar 3 reseñas por hora y una sola por producto al día.
// No frena a quien se empeñe, pero sí al que automatiza.
const LIMITE_POR_HORA = 3;
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const CADUCIDAD_FOTO = DIA; // una foto sin reseña en 24h se barre

const recortar = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
// Para detectar la misma reseña mandada dos veces aunque cambien mayúsculas,
// acentos o espacios.
const huella = (t) => recortar(t, MAX_TEXTO).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

export function crearResenas({ raiz, datos, firmasImagen }) {
  const PENDIENTES = join(datos, 'pendientes.json');
  const FOTOS_PENDIENTES = join(datos, 'fotos');
  const APROBADAS = join(raiz, 'resenas.json');
  const FOTOS_PUBLICAS = join(raiz, 'img', 'resenas');

  const leer = (ruta) => {
    try {
      const v = JSON.parse(readFileSync(ruta, 'utf8'));
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };

  async function guardar(ruta, lista) {
    await mkdir(ruta.replace(/[/\\][^/\\]+$/, ''), { recursive: true });
    const tmp = ruta + '.tmp';
    await writeFile(tmp, JSON.stringify(lista, null, 2));
    await rename(tmp, ruta);
  }

  const envios = new Map(); // ip -> [{ cuando, productoId }]
  function registrar(ip, productoId) {
    const ahora = Date.now();
    const previos = (envios.get(ip) || []).filter((e) => ahora - e.cuando < DIA);
    envios.set(ip, previos.concat({ cuando: ahora, productoId }));
  }
  function frenado(ip, productoId) {
    const ahora = Date.now();
    const previos = (envios.get(ip) || []).filter((e) => ahora - e.cuando < DIA);
    envios.set(ip, previos);
    if (previos.filter((e) => ahora - e.cuando < HORA).length >= LIMITE_POR_HORA) {
      return 'Ya mandaste varias reseñas seguidas. Inténtalo en un rato.';
    }
    if (previos.some((e) => e.productoId === productoId)) {
      return 'Ya dejaste una reseña de este producto hoy. ¡Gracias!';
    }
    return null;
  }

  // rename es instantáneo, pero solo dentro del mismo sistema de archivos. Si
  // /var/lib y /var/www acaban en discos distintos lanza EXDEV, así que se
  // copia y se borra.
  async function mover(origen, destino) {
    try {
      await rename(origen, destino);
    } catch (e) {
      if (e.code !== 'EXDEV') throw e;
      await copyFile(origen, destino);
      await unlink(origen);
    }
  }

  // Fotos que se subieron y nunca llegaron a usarse en una reseña.
  async function barrerHuerfanas() {
    try {
      const usadas = new Set(leer(PENDIENTES).map((r) => r.foto).filter(Boolean));
      for (const archivo of await readdir(FOTOS_PENDIENTES)) {
        if (usadas.has(archivo)) continue;
        const ruta = join(FOTOS_PENDIENTES, archivo);
        const info = await stat(ruta);
        if (Date.now() - info.mtimeMs > CADUCIDAD_FOTO) await unlink(ruta);
      }
    } catch {
      // Si aún no existe la carpeta no hay nada que barrer.
    }
  }

  return {
    // ── Público ──────────────────────────────────────────────────────────
    async guardarFoto(cuerpo) {
      const firma = firmasImagen.find((f) => f.test(cuerpo));
      if (!firma) throw new Error('El archivo no es una imagen (png, jpg, webp o gif)');
      await mkdir(FOTOS_PENDIENTES, { recursive: true });
      const nombre = `${randomUUID()}.${firma.ext}`;
      await writeFile(join(FOTOS_PENDIENTES, nombre), cuerpo);
      return nombre;
    },

    async recibir(datosCrudos, ip) {
      const pendientes = leer(PENDIENTES);
      if (pendientes.length >= MAX_PENDIENTES) throw new Error('Hay demasiadas reseñas esperando revisión. Inténtalo mañana.');

      const productoId = recortar(datosCrudos.productoId, 64);
      const nombre = recortar(datosCrudos.nombre, MAX_NOMBRE);
      const texto = recortar(datosCrudos.texto, MAX_TEXTO);
      const estrellas = Math.round(Number(datosCrudos.estrellas));
      const foto = recortar(datosCrudos.foto, 80);

      // El producto tiene que existir de verdad en el catálogo publicado.
      const catalogo = leer(join(raiz, 'catalogo.json'));
      const producto = catalogo.find((p) => p.id === productoId);
      if (!producto) throw new Error('Ese producto ya no está en la tienda.');
      if (nombre.length < 2) throw new Error('Escribe tu nombre.');
      if (texto.length < MIN_TEXTO) throw new Error('Cuéntanos un poco más, con unas palabras más.');
      if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) throw new Error('Elige de 1 a 5 estrellas.');
      if (foto && !/^[0-9a-f-]{36}\.(webp|png|jpg|gif)$/.test(foto)) throw new Error('Esa foto no es válida.');
      if (foto && !existsSync(join(FOTOS_PENDIENTES, foto))) throw new Error('La foto ya no está. Vuelve a subirla.');

      const frena = frenado(ip, productoId);
      if (frena) throw new Error(frena);

      // Misma reseña repetida, venga de donde venga.
      const h = huella(texto);
      const yaEsta = pendientes.concat(leer(APROBADAS)).some((r) => r.productoId === productoId && huella(r.texto) === h);
      if (yaEsta) throw new Error('Esa reseña ya está registrada.');

      const resena = {
        id: randomUUID(),
        productoId,
        productoNombre: recortar(producto.nombre, 120),
        nombre,
        estrellas,
        texto,
        foto,
        fecha: new Date().toISOString(),
        ip,
      };
      await guardar(PENDIENTES, pendientes.concat(resena));
      registrar(ip, productoId);
      await barrerHuerfanas();
      return resena;
    },

    // ── Panel ────────────────────────────────────────────────────────────
    pendientes() {
      // Sin la IP: al panel no le hace falta y no tiene por qué verla.
      return leer(PENDIENTES).map(({ ip, ...resto }) => resto);
    },

    rutaFotoPendiente(nombre) {
      if (!/^[0-9a-f-]{36}\.(webp|png|jpg|gif)$/.test(String(nombre || ''))) return null;
      const ruta = join(FOTOS_PENDIENTES, nombre);
      return existsSync(ruta) ? ruta : null;
    },

    abrirFoto(ruta) {
      return createReadStream(ruta);
    },

    async aprobar(id) {
      const pendientes = leer(PENDIENTES);
      const resena = pendientes.find((r) => r.id === id);
      if (!resena) throw new Error('Esa reseña ya no está pendiente.');

      let fotoPublica = '';
      if (resena.foto) {
        await mkdir(FOTOS_PUBLICAS, { recursive: true });
        const origen = join(FOTOS_PENDIENTES, resena.foto);
        if (existsSync(origen)) {
          await mover(origen, join(FOTOS_PUBLICAS, resena.foto));
          fotoPublica = '/img/resenas/' + resena.foto;
        }
      }

      // productoNombre se conserva: el carrusel del inicio enseña de qué pieza
      // habla cada reseña. La IP no sale de aquí.
      const { ip, foto, ...publica } = resena;
      await guardar(APROBADAS, leer(APROBADAS).concat(Object.assign(publica, { foto: fotoPublica })));
      await guardar(PENDIENTES, pendientes.filter((r) => r.id !== id));
      return { ok: true };
    },

    async rechazar(id) {
      const pendientes = leer(PENDIENTES);
      const resena = pendientes.find((r) => r.id === id);
      if (!resena) throw new Error('Esa reseña ya no está pendiente.');
      if (resena.foto) await unlink(join(FOTOS_PENDIENTES, resena.foto)).catch(() => {});
      await guardar(PENDIENTES, pendientes.filter((r) => r.id !== id));
      return { ok: true };
    },

    // Quitar una que ya estaba publicada, por si se cuela algo.
    async borrarPublicada(id) {
      const aprobadas = leer(APROBADAS);
      const resena = aprobadas.find((r) => r.id === id);
      if (!resena) throw new Error('Esa reseña no está publicada.');
      if (resena.foto) await unlink(join(raiz, resena.foto.replace(/^\//, ''))).catch(() => {});
      await guardar(APROBADAS, aprobadas.filter((r) => r.id !== id));
      return { ok: true };
    },

    barrerHuerfanas,
  };
}
