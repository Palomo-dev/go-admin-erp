/**
 * Tabla FALSA con estado para los tests de FASE-16.
 *
 * A diferencia de los dobles de `mockSupabase` («devuelve siempre lo mismo»),
 * esta evalúa DE VERDAD los filtros (`eq`, `neq`, `is`, `in`, `ilike`, `gt`,
 * `gte`, `lt`, `lte`, incluidos los operadores JSON `metadata->>campo`), el
 * `order` y el `limit`, y APLICA los `update` sobre las filas.
 *
 * Sin esto no hay prueba que muerda: si el doble de `customers` devuelve el
 * mismo cliente para CUALQUIER consulta, el camino rápido de
 * `findCustomerIdByPhone` siempre acierta y el `ilike` nunca se ejecuta; y si
 * el `update` no comprueba sus condiciones, quitar el desempate por
 * `claim_token` no pone nada en rojo (tester F16 r3 · N-7: 4 de 24 reversiones
 * quedaron en verde justamente por eso).
 */
import type { Op, Resp, TableResolver } from './mockSupabase';

export type Row = Record<string, unknown>;

/** Valor de una columna, admitiendo el operador JSON `metadata->>campo`. */
export function columnValue(row: Row, col: string): unknown {
  const i = col.indexOf('->>');
  if (i > 0) {
    const parent = row[col.slice(0, i)] as Record<string, unknown> | null | undefined;
    const v = parent?.[col.slice(i + 3)];
    // `->>` devuelve texto o NULL, nunca un booleano/número tipado.
    return v === undefined || v === null ? null : String(v);
  }
  return row[col] === undefined ? null : row[col];
}

function cmp(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function likeToRegExp(pattern: string): RegExp {
  const esc = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '[\\s\\S]*').replace(/_/g, '[\\s\\S]');
  return new RegExp(`^${esc}$`, 'i');
}

/** ¿La fila cumple TODOS los filtros aplicados a la consulta? */
export function rowPasses(row: Row, ops: Op[]): boolean {
  for (const o of ops) {
    const col = o.args[0] as string;
    const val = o.args[1];
    switch (o.method) {
      case 'eq':
        if (String(columnValue(row, col)) !== String(val)) return false;
        break;
      case 'neq':
        if (String(columnValue(row, col)) === String(val)) return false;
        break;
      case 'is': {
        const v = columnValue(row, col);
        if (val === null ? v !== null : v !== val) return false;
        break;
      }
      case 'in':
        if (!(val as unknown[]).some((x) => String(x) === String(columnValue(row, col)))) return false;
        break;
      case 'ilike':
        if (!likeToRegExp(String(val)).test(String(columnValue(row, col) ?? ''))) return false;
        break;
      case 'gt': if (!(cmp(columnValue(row, col), val) > 0)) return false; break;
      case 'gte': if (!(cmp(columnValue(row, col), val) >= 0)) return false; break;
      case 'lt': if (!(cmp(columnValue(row, col), val) < 0)) return false; break;
      case 'lte': if (!(cmp(columnValue(row, col), val) <= 0)) return false; break;
      default: break;
    }
  }
  return true;
}

export interface FakeTable {
  /** Filas vivas (mutadas por los `update`/`insert`/`delete`). */
  rows: Row[];
  resolver: TableResolver;
  /** Consultas de tipo SELECT recibidas (para aserciones sobre `order`, etc.). */
  selects: Op[][];
  updates: Op[][];
}

export interface FakeTableOptions {
  /** Reemplaza lo que ve un SELECT (p. ej. para simular una lectura ANTERIOR). */
  selectRows?: (live: Row[], call: number) => Row[];
  /** Fila devuelta por un INSERT (por defecto, la insertada con un id sintético). */
  onInsert?: (row: Row) => Row;
}

export function fakeTable(initial: Row[] = [], options: FakeTableOptions = {}): FakeTable {
  const rows: Row[] = initial.map((r) => ({ ...r }));
  const selects: Op[][] = [];
  const updates: Op[][] = [];
  let selectCalls = 0;

  const resolver: TableResolver = (ops) => {
    const single = ops.some((o) => o.method === 'maybeSingle' || o.method === 'single');
    const wrap = (list: Row[]): Resp => ({ data: single ? (list[0] ?? null) : list.map((r) => ({ ...r })) });

    const insert = ops.find((o) => o.method === 'insert' || o.method === 'upsert');
    if (insert) {
      const payload = insert.args[0];
      const list = (Array.isArray(payload) ? payload : [payload]) as Row[];
      const out = list.map((r) => {
        const row = { id: r.id ?? `fake-${rows.length + 1}`, ...r };
        rows.push(row);
        return options.onInsert ? options.onInsert(row) : row;
      });
      return wrap(out);
    }

    const update = ops.find((o) => o.method === 'update');
    if (update) {
      updates.push(ops);
      const patch = update.args[0] as Row;
      const hits = rows.filter((r) => rowPasses(r, ops));
      for (const r of hits) Object.assign(r, patch);
      return wrap(hits);
    }

    if (ops.some((o) => o.method === 'delete')) {
      const hits = rows.filter((r) => rowPasses(r, ops));
      for (const r of hits) rows.splice(rows.indexOf(r), 1);
      return wrap(hits);
    }

    selects.push(ops);
    selectCalls += 1;
    const source = options.selectRows ? options.selectRows(rows, selectCalls) : rows;
    let out = source.filter((r) => rowPasses(r, ops));
    const ord = ops.find((o) => o.method === 'order');
    if (ord) {
      const col = String(ord.args[0]);
      const asc = ((ord.args[1] as { ascending?: boolean } | undefined)?.ascending) !== false;
      out = [...out].sort((a, b) => cmp(columnValue(a, col), columnValue(b, col)) * (asc ? 1 : -1));
    }
    const lim = ops.find((o) => o.method === 'limit');
    if (lim) out = out.slice(0, Number(lim.args[0]));
    const count = ops.some((o) => o.method === 'select' && (o.args[1] as { count?: string } | undefined)?.count) ? out.length : undefined;
    return { ...wrap(out), ...(count === undefined ? {} : { count }) };
  };

  return { rows, resolver, selects, updates };
}
