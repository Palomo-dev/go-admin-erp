/**
 * El Next embebido no lleva clave de servicio. Toda `/api` del escritorio
 * se reenvía a la web pública con la cookie y el bearer; las páginas no.
 */
import http from 'http';
import { Writable } from 'stream';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  cabecerasDeReenvio,
  destinoDeApiEmbebida,
  instalarProxyApiEnHttp,
  origenPublico,
  reenviarApi,
  type PeticionHttps,
} from '../../../electron/src/main/proxyApi';

const ENV_EMBEDDED = 'GOADMIN_DESKTOP_EMBEDDED';

function entorno(extra: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return { ...extra, NODE_ENV: 'test', [ENV_EMBEDDED]: '1' };
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve(typeof addr === 'object' && addr ? addr.port : 0);
    });
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe('destino de /api del escritorio', () => {
  test('sin la marca no reenvía', () => {
    expect(destinoDeApiEmbebida('/api/me/plan', 'localhost:47800', { NODE_ENV: 'test' })).toBeNull();
  });

  test('un host que no es local no reenvía (la web pública no se llama a sí misma)', () => {
    expect(destinoDeApiEmbebida('/api/me/plan', 'app.goadmin.io', entorno())).toBeNull();
  });

  test('las páginas se quedan en el Next local', () => {
    expect(destinoDeApiEmbebida('/app/pos', 'localhost:47800', entorno())).toBeNull();
  });

  test('/api/me/plan, /api/voice/token y el ingreso van a la web pública por https', () => {
    for (const ruta of ['/api/me/plan', '/api/me/organizaciones', '/api/voice/token', '/api/auth/acceso']) {
      const destino = destinoDeApiEmbebida(ruta, 'localhost:47800', entorno());
      expect(destino?.toString()).toBe(`https://app.goadmin.io${ruta}`);
    }
    expect(destinoDeApiEmbebida('/api/me/plan?x=1', '127.0.0.1:47800', entorno())?.search).toBe('?x=1');
    expect(destinoDeApiEmbebida('/api/me/plan', '[::1]:47800', entorno())?.pathname).toBe('/api/me/plan');
  });

  test('rechaza http, localhost y una ruta que cambia de host', () => {
    expect(origenPublico(entorno({ NEXT_PUBLIC_APP_URL: 'http://app.goadmin.io' }))).toBeNull();
    expect(origenPublico(entorno({ NEXT_PUBLIC_APP_URL: 'https://localhost:3000' }))).toBeNull();
    expect(destinoDeApiEmbebida('/api/me/plan', 'localhost', entorno({ NEXT_PUBLIC_APP_URL: 'https://127.0.0.1' }))).toBeNull();
    expect(destinoDeApiEmbebida('//evil.example/api/me/plan', 'localhost', entorno())).toBeNull();
    expect(destinoDeApiEmbebida('/api/../app/pos', 'localhost', entorno())).toBeNull();
  });

  test('copia cookie y bearer, y deja el origen en la web pública', () => {
    const destino = new URL('https://app.goadmin.io/api/me/plan');
    const headers = cabecerasDeReenvio(
      [
        'Host', 'localhost:47800',
        'Cookie', 'sb-auth=sesion',
        'Authorization', 'Bearer token-de-sesion',
        'Origin', 'http://localhost:47800',
        'X-Organization-Id', '120',
        'X-Forwarded-Host', 'localhost:47800',
      ],
      destino,
    );
    expect(headers.cookie).toBe('sb-auth=sesion');
    expect(headers.authorization).toBe('Bearer token-de-sesion');
    expect(headers['x-organization-id']).toBe('120');
    expect(headers.host).toBe('app.goadmin.io');
    expect(headers.origin).toBe('https://app.goadmin.io');
    expect(headers['x-forwarded-host']).toBeUndefined();
    expect(JSON.stringify(headers)).not.toMatch(/SERVICE_ROLE|service_role/i);
  });
});

