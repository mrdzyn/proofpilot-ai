// Static server for the synthetic F01 fixture. Serves a fixed route map only:
// no directory listing, no path resolution from request input.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SRC = new URL('./src/', import.meta.url);
const ROUTES = {
  '/product/demo': ['product.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
};

const host = '127.0.0.1';
const port = Number(process.env.FIXTURE_PORT ?? 4173);

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', `http://${host}`);
  if (pathname === '/') {
    res.writeHead(302, { location: '/product/demo' }).end();
    return;
  }
  const route = ROUTES[pathname];
  if (req.method !== 'GET' || !route) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    return;
  }
  const body = await readFile(fileURLToPath(new URL(route[0], SRC)));
  res.writeHead(200, { 'content-type': route[1], 'cache-control': 'no-store' }).end(body);
});

server.listen(port, host, () => {
  console.log(`sample-store fixture listening on http://${host}:${port}/product/demo`);
});
