/**
 * Rate limiter simple (ventana fija) para endpoints sensibles (verify/*).
 *
 * - Nivel 1: memoria por instancia (Map). Suficiente contra abuso básico y
 *   cero dependencias. En serverless cada instancia tiene su propio contador.
 * - Nivel 2 (opcional, persistente): contador en `comm_usage_logs` u otra
 *   tabla, inyectado vía `persistentCount` para no acoplar este módulo a BD.
 *
 * Uso:
 *   const rl = await checkRateLimit(`verify:ip:${ip}`, { limit: 5, windowMs: 600_000 });
 *   if (!rl.allowed) return 429
 */

export interface RateLimitOptions {
  /** Máximo de hits permitidos en la ventana. */
  limit: number;
  /** Tamaño de ventana en ms (default 10 min). */
  windowMs?: number;
  /**
   * Contador persistente opcional: devuelve cuántos hits hubo para la clave
   * en la ventana (p. ej. consultando la BD). Se suma al contador en memoria
   * solo si es mayor (no se duplica).
   */
  persistentCount?: (key: string, since: Date) => Promise<number>;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  count: number;
}

interface Bucket {
  count: number;
  windowStart: number;
}

const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const buckets = new Map<string, Bucket>();

/** Limpieza perezosa para que el Map no crezca sin límite. */
function sweep(now: number, windowMs: number): void {
  if (buckets.size < 5000) return;
  for (const [k, b] of buckets) {
    if (now - b.windowStart > windowMs) buckets.delete(k);
  }
}

/**
 * Registra un hit para `key` y devuelve si está permitido.
 * Fail-closed frente a claves vacías (se cuenta como bloqueado).
 */
export async function checkRateLimit(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const now = Date.now();
  if (!key) {
    return { allowed: false, remaining: 0, resetAt: new Date(now + windowMs), count: opts.limit };
  }

  sweep(now, windowMs);

  let bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    bucket = { count: 0, windowStart: now };
    buckets.set(key, bucket);
  }
  bucket.count += 1;

  let count = bucket.count;
  if (opts.persistentCount) {
    try {
      const persisted = await opts.persistentCount(key, new Date(bucket.windowStart));
      // El contador persistente ya incluye hits previos; el actual aún no está persistido.
      count = Math.max(count, persisted + 1);
    } catch {
      // Si la BD falla, nos quedamos con el contador en memoria.
    }
  }

  const allowed = count <= opts.limit;
  return {
    allowed,
    remaining: Math.max(0, opts.limit - count),
    resetAt: new Date(bucket.windowStart + windowMs),
    count,
  };
}

/** Comprueba varias claves; bloquea si cualquiera excede su límite. */
export async function checkRateLimits(
  entries: Array<{ key: string; opts: RateLimitOptions }>
): Promise<RateLimitResult & { blockedKey?: string }> {
  let worst: RateLimitResult & { blockedKey?: string } | null = null;
  for (const e of entries) {
    const r = await checkRateLimit(e.key, e.opts);
    if (!r.allowed) return { ...r, blockedKey: e.key };
    if (!worst || r.remaining < worst.remaining) worst = r;
  }
  return worst ?? { allowed: true, remaining: Infinity, resetAt: new Date(), count: 0 };
}

/** Extrae la IP del cliente de los headers habituales (Vercel / proxies). */
export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || req.headers.get('cf-connecting-ip') || 'unknown';
}

/** Solo para tests. */
export function _resetRateLimits(): void {
  buckets.clear();
}
