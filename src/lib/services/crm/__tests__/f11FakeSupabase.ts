/**
 * F11 — doble de Supabase para servicios y tareas programadas.
 *
 * Aplica de verdad `eq`, `in`, `is`, `not(col,'is',null)`, `gt/gte/lt/lte`,
 * `order`, `limit`, `range`; `insert` acepta fila o array; registra cada
 * escritura; `rpc` se resuelve con un mapa de handlers; `auth.getUser()` fijo.
 * Las fixtures llevan señuelos de la org 121: leer o escribir sin
 * `organization_id` cambia el payload y la prueba muere.
 *
 * r2: simula los índices únicos parciales reales de la migración
 * `20260915150000_f11_idempotencia_postventa…` (`F11_UNIQUE_INDEXES`): un
 * `insert` que los viola devuelve `23505` y NO queda en `writes` (la BD no
 * escribe nada); el intento queda en `rejected`. Y un reloj virtual: cada
 * llamada (lectura, escritura o rpc) suma `latencyMs` a `virtualNowMs`, para
 * medir presupuestos sin esperar de verdad.
 */

export type Row = Record<string, unknown>;

export interface Write {
  table: string;
  op: 'insert' | 'update' | 'delete';
  rows: Row[];
  filters: Record<string, unknown>;
}

export interface UniqueIndex {
  name: string;
  table: string;
  columns: string[];
  where?: (row: Row) => boolean;
}

/** Índices únicos parciales reales (F11 r2, aplicados por el orquestador). */
export const F11_UNIQUE_INDEXES: UniqueIndex[] = [
  { name: 'uq_opportunities_one_renewal_per_parent', table: 'opportunities', columns: ['organization_id', 'parent_opportunity_id'], where: (r) => r.deal_type === 'renewal' && r.parent_opportunity_id != null },
  { name: 'uq_opportunities_one_onboarding_child_per_parent', table: 'opportunities', columns: ['organization_id', 'parent_opportunity_id', 'pipeline_id'], where: (r) => (r.metadata as { type?: unknown } | null)?.type === 'onboarding' && r.parent_opportunity_id != null },
  { name: 'uq_onboarding_instances_org_opportunity', table: 'onboarding_instances', columns: ['organization_id', 'opportunity_id'], where: (r) => r.opportunity_id != null },
];

export interface FakeDb {
  rows: Record<string, Row[]>;
  writes: Write[];
  /** Inserts rechazados por un índice único (23505): nada se escribió. */
  rejected: Array<Write & { index: string }>;
  uniqueIndexes: UniqueIndex[];
  /** Reloj virtual: cada llamada al doble suma `latencyMs`. */
  latencyMs: number;
  virtualNowMs: number;
  calls: number;
  rpc?: Record<string, (args: Record<string, unknown>) => unknown>;
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
  /** Simula un error de BD en la próxima escritura sobre esa tabla. */
  nextWriteError?: { table: string; error: { code: string; message: string } };
  /** Simula un error de BD en la próxima lectura sobre esa tabla. */
  nextReadError?: { table: string; error: { code: string; message: string } };
  nextId: number;
  userId: string;
}

export function makeDb(rows: Record<string, Row[]> = {}, rpc: FakeDb['rpc'] = {}): FakeDb {
  return { rows, writes: [], rejected: [], uniqueIndexes: [...F11_UNIQUE_INDEXES], latencyMs: 0, virtualNowMs: 0, calls: 0, rpc, rpcCalls: [], nextId: 1, userId: 'user-1' };
}

function tick(db: FakeDb): void {
  db.calls += 1;
  db.virtualNowMs += db.latencyMs;
}

function violatedIndex(db: FakeDb, table: string, all: Row[], row: Row): UniqueIndex | null {
  for (const idx of db.uniqueIndexes) {
    if (idx.table !== table || (idx.where && !idx.where(row))) continue;
    const clash = all.some((r) => (!idx.where || idx.where(r)) && idx.columns.every((c) => r[c] === row[c]));
    if (clash) return idx;
  }
  return null;
}

type Pred = (row: Row) => boolean;

