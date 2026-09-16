/**
 * Backend persistente del rate limit (`RateLimitStore` de `rateLimit.ts`).
 *
 * Implementación: RPC `fn_rate_limit_hit(p_entries jsonb)` sobre la tabla
 * `rate_limit_buckets` (migración `crm_v4_f0sec_rate_limit_buckets`, SOLO
 * ejecutable por `service_role`). Evalúa todas las claves de la petición en una
 * transacción y registra el hit únicamente si todas caben: el límite es el
 * mismo en todas las instancias de Vercel, no `limit × instancias`.
 *
 * Selección por entorno (`RATE_LIMIT_STORE`):
 *  - `db`      → este store. Requiere la migración aplicada. Si la RPC falla
 *                (no existe, timeout, permiso), `rateLimit.ts` BLOQUEA la
 *                petición (fail-closed) y lo registra.
 *  - `memory`  → sin store (solo el Map por instancia). Modo degradado y
 *                explícito: en producción se avisa UNA vez por proceso.
 *  - ausente   → `memory`. Es el valor por defecto a propósito: activar `db`
 *                sin la migración aplicada apagaría `verify/*` e
 *                `invite/resend` de golpe. El despliegue correcto es: aplicar
 *                la migración → poner `RATE_LIMIT_STORE=db` → desplegar.
 *
 * SOLO servidor (usa el cliente service-role).
 */

import { getServiceClient } from '@/lib/supabase/server-service';
import type { RateLimitStore, RateLimitStoreEntry, RateLimitStoreHit } from './rateLimit';

export const RATE_LIMIT_STORE_ENV = 'RATE_LIMIT_STORE';
export const RATE_LIMIT_RPC = 'fn_rate_limit_hit';

interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

interface RpcEntryResult {
  key?: unknown;
  count?: unknown;
  reset_at?: unknown;
}

function asHits(data: unknown, entries: RateLimitStoreEntry[]): RateLimitStoreHit[] {
  const raw = (data as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(raw)) throw new Error(`${RATE_LIMIT_RPC}: respuesta sin "entries"`);
  const hits: RateLimitStoreHit[] = [];
  for (const item of raw as RpcEntryResult[]) {
    const key = typeof item?.key === 'string' ? item.key : null;
    const count = typeof item?.count === 'number' ? item.count : Number(item?.count);
    const resetAt = new Date(String(item?.reset_at ?? ''));
    if (!key || !Number.isFinite(count)) throw new Error(`${RATE_LIMIT_RPC}: entrada mal formada`);
    hits.push({ key, count, resetAt: Number.isNaN(resetAt.getTime()) ? new Date(Date.now() + (entries.find((e) => e.key === key)?.windowMs ?? 0)) : resetAt });
  }
  return hits;
}

/** Store sobre la RPC. `client` inyectable para tests; por defecto el service role. */
export function createDbRateLimitStore(client?: RpcClient): RateLimitStore {
  return {
    async hit(entries: RateLimitStoreEntry[]): Promise<RateLimitStoreHit[]> {
      if (entries.length === 0) return [];
      const rpcClient: RpcClient = client ?? (getServiceClient() as unknown as RpcClient);
      const { data, error } = await rpcClient.rpc(RATE_LIMIT_RPC, {
        p_entries: entries.map((e) => ({ key: e.key, limit: e.limit, window_ms: e.windowMs })),
      });
      if (error) throw new Error(`${RATE_LIMIT_RPC}: ${error.message}`);
      return asHits(data, entries);
    },
  };
}

let warnedMemoryMode = false;
let cached: RateLimitStore | null | undefined;

/** Modo configurado: `db` | `memory` (por defecto). */
export function rateLimitStoreMode(env: NodeJS.ProcessEnv = process.env): 'db' | 'memory' {
  const v = (env[RATE_LIMIT_STORE_ENV] ?? '').trim().toLowerCase();
  return v === 'db' ? 'db' : 'memory';
}

/**
 * Store para las rutas sensibles (`verify/*`, `invite/resend`). `null` en modo
 * memoria (avisando una vez en producción).
 */
export function getRateLimitStore(): RateLimitStore | null {
  if (cached !== undefined) return cached;
  if (rateLimitStoreMode() === 'db') {
    cached = createDbRateLimitStore();
    return cached;
  }
  if (process.env.NODE_ENV === 'production' && !warnedMemoryMode) {
    warnedMemoryMode = true;
    console.warn(`[rateLimit] ${RATE_LIMIT_STORE_ENV} no es "db": el límite de verify/* e invite/resend es solo por instancia. Aplica la migración rate_limit_buckets y activa RATE_LIMIT_STORE=db.`);
  }
  cached = null;
  return cached;
}

/** Solo para tests. */
export function _resetRateLimitStore(): void {
  cached = undefined;
  warnedMemoryMode = false;
}
