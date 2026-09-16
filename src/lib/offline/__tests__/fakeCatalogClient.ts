/**
 * Cliente Supabase falso para probar `catalogReplicator.ts`: un builder
 * encadenable que aplica `eq/in/is/order/range/limit` en memoria sobre
 * tablas dadas y registra cada petición (para comprobar la paginación).
 * Solo cubre lo que usa el replicador.
 */

type Row = Record<string, unknown>;

export interface FakeRequest {
  table: string;
  from?: number;
  to?: number;
}

export function createFakeCatalogClient(tables: Record<string, Row[]>, rpcs: Record<string, Row[]> = {}) {
  const requests: FakeRequest[] = [];

  function from(table: string) {
    let rows = [...(tables[table] ?? [])];
    let selectCols: string | null = null;
    const req: FakeRequest = { table };
    requests.push(req);
    const builder = {
      select(cols: string) {
        selectCols = cols;
        return builder;
      },
      eq(col: string, value: unknown) {
        rows = rows.filter((r) => r[col] === value);
        return builder;
      },
      in(col: string, values: unknown[]) {
        const set = new Set(values);
        rows = rows.filter((r) => set.has(r[col]));
        return builder;
      },
      is(col: string, value: unknown) {
        rows = rows.filter((r) => (value === null ? r[col] === null || r[col] === undefined : r[col] === value));
        return builder;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        const asc = opts?.ascending !== false;
        rows = [...rows].sort((a, b) => {
          const x = a[col] as string | number;
          const y = b[col] as string | number;
          if (x === y) return 0;
          return (x < y ? -1 : 1) * (asc ? 1 : -1);
        });
        return builder;
      },
      limit(n: number) {
        rows = rows.slice(0, n);
        return builder;
      },
      range(fromIdx: number, toIdx: number) {
        req.from = fromIdx;
        req.to = toIdx;
        rows = rows.slice(fromIdx, toIdx + 1);
        return builder;
      },
      then<T>(resolve: (v: { data: Row[]; error: null }) => T) {
        return Promise.resolve({ data: project(rows, selectCols), error: null }).then(resolve);
      },
    };
    return builder;
  }

  function rpc(fn: string) {
    requests.push({ table: `rpc:${fn}` });
    return Promise.resolve({ data: rpcs[fn] ?? [], error: null });
  }

  return { from, rpc, requests };
}

/** Proyección mínima: respeta la lista de columnas simples y el join `payment_methods!inner ( name )`. */
function project(rows: Row[], cols: string | null): Row[] {
  if (!cols || cols.trim() === '*') return rows.map((r) => ({ ...r }));
  const wanted = cols
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => c.split('!')[0].split(' ')[0]);
  return rows.map((r) => {
    const out: Row = {};
    for (const c of wanted) if (c in r) out[c] = r[c];
    return out;
  });
}
