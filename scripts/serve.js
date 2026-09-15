import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const allowed = new Set(['index.html', 'src/app.js', 'src/api.js', 'src/styles.css']);
const port = Number(process.env.PORT ?? 8081);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};
createServer(async (req, res) => {
  try {
    const route = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = route === '/' ? 'index.html' : route.slice(1);
    const path = resolve(root, file);
    if (
      !['GET', 'HEAD'].includes(req.method) ||
      !allowed.has(file) ||
      !path.startsWith(root.endsWith(sep) ? root : root + sep)
    ) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const content = await readFile(path);
    res.writeHead(200, {
      'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log('Conecta: http://127.0.0.1:' + port));
