/**
 * Reenvío de `/api/*` del Next embebido hacia la web pública.
 *
 * El instalador no lleva claves de servidor (`electron/scripts/build-web.js`).
 * Cualquier ruta que llama a `getServiceClient()` responde 500 en el
 * escritorio: el plan del encabezado, las organizaciones, el token de voz
 * y el resto. No se copia la clave. Si la petición es del servidor embebido
 * (`GOADMIN_DESKTOP_EMBEDDED=1`) y el host es local, se reenvía tal cual a
 * `https://app.goadmin.io`, con la cookie de sesión y el `Authorization`
 * que ya traía el navegador.
 *
 * `webLauncher.ts` lo instala ANTES de cargar `server.js`, así cubre también
 * las rutas que el middleware de la web pública no ve (webhooks, `/api/auth`,
 * `/api/voice`). En Vercel este archivo no se ejecuta.
 *
 * El destino es solo https y solo el host de `NEXT_PUBLIC_APP_URL` (por
 * defecto app.goadmin.io). Una ruta que, al resolverla, cambie de host no
 * se reenvía. Las páginas (`/app/...`) siguen saliendo del Next local para
 * poder navegar sin red.
 */
import * as http from 'http';
import * as https from 'https';

export const APP_POR_DEFECTO = 'https://app.goadmin.io';
/** Las acciones de IA pueden tardar; el ingreso solo usa una fracción. */
export const TIMEOUT_API_MS = 120_000;

const CABECERAS_QUE_NO_SE_COPIAN = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'origin',
  'referer',
  'forwarded',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
]);

const CABECERAS_DE_RESPUESTA_QUE_NO_SE_COPIAN = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'upgrade',
]);

export type PeticionHttps = (
  options: https.RequestOptions,
  callback: (respuesta: http.IncomingMessage) => void,
) => http.ClientRequest;

