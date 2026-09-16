/**
 * Rate limiter de ventana fija para endpoints sensibles (verify/*, invite/resend,
 * asistente IA).
 *
 * Niveles:
 * - Nivel 1, memoria por instancia (Map). Cero dependencias; en serverless cada
 *   instancia tiene su propio contador, así que el límite efectivo es
 *   `limit × instancias`. Sirve como primera barrera barata.
 * - Nivel 2, persistente y atómico (`RateLimitStore`): una RPC evalúa TODAS las
 *   claves de la petición y registra el hit solo si todas caben
 *   (`fn_rate_limit_hit`, tabla `rate_limit_buckets`; implementación en
 *   `rateLimitStore.ts`). Las rutas que lo necesitan lo pasan en `opts.store`.
 *
 * Ya NO existe `persistentCount` (contador legado por clave, inyectable): nunca
 * tuvo consumidor, y como se resolvía con un `await` entre la proyección en
 * memoria y el registro, N peticiones concurrentes proyectaban todas `count = 1`
 * (tester F0-SEC C+D r2, fallo 4). Un solo mecanismo persistente: el `store`
 * atómico (regla 7). El camino en memoria es síncrono de punta a punta.
 *
 * Semántica (F0-SEC r2, sub-parte D):
 * - FAIL-CLOSED. Clave vacía, `limit` inválido, `windowMs <= 0`/NaN o un
 *   `store` que falla → BLOQUEADO y registrado.
 * - EVALUAR TODO, LUEGO REGISTRAR. `checkRateLimits` comprueba todas las claves
 *   y solo si todas caben registra el hit en todas. Antes incrementaba `ip` y
 *   `user` aunque `to` bloqueara: una ráfaga a un número bloqueado agotaba el
 *   cupo del usuario para otros números. Consecuencia: una petición bloqueada
 *   NO consume cupo (ventana fija: `resetAt` no se mueve).
 * - `getClientIp` sin cabeceras de proxy devuelve `UNKNOWN_CLIENT_IP`
 *   (`'unknown'`): todos los clientes sin proxy comparten ese cubo. En
 *   Vercel/Railway siempre hay `x-forwarded-for`; en local, el límite por IP
 *   es compartido a propósito.
 * - CUBO `unknown` FAIL-CLOSED RAZONABLE (F0-pulido, qa r4 A+B §3 bajo 3): una
 *   clave que termina en `:unknown` (todas las claves por IP son
 *   `<ruta>:ip:<ip>`) no usa `limit` sino `unknownClientLimit`, y si no se
 *   pasa, `max(1, floor(limit / 10))`. Así, si un despliegue pierde la
 *   cabecera, el cubo compartido se agota diez veces antes y el problema se
 *   ve (un `console.warn` por proceso, la primera vez) en vez de dejar un
 *   cubo laxo que todos comparten. No se bloquea del todo: en local y en
 *   tests no hay proxy y las rutas tienen que seguir respondiendo.
 *
 * Uso:
 *   const rl = await checkRateLimits([{ key: `verify:ip:${ip}`, opts: LIMIT }], { store: getRateLimitStore() });
 *   if (!rl.allowed) return 429 (Retry-After desde rl.resetAt)
 */

export interface RateLimitOptions {
  /** Máximo de hits permitidos en la ventana. */
  limit: number;
  /** Tamaño de ventana en ms (default 10 min). */
  windowMs?: number;
  /**
   * Límite del cubo compartido `unknown` (clave terminada en `:unknown`, es
   * decir, `getClientIp` no encontró cabecera de IP). Default:
   * `max(1, floor(limit / 10))`. Debe ser un entero > 0 y ≤ `limit`; si no,
   * se ignora y rige el default (nunca más laxo que `limit`).
   */
  unknownClientLimit?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  count: number;
}

export interface RateLimitEntry {
  key: string;
  opts: RateLimitOptions;
}

