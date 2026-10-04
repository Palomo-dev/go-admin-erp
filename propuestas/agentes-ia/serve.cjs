const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const archivo = path.join(__dirname, 'dist', 'index.html');
const puerto = Number(process.env.PROPUESTA_PORT || 4318);
http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${puerto}`);
  if (!['/', '/index.html', '/propuesta.html'].includes(url.pathname)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Archivo no disponible.');
  }
  if (!fs.existsSync(archivo)) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Ejecuta build.cjs antes de abrir la propuesta.');
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  fs.createReadStream(archivo).pipe(res);
}).listen(puerto, '127.0.0.1', () => console.log(`Propuesta local: http://127.0.0.1:${puerto}`));
