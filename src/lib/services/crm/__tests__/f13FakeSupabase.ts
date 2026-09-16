/**
 * F13 — doble de Supabase para las pruebas de contrato de rutas.
 *
 * Aplica de verdad `eq`, `in`, `gte`, `gt`, `lte`, `lt`, `or(ilike)` y `range`
 * sobre filas por tabla, soporta `{ count: 'exact', head: true }`, embebe
 * `stages(name)` en `opportunities`, y REGISTRA cada escritura con sus filtros.
 * Cada tabla lleva señuelos de otra organización (121): leer o escribir sin
 * `organization_id` cambia el payload y la prueba muere.
 */

export type Row = Record<string, unknown>;

export interface Write {
  table: string;
  op: 'insert' | 'update' | 'delete';
  row: Row | null;
  filters: Record<string, unknown>;
}

export interface FakeDb {
  rows: Record<string, Row[]>;
  writes: Write[];
  /** Simula un error de BD en la próxima escritura sobre esa tabla (p. ej. 23505). */
  nextWriteError?: { table: string; error: { code: string; message: string } };
  /** Simula un error de BD en la próxima LECTURA sobre esa tabla (ronda 2: los errores no son ceros). */
  nextReadError?: { table: string; error: { code: string; message: string } };
}

type Pred = (row: Row) => boolean;

function parseOr(expr: string): Pred {
  // `payee_name.ilike.%ana%,notes.ilike.%ana%`
  const parts = expr.split(',').map((p) => {
    const [col, op, ...rest] = p.split('.');
    const value = rest.join('.');
    if (op !== 'ilike') throw new Error(`or() no soportado en el doble: ${p}`);
    const needle = value.replace(/%/g, '').toLowerCase();
    return (row: Row) => String(row[col] ?? '').toLowerCase().includes(needle);
  });
  return (row) => parts.some((p) => p(row));
}

/** Compara como Postgres: instantes (con offset) por valor; el resto como texto. */
function cmp(a: unknown, b: string): number {
  const sa = String(a);
  const ta = Date.parse(sa);
  const tb = Date.parse(b);
  if (!Number.isNaN(ta) && !Number.isNaN(tb) && /T/.test(sa) && /T/.test(b)) return ta - tb;
  return sa < b ? -1 : sa > b ? 1 : 0;
}

export function createFakeSupabase(db: FakeDb) {
  const from = (table: string) => {
    const preds: Pred[] = [];
    const filters: Record<string, unknown> = {};
    let write: Write | null = null;
    let single = false;
    let head = false;
    let wantCount = false;
    let selectArg = '*';
    let rangeArg: [number, number] | null = null;
    let limitArg: number | null = null;
    const chain: Record<string, unknown> = {};

    chain.select = (arg?: string, opts?: { count?: string; head?: boolean }) => {
      if (arg) selectArg = arg;
      if (opts?.count) wantCount = true;
      if (opts?.head) head = true;
      return chain;
    };
    chain.order = () => chain;
    chain.limit = (n: number) => { limitArg = n; return chain; };
    chain.range = (a: number, b: number) => { rangeArg = [a, b]; return chain; };
    chain.eq = (col: string, value: unknown) => { preds.push((r) => r[col] === value); filters[col] = value; return chain; };
    chain.in = (col: string, values: unknown[]) => { preds.push((r) => values.includes(r[col])); filters[`${col}__in`] = values; return chain; };
    chain.gte = (col: string, value: string) => { preds.push((r) => r[col] != null && cmp(r[col], value) >= 0); filters[`${col}__gte`] = value; return chain; };
    chain.gt = (col: string, value: string) => { preds.push((r) => r[col] != null && cmp(r[col], value) > 0); return chain; };
    chain.lte = (col: string, value: string) => { preds.push((r) => r[col] != null && cmp(r[col], value) <= 0); filters[`${col}__lte`] = value; return chain; };
    chain.lt = (col: string, value: string) => { preds.push((r) => r[col] != null && cmp(r[col], value) < 0); filters[`${col}__lt`] = value; return chain; };
    chain.or = (expr: string) => { preds.push(parseOr(expr)); return chain; };
    chain.single = () => { single = true; return chain; };
    chain.maybeSingle = () => { single = true; return chain; };
    chain.insert = (row: Row) => { write = { table, op: 'insert', row, filters }; return chain; };
    chain.update = (row: Row) => { write = { table, op: 'update', row, filters }; return chain; };
    chain.delete = () => { write = { table, op: 'delete', row: null, filters }; return chain; };

    chain.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
      try {
        const all = db.rows[table] ?? [];
        if (write) {
          db.writes.push(write);
          if (db.nextWriteError && db.nextWriteError.table === table) {
            const err = db.nextWriteError.error;
            db.nextWriteError = undefined;
            resolve({ data: null, error: err, count: null });
            return;
          }
          const matched = all.filter((r) => preds.every((p) => p(r)));
          if (write.op === 'insert') {
            const created = { id: 'new', ...write.row };
            all.push(created);
            resolve({ data: single ? created : [created], error: null, count: null });
            return;
          }
          if (write.op === 'update') {
            for (const r of matched) Object.assign(r, write.row);
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
        const count = wantCount ? data.length : null;
        if (rangeArg) data = data.slice(rangeArg[0], rangeArg[1] + 1);
        else if (limitArg != null) data = data.slice(0, limitArg);
        if (table === 'opportunities' && selectArg.includes('stages(')) {
          data = data.map((r) => ({ ...r, stages: (db.rows.stages ?? []).find((s) => s.id === r.stage_id) ?? null }));
        }
        if (head) { resolve({ data: null, error: null, count }); return; }
        resolve({ data: single ? data[0] ?? null : data, error: null, count });
      } catch (e) {
        if (reject) reject(e); else throw e;
      }
    };
    return chain;
  };
  return { from };
}
