/**
 * Logo de la organización embebido como `data:` URI, resuelto en el servidor.
 *
 * - Sin `data:` el PDF dependía de que Chromium bajara la imagen a tiempo
 *   (`networkidle0`): si fallaba, salía sin logo y sin sustituto. Ahora el
 *   renderizado no hace NINGUNA petición de red.
 * - `organizations.logo_url` es texto que escribe el cliente: descargar una
 *   URL arbitraria desde el servidor es SSRF. Solo se descarga si apunta al
 *   Storage público del propio proyecto de Supabase, por https, con tiempo y
 *   tamaño máximos y un tipo de imagen rasterizada (sin SVG).
 */

const TIPOS_PERMITIDOS = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const TAMANO_MAXIMO = 1_500_000;
const TIEMPO_MAXIMO_MS = 4000;
const TTL_MS = 10 * 60 * 1000;

const cache = new Map<string, { valor: string | null; en: number }>();

/** ¿La URL es del Storage público del proyecto (misma máquina que NEXT_PUBLIC_SUPABASE_URL)? */
export function urlDeLogoPermitida(url: string | null | undefined, baseSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL): boolean {
  if (!url || !baseSupabase) return false;
  try {
    const destino = new URL(url);
    const base = new URL(baseSupabase);
    return (
      destino.protocol === 'https:' &&
      destino.host === base.host &&
      destino.pathname.startsWith('/storage/v1/object/public/') &&
      !destino.username &&
      !destino.password
    );
  } catch {
    return false;
  }
}

/** Descarga el logo y lo devuelve como `data:` URI, o null si no se puede o no se permite. */
export async function logoComoDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url || !urlDeLogoPermitida(url)) return null;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.en < TTL_MS) return hit.valor;

  let valor: string | null = null;
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), TIEMPO_MAXIMO_MS);
  try {
    const respuesta = await fetch(url, { signal: control.signal, redirect: 'error', cache: 'no-store' });
    const tipo = (respuesta.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const largo = Number(respuesta.headers.get('content-length') ?? '0');
    if (respuesta.ok && TIPOS_PERMITIDOS.has(tipo) && largo <= TAMANO_MAXIMO) {
      const bytes = Buffer.from(await respuesta.arrayBuffer());
      if (bytes.length > 0 && bytes.length <= TAMANO_MAXIMO) {
        valor = `data:${tipo};base64,${bytes.toString('base64')}`;
      }
    }
  } catch (err) {
    console.warn('[documentos] no se pudo embeber el logo', { motivo: err instanceof Error ? err.message : String(err) });
  } finally {
    clearTimeout(temporizador);
  }
  cache.set(url, { valor, en: Date.now() });
  return valor;
}