/** Origen https de la web pública, o null si no es un destino seguro. */
export function origenPublico(env: NodeJS.ProcessEnv = process.env): URL | null {
  const base = (env.NEXT_PUBLIC_APP_URL || APP_POR_DEFECTO).trim();
  let url: URL;
  try {
    url = new URL(base.includes('://') ? base : `https://${base}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return null;
  return url;
}

function hostDe(header: string | undefined): string {
  const raw = (header || '').trim().toLowerCase();
  if (raw.startsWith('[')) {
    const fin = raw.indexOf(']');
    return fin > 1 ? raw.slice(1, fin) : '';
  }
  return raw.split(':')[0];
}

/**
 * URL pública de una petición `/api` del escritorio, o null si hay que
 * dejarla en el Next local (no es el embebido, no es `/api`, o el destino
 * no es seguro).
 */
export function destinoDeApiEmbebida(
  url: string | undefined,
  hostHeader: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): URL | null {
  if (env.GOADMIN_DESKTOP_EMBEDDED !== '1') return null;
  const host = hostDe(hostHeader);
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') return null;
  const ruta = url && url.startsWith('/') ? url : '';
  if (!ruta) return null;
  const path = ruta.split('?')[0];
  if (path !== '/api' && !path.startsWith('/api/')) return null;
  const origen = origenPublico(env);
  if (!origen) return null;
  let destino: URL;
  try {
    destino = new URL(ruta, origen);
  } catch {
    return null;
  }
  if (destino.protocol !== 'https:') return null;
  if (destino.hostname.toLowerCase() !== origen.hostname.toLowerCase()) return null;
  if (destino.pathname !== '/api' && !destino.pathname.startsWith('/api/')) return null;
  return destino;
}

/** Cookie y Authorization se conservan. Host y Origin quedan en la web pública. */
export function cabecerasDeReenvio(rawHeaders: string[], destino: URL): http.OutgoingHttpHeaders {
  const out: http.OutgoingHttpHeaders = {};
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const nombre = rawHeaders[i];
    const lower = nombre.toLowerCase();
    if (CABECERAS_QUE_NO_SE_COPIAN.has(lower)) continue;
    const valor = rawHeaders[i + 1];
    const previo = out[lower];
    if (previo === undefined) out[lower] = valor;
    else if (Array.isArray(previo)) previo.push(valor);
    else out[lower] = [String(previo), valor];
  }
  out.host = destino.host;
  out.origin = `${destino.protocol}//${destino.host}`;
  return out;
}

function responderFallo(res: http.ServerResponse, status: number, yaCerro: { valor: boolean }): void {
  if (yaCerro.valor) return;
  yaCerro.valor = true;
  if (res.headersSent || res.writableEnded) {
    res.destroy();
    return;
  }
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify({ error: 'El escritorio no pudo hablar con el servidor' }));
}

function copiarCabecerasDeRespuesta(upstream: http.IncomingMessage, destino: URL): http.OutgoingHttpHeaders {
  const out: http.OutgoingHttpHeaders = {};
  for (let i = 0; i < upstream.rawHeaders.length; i += 2) {
    const nombre = upstream.rawHeaders[i];
    const lower = nombre.toLowerCase();
    if (CABECERAS_DE_RESPUESTA_QUE_NO_SE_COPIAN.has(lower)) continue;
    let valor = upstream.rawHeaders[i + 1];
    if (lower === 'location') {
      try {
        const loc = new URL(valor, destino);
        if (loc.hostname.toLowerCase() === destino.hostname.toLowerCase() && (loc.pathname === '/api' || loc.pathname.startsWith('/api/'))) {
          valor = `${loc.pathname}${loc.search}`;
        }
      } catch {
        // Se deja el Location tal cual llegó.
      }
    }
    const previo = out[lower];
    if (previo === undefined) out[lower] = valor;
    else if (Array.isArray(previo)) previo.push(valor);
    else out[lower] = [String(previo), valor];
  }
  return out;
}

/**
 * Reenvía una petición ya aceptada. No sigue redirecciones: un 3xx vuelve
 * al navegador y, si apunta a `/api` de la misma web, el Location queda en
 * ruta relativa para no salir del origen local.
 */
export function reenviarApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  destino: URL,
  requestImpl: PeticionHttps = https.request,
): void {
  const yaCerro = { valor: false };
  const upstream = requestImpl(
    {
      protocol: destino.protocol,
      hostname: destino.hostname,
      port: destino.port || 443,
      method: req.method,
      path: `${destino.pathname}${destino.search}`,
      headers: cabecerasDeReenvio(req.rawHeaders ?? [], destino),
      timeout: TIMEOUT_API_MS,
    },
    (respuesta) => {
      if (yaCerro.valor) {
        respuesta.destroy();
        return;
      }
      yaCerro.valor = true;
      res.writeHead(respuesta.statusCode || 502, copiarCabecerasDeRespuesta(respuesta, destino));
      respuesta.pipe(res);
      respuesta.on('error', () => res.destroy());
    },
  );

  upstream.on('timeout', () => {
    upstream.destroy();
    console.error(`[api-proxy] ${req.method || 'GET'} ${destino.pathname} superó el tiempo de espera`);
    responderFallo(res, 504, yaCerro);
  });
  upstream.on('error', (err: Error) => {
    console.error(
      `[api-proxy] ${req.method || 'GET'} ${destino.pathname} no se pudo reenviar:`,
      err instanceof Error ? err.message : err,
    );
    responderFallo(res, 503, yaCerro);
  });

  req.on('error', () => upstream.destroy());
  res.on('error', () => upstream.destroy());
  req.pipe(upstream);
}

let proxyInstalado = false;

/**
 * Envuelve `http.createServer` para que el `server.js` de Next, al escuchar,
 * mande `/api` a la web pública. Idempotente.
 *
 * `require('http')` y no `import *`: el import estrella arma un namespace
 * con getters y la asignación revienta. El objeto real de Node sí se puede
 * reemplazar, que es lo que ve `server.js` al hacer `require('http')`.
 */
export function instalarProxyApiEnHttp(): void {
  if (proxyInstalado) return;
  proxyInstalado = true;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const httpReal = require('http') as { createServer: typeof http.createServer };
  const original = httpReal.createServer;
  const envuelto = function (this: http.Server, ...args: unknown[]): http.Server {
    const copia = args.slice();
    const idx = copia.findIndex((a) => typeof a === 'function');
    if (idx >= 0) {
      const listener = copia[idx] as http.RequestListener;
      copia[idx] = ((req: http.IncomingMessage, res: http.ServerResponse) => {
        const destino = destinoDeApiEmbebida(req.url, req.headers.host);
        if (!destino) return listener(req, res);
        reenviarApi(req, res, destino);
      }) as http.RequestListener;
    }
    return (original as (...a: unknown[]) => http.Server).apply(this, copia);
  };
  httpReal.createServer = envuelto as typeof http.createServer;
  const origen = origenPublico();
  console.log(
    `[api-proxy] /api del escritorio se reenvía a ${origen ? origen.origin : 'ningún destino seguro'}`,
  );
}
