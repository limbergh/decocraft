// Servidor estático mínimo para previsualizar site/ en local (node serve.mjs).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('./site/', import.meta.url));
const PORT = 4321;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.xml': 'application/xml' };

// En producción /api/ lo atiende decocraft-panel detrás de nginx. Aquí se
// reenvía al mismo servidor corriendo en local (node panel/servidor.mjs), para
// poder probar el panel entero antes de publicar.
const API = 'http://127.0.0.1:8500';

createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.startsWith('/api/')) {
    try {
      const r = await fetch(API + p, {
        method: req.method,
        headers: { 'content-type': req.headers['content-type'] || 'application/octet-stream' },
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : req,
        duplex: 'half',
      });
      res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json' });
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'No hay API local: corre  node panel/servidor.mjs' }));
    }
    return;
  }
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(ROOT, p));
  try {
    if (!file.startsWith(normalize(ROOT))) throw new Error('fuera de raíz');
    await stat(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('404');
  }
}).listen(PORT, () => console.log('http://localhost:' + PORT));
