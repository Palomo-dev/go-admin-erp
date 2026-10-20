/**
 * Ingreso del escritorio (Electron).
 *
 * El instalador lleva un Next embebido y, a propósito, ninguna clave de
 * servidor (`electron/scripts/build-web.js`). Desde acceso v3 el ingreso
 * cuenta los fallos con `getServiceClient()`: en ese servidor la llamada
 * revienta y la persona ve la pantalla de entrar pero no puede pasar.
 *
 * Aquí no se copia la clave. Si la petición es del servidor embebido
 * (`GOADMIN_DESKTOP_EMBEDDED` + localhost), se reenvía el mismo cuerpo a
 * `https://app.goadmin.io/api/auth/acceso`, que sí cuenta y bloquea. No se
 * siguen redirecciones: el cuerpo lleva la contraseña.
 */
import { NextResponse } from 'next/server';
import { esServidorEmbebidoEscritorio } from '@/lib/auth/verificarTokenAcceso';

const APP_POR_DEFECTO = 'https://app.goadmin.io';
const TIMEOUT_MS = 15_000;

/** Solo la URL pública. No exige el resto de `process.env` (NODE_ENV, etc.). */
type EntornoAcceso = { NEXT_PUBLIC_APP_URL?: string };

/** URL https del ingreso público, o null si no es un destino seguro. */
export function urlAccesoPublico(env: EntornoAcceso = process.env): string | null {
  const base = (env.NEXT_PUBLIC_APP_URL || APP_POR_DEFECTO).trim();
  let url: URL;
  try {
    url = new URL('/api/auth/acceso', base.endsWith('/') ? base : `${base}/`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return null;
  return url.toString();
}

/**
 * Reenvía el ingreso cuando corre el Next embebido. `null` en la web pública
 * (ahí el contador local sigue siendo el camino).
 */
export async function reenviarAccesoEscritorio(
  request: Request,
  body: { email: string; password: string },
  fetchImpl: typeof fetch = fetch,
): Promise<NextResponse | null> {
  let hostname = '';
  try {
    hostname = new URL(request.url).hostname;
  } catch {
    return null;
  }
  if (!esServidorEmbebidoEscritorio(hostname)) return null;
  const destino = urlAccesoPublico();
  if (!destino) return null;
  try {
    if (new URL(destino).host === new URL(request.url).host) return null;
  } catch {
    return null;
  }

  try {
    const res = await fetchImpl(destino, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: body.email, password: body.password }),
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status >= 300 && res.status < 400) {
      console.error('[acceso] el servidor de ingreso del escritorio respondió una redirección; no se sigue');
      return NextResponse.json({ ok: false, codigo: 'inesperado' }, { status: 502 });
    }
    const texto = await res.text();
    const headers = new Headers();
    const tipo = res.headers.get('content-type');
    if (tipo) headers.set('content-type', tipo);
    const retry = res.headers.get('retry-after');
    if (retry) headers.set('retry-after', retry);
    return new NextResponse(texto, { status: res.status, headers });
  } catch (err) {
    console.error(
      '[acceso] el escritorio no pudo hablar con el servidor de ingreso:',
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ ok: false, codigo: 'inesperado' }, { status: 503 });
  }
}
