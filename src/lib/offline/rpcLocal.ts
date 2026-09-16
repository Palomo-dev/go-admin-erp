/**
 * Equivalentes locales de RPC de lectura (fase 4C del Desktop).
 *
 * La caché de RPC de la fase 4A solo sirve una llamada si ya se hizo con el
 * mismo body; las pantallas que llaman a una RPC con ids variables (p. ej.
 * la cartera de los clientes de la página actual) nunca acertarían. Para
 * esas, aquí se define un resolutor que calcula la misma salida sobre la
 * réplica local. El registro es explícito y pequeño: cada entrada replica
 * exactamente la definición SQL verificada por MCP (fecha en cada una).
 *
 * Orden en el interceptor sin red: resolutor local → caché por body → 503.
 */

import type { LocalDataSource, OfflineRow } from './offlineDb';

export type LocalRpcResolver = (args: Record<string, unknown>, organizationId: number, source: LocalDataSource) => Promise<unknown | null>;

function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

export const LOCAL_RPC_RESOLVERS: Record<string, LocalRpcResolver> = {
  /**
   * `get_accounts_receivable_for_customers(customer_ids uuid[], org_id int)`
   * → filas crudas de `accounts_receivable` (customer_id, balance,
   * days_overdue, status, due_date) de esos clientes y esa organización.
   * Verificada por MCP el 2026-09-16 (SECURITY DEFINER, sin agregados).
   */
  async get_accounts_receivable_for_customers(args, organizationId, source) {
    const orgId = Number(args.org_id);
    if (orgId !== organizationId) return null;
    const ids = toStringArray(args.customer_ids);
    if (ids.length === 0) return [];
    if (!(await source.isReplicated('accounts_receivable', organizationId))) return null;
    const rows = await source.getByIndex('accounts_receivable', 'customer_id', ids);
    return rows
      .filter((r) => r.organization_id === organizationId)
      .map((r: OfflineRow) => ({ customer_id: r.customer_id, balance: r.balance ?? null, days_overdue: r.days_overdue ?? null, status: r.status ?? null, due_date: r.due_date ?? null }));
  },
};

/**
 * Resuelve una RPC localmente. Devuelve la `Response` PostgREST equivalente
 * o null si no hay resolutor, los argumentos no son de esta organización o
 * la tabla base aún no se replicó (el llamador sigue con la caché por body).
 */
export async function resolveLocalRpc(fnName: string, body: string, organizationId: number, source: LocalDataSource): Promise<Response | null> {
  const resolver = LOCAL_RPC_RESOLVERS[fnName];
  if (!resolver) return null;
  let args: Record<string, unknown> = {};
  try {
    args = body ? (JSON.parse(body) as Record<string, unknown>) : {};
  } catch {
    return null;
  }
  try {
    const result = await resolver(args, organizationId, source);
    if (result === null) return null;
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json', 'X-Offline-Local': 'true' } });
  } catch (err) {
    if (typeof console !== 'undefined') console.warn(`[offline] RPC local ${fnName} falló; se usa la caché por body:`, err);
    return null;
  }
}