export interface RateLimitStoreEntry {
  key: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitStoreHit {
  key: string;
  /** Hits en la ventana INCLUIDO este (si se registró) o el que habría sido. */
  count: number;
  resetAt: Date;
}

/**
 * Backend persistente. `hit` debe ser atómico sobre todas las claves: si alguna
 * excede su límite, NO registra ninguna y devuelve los recuentos proyectados.
 */
export interface RateLimitStore {
  hit(entries: RateLimitStoreEntry[]): Promise<RateLimitStoreHit[]>;
}

export interface CheckRateLimitsOptions {
  store?: RateLimitStore | null;
}

interface Bucket {
  count: number;
  windowStart: number;
}

const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const buckets = new Map<string, Bucket>();

/** Valor que devuelve `getClientIp` cuando no hay cabecera de IP. */
export const UNKNOWN_CLIENT_IP = 'unknown';
const UNKNOWN_SUFFIX = `:${UNKNOWN_CLIENT_IP}`;
/** Divisor del límite para el cubo `unknown` cuando no se pasa `unknownClientLimit`. */
export const UNKNOWN_CLIENT_LIMIT_DIVISOR = 10;
let unknownBucketWarned = false;

/** `true` si la clave pertenece al cubo compartido sin IP (`…:ip:unknown`). */
export function isUnknownClientKey(key: string): boolean {
  return key.endsWith(UNKNOWN_SUFFIX);
}

/**
 * Límite efectivo de una clave: el de `opts`, salvo para el cubo `unknown`,
 * que usa `unknownClientLimit` (si es válido y no supera `limit`) o
 * `max(1, floor(limit / UNKNOWN_CLIENT_LIMIT_DIVISOR))`. Puro.
 */
export function effectiveLimit(key: string, opts: RateLimitOptions): number {
  if (!isUnknownClientKey(key) || !validLimit(opts.limit)) return opts.limit;
  const custom = opts.unknownClientLimit;
  if (custom !== undefined && Number.isInteger(custom) && custom > 0 && custom <= opts.limit) return custom;
  return Math.max(1, Math.floor(opts.limit / UNKNOWN_CLIENT_LIMIT_DIVISOR));
}

function warnUnknownBucketOnce(key: string, limit: number): void {
  if (unknownBucketWarned) return;
  unknownBucketWarned = true;
  console.warn('[rateLimit] petición sin cabecera de IP (x-forwarded-for / x-real-ip / cf-connecting-ip): cubo compartido "unknown" con límite reducido. Revisa el proxy si esto pasa en producción.', { key, limit });
}

/** Limpieza perezosa para que el Map no crezca sin límite. */
function sweep(now: number, windowMs: number): void {
  if (buckets.size < 5000) return;
  for (const [k, b] of buckets) {
    if (now - b.windowStart > windowMs) buckets.delete(k);
  }
}

function blocked(key: string, limit: number, resetAt: Date, count?: number): RateLimitResult & { blockedKey: string } {
  const fallback = Number.isFinite(limit) ? Math.max(limit, 0) : 0;
  return { allowed: false, remaining: 0, resetAt, count: count ?? fallback, blockedKey: key };
}

function validWindow(windowMs: number | undefined): number | null {
  const w = windowMs ?? DEFAULT_WINDOW_MS;
  return Number.isFinite(w) && w > 0 ? w : null;
}

function validLimit(limit: number): boolean {
  return Number.isFinite(limit) && limit > 0;
}

/**
 * Comprueba varias claves; bloquea si cualquiera excede su límite. Solo cuando
 * TODAS caben registra el hit (memoria y, si hay, `store`).
 */
export async function checkRateLimits(
  entries: RateLimitEntry[],
  options: CheckRateLimitsOptions = {}
): Promise<RateLimitResult & { blockedKey?: string }> {
  const now = Date.now();
  if (entries.length === 0) return { allowed: true, remaining: Infinity, resetAt: new Date(now), count: 0 };

  // 1. Validación (fail-closed) + proyección en memoria, sin mutar todavía.
  const projected: Array<{ key: string; limit: number; windowMs: number; windowStart: number; count: number }> = [];
  for (const e of entries) {
    const windowMs = validWindow(e.opts.windowMs);
    if (!e.key) return blocked(e.key, e.opts.limit, new Date(now + (windowMs ?? DEFAULT_WINDOW_MS)));
    if (windowMs === null) return blocked(e.key, e.opts.limit, new Date(now));
    if (!validLimit(e.opts.limit)) return blocked(e.key, e.opts.limit, new Date(now + windowMs));
    const limit = effectiveLimit(e.key, e.opts);
    if (limit !== e.opts.limit) warnUnknownBucketOnce(e.key, limit);
    const b = buckets.get(e.key);
    const fresh = !b || now - b.windowStart >= windowMs;
    const windowStart = fresh ? now : (b as Bucket).windowStart;
    const count = (fresh ? 0 : (b as Bucket).count) + 1;
    projected.push({ key: e.key, limit, windowMs, windowStart, count });
  }

  for (const p of projected) {
    if (p.count > p.limit) return blocked(p.key, p.limit, new Date(p.windowStart + p.windowMs), p.count);
  }

  // 2. Backend atómico (todas las claves a la vez). Fallar = bloquear. Es el
  //    único `await` del camino, y el store ya es atómico por sí mismo.
  if (options.store) {
    let hits: RateLimitStoreHit[];
    try {
      hits = await options.store.hit(projected.map((p) => ({ key: p.key, limit: p.limit, windowMs: p.windowMs })));
    } catch (err) {
      console.error('[rateLimit] store persistente falló; se bloquea (fail-closed)', { keys: projected.map((p) => p.key), message: err instanceof Error ? err.message : String(err) });
      const p = projected[0];
      return blocked(p.key, p.limit, new Date(p.windowStart + p.windowMs));
    }
    for (const p of projected) {
      const h = hits.find((x) => x.key === p.key);
      if (!h) {
        console.error('[rateLimit] el store no devolvió la clave; se bloquea (fail-closed)', { key: p.key });
        return blocked(p.key, p.limit, new Date(p.windowStart + p.windowMs));
      }
      p.count = Math.max(p.count, h.count);
      if (h.resetAt instanceof Date && !Number.isNaN(h.resetAt.getTime())) {
        p.windowStart = Math.min(p.windowStart, h.resetAt.getTime() - p.windowMs);
      }
      if (p.count > p.limit) return blocked(p.key, p.limit, new Date(p.windowStart + p.windowMs), p.count);
    }
  }

  // 3. Todas caben: registrar en memoria.
  let worst: RateLimitResult | null = null;
  for (const p of projected) {
    sweep(now, p.windowMs);
    const b = buckets.get(p.key);
    if (!b || now - b.windowStart >= p.windowMs) {
      buckets.set(p.key, { count: 1, windowStart: now });
    } else {
      b.count += 1;
    }
    const r: RateLimitResult = {
      allowed: true,
      remaining: Math.max(0, p.limit - p.count),
      resetAt: new Date(p.windowStart + p.windowMs),
      count: p.count,
    };
    if (!worst || r.remaining < worst.remaining) worst = r;
  }
  return worst as RateLimitResult;
}

/**
 * Registra un hit para `key` y devuelve si está permitido. Azúcar sobre
 * `checkRateLimits` con una sola clave.
 */
export async function checkRateLimit(
  key: string,
  opts: RateLimitOptions,
  options: CheckRateLimitsOptions = {}
): Promise<RateLimitResult> {
  const r = await checkRateLimits([{ key, opts }], options);
  return { allowed: r.allowed, remaining: r.remaining, resetAt: r.resetAt, count: r.count };
}

/**
 * Extrae la IP del cliente de los headers habituales (Vercel / proxies).
 * Sin ninguno devuelve `UNKNOWN_CLIENT_IP`: cubo compartido con límite
 * reducido (ver cabecera y `effectiveLimit`).
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || req.headers.get('cf-connecting-ip') || UNKNOWN_CLIENT_IP;
}

/** Solo para tests. */
export function _resetRateLimits(): void {
  buckets.clear();
  unknownBucketWarned = false;
}
