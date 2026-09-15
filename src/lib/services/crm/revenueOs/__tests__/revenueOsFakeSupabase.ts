/**
 * F14 — doble de Supabase para las pruebas de contrato de `/api/crm/revenue/*`.
 *
 * - `rpc(name, args)`: devuelve las filas de `db.rpc[name]` cuyo `p_org_id`
 *   coincide con `args.p_org_id` (cada RPC lleva señuelos de la org 121: si la
 *   ruta pasara `ctx.organizationId + 1`, el payload cambia y la prueba muere).
 *   `db.rpcErrors[name]` simula el error de PostgREST.
 * - `from(table)`: aplica `eq`, `in`, `gte`, `lt` sobre `db.rows[table]`,
 *   soporta `{ count: 'exact', head: true }`, `maybeSingle`, `single`, y
 *   REGISTRA cada `upsert` con su `onConflict` y cada filtro leído.
 */

export type Row = Record<string, unknown>;

export interface RpcCall {
  name: string;
  args: Record<string, unknown>;
}

export interface Write {
  table: string;
  op: 'upsert' | 'insert' | 'update';
  row: Row;
  onConflict?: string;
}

export interface Read {
  table: string;
  filters: Record<string, unknown>;
}

export interface FakeDb {
  rows: Record<string, Row[]>;
  rpc: Record<string, Row[]>;
  rpcErrors?: Record<string, { message: string; code?: string }>;
  rpcCalls: RpcCall[];
  writes: Write[];
  reads: Read[];
}

type Pred = (row: Row) => boolean;

function cmp(a: unknown, b: string): number {
  const sa = String(a);
  const ta = Date.parse(sa);
  const tb = Date.parse(b);
  if (!Number.isNaN(ta) && !Number.isNaN(tb) && /T/.test(sa) && /T/.test(b)) return ta - tb;
  return sa < b ? -1 : sa > b ? 1 : 0;
}

export function createFakeSupabase(db: FakeDb) {
  const rpc = async (name: string, args: Record<string, unknown>) => {
    db.rpcCalls.push({ name, args });
    const err = db.rpcErrors?.[name];
    if (err) return { data: null, error: err };
    const rows = (db.rpc[name] ?? []).filter((r) => r.p_org_id === args.p_org_id);
    // La RPC real no devuelve p_org_id: se quita para que el mapeo no lo vea.
    return {
      data: rows.map((r) => {
        const copy = { ...r };
        delete copy.p_org_id;
        return copy;
      }),
      error: null,
    };
  };

  const from = (table: string) => {
    const preds: Pred[] = [];
    const filters: Record<string, unknown> = {};
    let head = false;
    let wantCount = false;
    let single: 'single' | 'maybe' | null = null;

    const run = () => {
      db.reads.push({ table, filters });
      const rows = (db.rows[table] ?? []).filter((r) => preds.every((p) => p(r)));
      if (single) {
        if (rows.length > 1) return { data: null, error: { message: 'multiple rows', code: 'PGRST116' }, count: null };
        if (rows.length === 0 && single === 'single') return { data: null, error: { message: 'no rows', code: 'PGRST116' }, count: null };
        return { data: rows[0] ?? null, error: null, count: null };
      }
      return { data: head ? null : rows, error: null, count: wantCount ? rows.length : null };
    };

    const builder: Record<string, unknown> = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (opts?.count) wantCount = true;
        if (opts?.head) head = true;
        return builder;
      },
      eq(col: string, v: unknown) {
        filters[`eq:${col}`] = v;
        preds.push((r) => r[col] === v);
        return builder;
      },
      in(col: string, vs: unknown[]) {
        filters[`in:${col}`] = vs;
        preds.push((r) => vs.includes(r[col]));
        return builder;
      },
      gte(col: string, v: string) {
        filters[`gte:${col}`] = v;
        preds.push((r) => cmp(r[col], v) >= 0);
        return builder;
      },
      lt(col: string, v: string) {
        filters[`lt:${col}`] = v;
        preds.push((r) => cmp(r[col], v) < 0);
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      maybeSingle() {
        single = 'maybe';
        return run();
      },
      single() {
        single = 'single';
        return run();
      },
      upsert(row: Row, opts?: { onConflict?: string }) {
        db.writes.push({ table, op: 'upsert', row, onConflict: opts?.onConflict });
        const key = opts?.onConflict?.split(',').map((s) => s.trim()) ?? ['id'];
        const list = db.rows[table] ?? (db.rows[table] = []);
        const idx = list.findIndex((r) => key.every((k) => r[k] === row[k]));
        if (idx >= 0) list[idx] = { ...list[idx], ...row };
        else list.push({ id: `w-${db.writes.length}`, ...row });
        const saved = idx >= 0 ? list[idx] : list[list.length - 1];
        return {
          select: () => ({ single: async () => ({ data: saved, error: null }), maybeSingle: async () => ({ data: saved, error: null }) }),
          then: (res: (v: unknown) => void) => res({ data: null, error: null }),
        };
      },
      then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
        try {
          resolve(run());
        } catch (e) {
          if (reject) reject(e);
        }
      },
    };
    return builder;
  };

  return { rpc, from };
}