describe('reenviarApi', () => {
  const servers: http.Server[] = [];

  afterEach(async () => {
    delete process.env[ENV_EMBEDDED];
    delete process.env.NEXT_PUBLIC_APP_URL;
    await Promise.all(servers.splice(0).map(close));
  });

  test('reenvía cuerpo, cookie y bearer, y deja en relativo un Location de /api', async () => {
    const visto: { url?: string; cookie?: string; authorization?: string; origin?: string; host?: string; body?: string } = {};
    const upstream = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        visto.url = req.url;
        visto.cookie = req.headers.cookie;
        visto.authorization = req.headers.authorization;
        visto.origin = req.headers.origin;
        visto.host = req.headers.host;
        visto.body = Buffer.concat(chunks).toString();
        res.writeHead(200, {
          'content-type': 'application/json',
          'set-cookie': ['a=1', 'b=2'],
          location: 'https://app.goadmin.io/api/me/plan?siguiente=1',
        });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    servers.push(upstream);
    const puerto = await listen(upstream);
    const requestImpl: PeticionHttps = (options, cb) =>
      http.request(
        {
          hostname: '127.0.0.1',
          port: puerto,
          method: options.method,
          path: options.path,
          headers: options.headers,
        },
        cb,
      );

    process.env[ENV_EMBEDDED] = '1';
    delete process.env.NEXT_PUBLIC_APP_URL;
    const proxy = http.createServer((req, res) => {
      const destino = destinoDeApiEmbebida(req.url, req.headers.host);
      if (!destino) {
        res.writeHead(500);
        res.end('sin destino');
        return;
      }
      reenviarApi(req, res, destino, requestImpl);
    });
    servers.push(proxy);
    const proxyPuerto = await listen(proxy);

    const res = await fetch(`http://127.0.0.1:${proxyPuerto}/api/me/plan?y=2`, {
      method: 'POST',
      headers: {
        cookie: 'sb-auth=sesion',
        authorization: 'Bearer token-de-sesion',
        origin: 'http://localhost:47800',
        'content-type': 'application/json',
        'x-organization-id': '120',
      },
      body: JSON.stringify({ hola: 1 }),
      redirect: 'manual',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get('location')).toBe('/api/me/plan?siguiente=1');
    expect(visto).toMatchObject({
      url: '/api/me/plan?y=2',
      cookie: 'sb-auth=sesion',
      authorization: 'Bearer token-de-sesion',
      origin: 'https://app.goadmin.io',
      host: 'app.goadmin.io',
      body: JSON.stringify({ hola: 1 }),
    });
  });

  test('si la web pública no responde, devuelve 503 sin el cuerpo local', async () => {
    process.env[ENV_EMBEDDED] = '1';
    const proxy = http.createServer((req, res) => {
      const destino = destinoDeApiEmbebida(req.url, 'localhost:47800');
      if (!destino) {
        res.writeHead(500);
        res.end('sin destino');
        return;
      }
      const requestImpl: PeticionHttps = () => {
        const sink = new Writable({
          write(_chunk, _enc, cb) {
            cb();
          },
        });
        process.nextTick(() => sink.emit('error', new Error('connect ECONNREFUSED')));
        return sink as unknown as http.ClientRequest;
      };
      reenviarApi(req, res, destino, requestImpl);
    });
    servers.push(proxy);
    const puerto = await listen(proxy);
    const res = await fetch(`http://127.0.0.1:${puerto}/api/voice/token`, { method: 'POST' });
    expect(res.status).toBe(503);
    const cuerpo = await res.json();
    expect(cuerpo.error).toMatch(/no pudo hablar/);
    expect(JSON.stringify(cuerpo)).not.toMatch(/service_role|eyJ/i);
  });

  test('webLauncher instala el reenvío antes de cargar server.js', () => {
    const src = readFileSync(join(process.cwd(), 'electron/src/main/webLauncher.ts'), 'utf8');
    expect(src.indexOf('instalarProxyApiEnHttp()')).toBeGreaterThan(0);
    expect(src.indexOf('instalarProxyApiEnHttp()')).toBeLessThan(src.indexOf('require(serverJs)'));
  });

  test('el parche no toca una petición que no es /api', async () => {
    const httpReal = require('http') as typeof http;
    const original = httpReal.createServer;
    instalarProxyApiEnHttp();
    try {
      const local = httpReal.createServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('local');
      });
      servers.push(local);
      const puerto = await listen(local);
      const res = await fetch(`http://127.0.0.1:${puerto}/app/pos`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('local');
    } finally {
      httpReal.createServer = original;
    }
  });
});