function cmp(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const sa = String(a);
  const sb = String(b);
  const ta = Date.parse(sa);
  const tb = Date.parse(sb);
  if (!Number.isNaN(ta) && !Number.isNaN(tb) && /T/.test(sa) && /T/.test(sb)) return ta - tb;
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

export function createFakeSupabase(db: FakeDb) {
  const from = (table: string) => {
    const preds: Pred[] = [];
    const filters: Record<string, unknown> = {};
    let write: { op: Write['op']; rows: Row[] } | null = null;
    let single = false;
    let head = false;
    let wantCount = false;
    let orderArg: { col: string; asc: boolean } | null = null;
    let limitArg: number | null = null;
    let rangeArg: [number, number] | null = null;
    const chain: Record<string, unknown> = {};

    chain.select = (_arg?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.count) wantCount = true;
      if (opts?.head) head = true;
      return chain;
    };
    chain.order = (col: string, o?: { ascending?: boolean }) => { orderArg = { col, asc: o?.ascending !== false }; return chain; };
    chain.limit = (n: number) => { limitArg = n; return chain; };
    chain.range = (a: number, b: number) => { rangeArg = [a, b]; return chain; };
    chain.eq = (col: string, value: unknown) => { preds.push((r) => r[col] === value); filters[col] = value; return chain; };
    chain.neq = (col: string, value: unknown) => { preds.push((r) => r[col] !== value); return chain; };
    chain.in = (col: string, values: unknown[]) => { preds.push((r) => values.includes(r[col])); filters[`${col}__in`] = values; return chain; };
    chain.is = (col: string, value: unknown) => { preds.push((r) => (value === null ? r[col] == null : r[col] === value)); filters[`${col}__is`] = value; return chain; };
    chain.not = (col: string, op: string, value: unknown) => {
      if (op !== 'is') throw new Error(`not(${op}) no soportado en el doble`);
      preds.push((r) => (value === null ? r[col] != null : r[col] !== value));
      filters[`${col}__not_is`] = value;
      return chain;
    };
    chain.gt = (col: string, v: unknown) => { preds.push((r) => r[col] != null && cmp(r[col], v) > 0); filters[`${col}__gt`] = v; return chain; };
    chain.gte = (col: string, v: unknown) => { preds.push((r) => r[col] != null && cmp(r[col], v) >= 0); filters[`${col}__gte`] = v; return chain; };
    chain.lt = (col: string, v: unknown) => { preds.push((r) => r[col] != null && cmp(r[col], v) < 0); filters[`${col}__lt`] = v; return chain; };
    chain.lte = (col: string, v: unknown) => { preds.push((r) => r[col] != null && cmp(r[col], v) <= 0); filters[`${col}__lte`] = v; return chain; };
    chain.single = () => { single = true; return chain; };
    chain.maybeSingle = () => { single = true; return chain; };
    chain.insert = (row: Row | Row[]) => { write = { op: 'insert', rows: Array.isArray(row) ? row : [row] }; return chain; };
    chain.update = (row: Row) => { write = { op: 'update', rows: [row] }; return chain; };
    chain.delete = () => { write = { op: 'delete', rows: [] }; return chain; };

    chain.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
      try {
        tick(db);
        const all = (db.rows[table] ??= []);
        if (write) {
          if (write.op === 'insert') {
            for (const r of write.rows) {
              const idx = violatedIndex(db, table, all, r);
              if (idx) {
                db.rejected.push({ table, op: 'insert', rows: write.rows, filters, index: idx.name });
                resolve({ data: null, error: { code: '23505', message: `duplicate key value violates unique constraint "${idx.name}"` }, count: null });
                return;
              }
            }
          }
          db.writes.push({ table, op: write.op, rows: write.rows, filters });
          if (db.nextWriteError && db.nextWriteError.table === table) {
            const err = db.nextWriteError.error;
            db.nextWriteError = undefined;
            resolve({ data: null, error: err, count: null });
            return;
          }
          if (write.op === 'insert') {
            const created = write.rows.map((r) => ({ id: `${table}-${db.nextId++}`, ...r }));
            all.push(...created);
            resolve({ data: single ? created[0] : created, error: null, count: null });
            return;
          }
          const matched = all.filter((r) => preds.every((p) => p(r)));
          if (write.op === 'update') {
            for (const r of matched) Object.assign(r, write.rows[0]);
            resolve({ data: single ? matched[0] ?? null : matched, error: null, count: null });
            return;
          }
          for (const r of matched) all.splice(all.indexOf(r), 1);
          resolve({ data: null, error: null, count: null });
          return;
        }
        if (db.nextReadError && db.nextReadError.table === table) {
          const err = db.nextReadError.error;
          db.nextReadError = undefined;
          resolve({ data: null, error: err, count: null });
          return;
        }
        let data = all.filter((r) => preds.every((p) => p(r)));
        if (orderArg) {
          const { col, asc } = orderArg;
          data = [...data].sort((a, b) => (asc ? cmp(a[col], b[col]) : cmp(b[col], a[col])));
        }
        const count = wantCount ? data.length : null;
        if (rangeArg) data = data.slice(rangeArg[0], rangeArg[1] + 1);
        else if (limitArg != null) data = data.slice(0, limitArg);
        if (head) { resolve({ data: null, error: null, count }); return; }
        resolve({ data: single ? data[0] ?? null : data, error: null, count });
      } catch (e) {
        if (reject) reject(e); else throw e;
      }
    };
    return chain;
  };

  const rpc = async (fn: string, args: Record<string, unknown>) => {
    tick(db);
    db.rpcCalls.push({ fn, args });
    const handler = db.rpc?.[fn];
    if (!handler) return { data: null, error: { message: `rpc ${fn} no definida en el doble` } };
    try {
      return { data: handler(args), error: null };
    } catch (e) {
      return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
    }
  };

  const auth = { getUser: async () => ({ data: { user: { id: db.userId } }, error: null }) };
  return { from, rpc, auth };
}

export const writesTo = (db: FakeDb, table: string, op?: Write['op']) => db.writes.filter((w) => w.table === table && (!op || w.op === op));
