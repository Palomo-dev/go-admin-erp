/**
 * Cliente Supabase falso para probar `offlineReplicator.ts`: builder
 * encadenable que aplica `eq/filter/gte/gt/order/range` en memoria sobre
 * tablas dadas, resuelve los filtros por padre (`padre.organization_id`)
 * con un mapa de enlaces y registra cada petición.
 */

import { getTableManifest } from '../replicationManifest';

type Row = Record<string, unknown>;

export interface FakeOfflineRequest {
  table: string;
  select: string;
  filters: string[];
  from?: number;
  to?: number;
}

export interface FakeOfflineClientOptions {
  tables: Record<string, Row[]>;
  /** `hijo.padre` → columna del hijo que referencia al padre (por defecto, la FK del manifiesto). */
  links?: Record<string, string>;
  /** Error a devolver para una tabla (simula fallo de red o RLS). */
  failing?: Record<string, string>;
}

function cmp(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

export function createFakeOfflineClient({ tables, links = {}, failing = {} }: FakeOfflineClientOptions) {
  const requests: FakeOfflineRequest[] = [];

  /** Columna del hijo que apunta al padre, o `__inverse__:<col>` si es el padre quien apunta al hijo. */
  function linkOf(child: string, parent: string): string {
    const explicit = links[`${child}.${parent}`];
    if (explicit) return explicit;
    const fk = getTableManifest(child)?.fks.find((f) => f.table === parent);
    if (fk) return fk.column;
    const inverse = getTableManifest(parent)?.fks.find((f) => f.table === child);
    if (inverse) return `__inverse__:${inverse.column}`;
    throw new Error(`fake: sin enlace ${child}.${parent}`);
  }

  function from(table: string) {
    let rows = [...(tables[table] ?? [])];
    const req: FakeOfflineRequest = { table, select: '', filters: [] };
    requests.push(req);
    const orders: Array<{ col: string; asc: boolean }> = [];
    const builder = {
      select(cols: string) {
        req.select = cols;
        return builder;
      },
      eq(col: string, value: unknown) {
        req.filters.push(`${col}=eq.${String(value)}`);
        if (col.includes('.')) {
          const [parent, parentCol] = col.split('.');
          const link = linkOf(table, parent);
          const parents = (tables[parent] ?? []).filter((p) => p[parentCol] === value);
          if (link.startsWith('__inverse__:')) {
            const col = link.slice('__inverse__:'.length);
            const childIds = new Set(parents.map((p) => String(p[col])));
            rows = rows.filter((r) => childIds.has(String(r.id)));
          } else {
            const parentIds = new Set(parents.map((p) => String(p.id)));
            rows = rows.filter((r) => parentIds.has(String(r[link])));
          }
        } else {
          rows = rows.filter((r) => r[col] === value);
        }
        return builder;
      },
      filter(col: string, op: string, value: string) {
        req.filters.push(`${col}=${op}.${value}`);
        if (op === 'is' && value === 'null') rows = rows.filter((r) => r[col] === null || r[col] === undefined);
        else if (op === 'eq') rows = rows.filter((r) => String(r[col]) === value);
        else throw new Error(`fake: filter ${op} no soportado`);
        return builder;
      },
      gte(col: string, value: unknown) {
        req.filters.push(`${col}=gte.${String(value)}`);
        rows = rows.filter((r) => r[col] !== null && r[col] !== undefined && cmp(r[col], value) >= 0);
        return builder;
      },
      gt(col: string, value: unknown) {
        req.filters.push(`${col}=gt.${String(value)}`);
        rows = rows.filter((r) => r[col] !== null && r[col] !== undefined && cmp(r[col], value) > 0);
        return builder;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        orders.push({ col, asc: opts?.ascending !== false });
        return builder;
      },
      range(fromIdx: number, toIdx: number) {
        req.from = fromIdx;
        req.to = toIdx;
        const sorted = [...rows].sort((a, b) => {
          for (const o of orders) {
            const c = cmp(a[o.col], b[o.col]);
            if (c !== 0) return o.asc ? c : -c;
          }
          return 0;
        });
        const page = sorted.slice(fromIdx, toIdx + 1);
        if (failing[table]) return Promise.resolve({ data: null, error: { message: failing[table] } });
        return Promise.resolve({ data: project(page, req.select, table), error: null });
      },
    };
    return builder;
  }

  /** Proyección: columnas simples; el embed `padre!inner(col)` se devuelve como objeto. */
  function project(rows: Row[], cols: string, table: string): Row[] {
    const parts = cols.split(',').map((c) => c.trim()).filter(Boolean);
    return rows.map((r) => {
      const out: Row = {};
      for (const c of parts) {
        const m = /^([a-z_]+)!inner\(([a-z_]+)\)$/.exec(c);
        if (m) {
          const link = linkOf(table, m[1]);
          const parent = link.startsWith('__inverse__:')
            ? (tables[m[1]] ?? []).find((p) => String(p[link.slice('__inverse__:'.length)]) === String(r.id))
            : (tables[m[1]] ?? []).find((p) => String(p.id) === String(r[link]));
          out[m[1]] = parent ? { [m[2]]: parent[m[2]] } : null;
        } else {
          out[c] = c in r ? r[c] : null;
        }
      }
      return out;
    });
  }

  return { from, requests, tables };
}
