/**
 * Cliente REST minimo de Supabase para el middleware (Edge Runtime).
 *
 * POR QUE EXISTE ESTE ARCHIVO
 * ---------------------------
 * El middleware usaba el cliente de '@/lib/supabase/config', que es el cliente
 * del NAVEGADOR. Ese cliente:
 *   - reintenta hasta 3 veces con backoff exponencial (1s, 2s, 4s), y
 *   - explicitamente NO pone timeout cuando hay conexion ("sin AbortController").
 *
 * En el Edge Runtime eso significa que una sola consulta lenta a Supabase cuelga
 * el middleware indefinidamente hasta que Vercel lo mata con
 * 504 GATEWAY_TIMEOUT / MIDDLEWARE_INVOCATION_TIMEOUT. Ademas arrastra al bundle
 * del middleware el cache offline (IndexedDB) y el adaptador de storage, lo que
 * encarece el cold start.
 *
 * Aqui cada consulta tiene timeout duro y CERO reintentos. Ante cualquier fallo
 * (timeout, red, RLS, JSON invalido) se devuelve null y el llamador debe dejar
 * pasar la peticion (fail open), igual que hacia el codigo anterior ante error.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/** Timeout por consulta individual. */
export const MW_QUERY_TIMEOUT_MS = 1200;

/**
 * Presupuesto total de trabajo contra la base de datos por peticion.
 * Si se agota, el middleware deja pasar sin terminar de verificar.
 * Muy por debajo del limite de invocacion de Vercel (25s).
 */
export const MW_DB_BUDGET_MS = 2500;

/** Extrae la referencia del proyecto de la URL de Supabase (sin importar el cliente pesado). */
export function getProjectRef(): string {
  return SUPABASE_URL.split('.')[0].replace('https://', '');
}

/**
 * `accessToken` es el JWT del usuario de la peticion. Va en `Authorization`
 * para que PostgREST evalue las politicas RLS COMO ese usuario.
 *
 * Sin el, la consulta viaja como `anon` y `auth.uid()` es NULL. Las tablas del
 * tenant (`organization_modules`, `job_position_module_access`,
 * `organization_members`) exigen membresia activa en sus politicas, asi que
 * devuelven 200 con CERO filas —no un error—. Un llamador que interprete
 * "cero filas" como "no lo tiene contratado" bloquea al usuario en todas las
 * organizaciones. La clave anon solo sirve para tablas con lectura publica.
 */
function baseHeaders(accessToken?: string | null): Record<string, string> {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'x-application-name': 'GoAdminERP-middleware',
  };
}

/**
 * SELECT contra PostgREST. `query` es la ruta ya construida,
 * p. ej. `organizations?select=id,status&id=eq.5&limit=1`.
 *
 * @returns las filas, o null si la consulta fallo o se agoto el tiempo.
 */
export async function edgeSelect<T = any>(
  query: string,
  opts: { timeoutMs?: number; deadline?: number; accessToken?: string | null } = {}
): Promise<T[] | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  const timeoutMs = resolveTimeout(opts);
  if (timeoutMs === null) return null;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
      method: 'GET',
      headers: baseHeaders(opts.accessToken),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) ? (rows as T[]) : null;
  } catch {
    // Timeout, fallo de red o respuesta no-JSON: el llamador hace fail open.
    return null;
  }
}

/**
 * PATCH contra PostgREST, sin esperar el cuerpo de la respuesta.
 * Pensado para escrituras best-effort (p. ej. marcar actividad del usuario).
 */
export async function edgePatch(
  query: string,
  body: Record<string, unknown>,
  opts: { timeoutMs?: number; deadline?: number } = {}
): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;

  const timeoutMs = resolveTimeout(opts);
  if (timeoutMs === null) return false;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
      method: 'PATCH',
      headers: { ...baseHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Timeout efectivo: el menor entre el pedido y lo que queda del presupuesto. */
function resolveTimeout(opts: { timeoutMs?: number; deadline?: number }): number | null {
  const requested = opts.timeoutMs ?? MW_QUERY_TIMEOUT_MS;
  if (opts.deadline === undefined) return requested;

  const remaining = opts.deadline - Date.now();
  if (remaining <= 0) return null; // presupuesto agotado
  return Math.min(requested, remaining);
}
