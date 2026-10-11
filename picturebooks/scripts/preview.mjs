import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const port = Number(process.env.PICTUREBOOK_PORT || 5186);
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let filename = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!filename.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
    try { if (!(await stat(filename)).isFile()) throw new Error('not a file'); }
    catch { if (pathname.startsWith('/media/') || path.extname(pathname)) { response.writeHead(404); response.end('Not found'); return; } filename = path.join(root, 'index.html'); }
    const content = await readFile(filename);
    response.writeHead(200, { 'content-type': types[path.extname(filename)] || 'application/octet-stream', 'content-length': content.length });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch { response.writeHead(500); response.end('Preview error'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Picturebooks: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
