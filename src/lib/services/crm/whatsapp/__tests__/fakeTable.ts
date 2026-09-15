/**
 * Tabla FALSA con estado para los tests de FASE-16.
 *
 * A diferencia de los dobles de `mockSupabase` («devuelve siempre lo mismo»),
 * esta evalúa DE VERDAD los filtros (`eq`, `neq`, `is`, `in`, `ilike`, `or`,
 * `filter(…, 'match'|'imatch', …)`, `gt`, `gte`, `lt`, `lte`, incluidos los
 * operadores JSON `metadata->>campo`), los `order` (varios, en cadena) y el
 * `limit`, y APLICA los `update` sobre las filas.
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

/**
 * Divide un `.or('a.eq.1,b.in.(x,y)')` de PostgREST en sus condiciones,
 * respetando los paréntesis de `in.(…)`.
 */
function splitOr(filters: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of filters) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Evalúa UNA condición `col.op.val` de un `.or()`. Solo los operadores que
 * usa el código bajo prueba (`in`, `is`, `eq`, `neq`); cualquier otro se
 * rechaza para que un `.or()` no soportado no pase en silencio.
 */
function orConditionPasses(row: Row, cond: string): boolean {
  // El nombre de columna puede llevar `->>`; el operador es el primer segmento
  // tras el ÚLTIMO `.` antes del valor: `metadata->>state.in.(a,b)`.
  const m = /^(.+?)\.(in|is|eq|neq)\.(.*)$/.exec(cond.trim());
  if (!m) throw new Error(`fakeTable: condición .or() no soportada: "${cond}"`);
  const [, col, op, raw] = m;
  const v = columnValue(row, col);
  switch (op) {
    case 'in': {
      const list = raw.replace(/^\(|\)$/g, '').split(',').map((x) => x.trim().replace(/^"|"$/g, ''));
      return v !== null && list.some((x) => x === String(v));
    }
    case 'is':
      if (raw === 'null') return v === null;
      return String(v) === raw;
    case 'eq': return v !== null && String(v) === raw;
    case 'neq': return v !== null && String(v) !== raw;
    default: return false;
  }
}

/** ¿La fila cumple TODOS los filtros aplicados a la consulta? */
export function rowPasses(row: Row, ops: Op[]): boolean {
  for (const o of ops) {
    const col = o.args[0] as string;
    const val = o.args[1];
    switch (o.method) {
      case 'or':
        if (!splitOr(String(col)).some((c) => orConditionPasses(row, c))) return false;
        break;
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
      case 'filter': {
        // `.filter(col, op, val)`: solo los operadores de expresión regular de
        // PostgREST (`match` = `~`, `imatch` = `~*`), que son los que usa el
        // prefiltro de `findCustomerIdByPhone`. Cualquier otro LANZA (tester
        // F16 r5 · N-5): antes se ignoraba en silencio y una consulta con
        // `filter('phone', 'ilike', …)` habría pasado como si filtrara.
        const op = String(o.args[1]);
        const pat = String(o.args[2]);
        if (op !== 'match' && op !== 'imatch') throw new Error(`fakeTable: operador de .filter() no soportado: "${op}"`);
        if (!new RegExp(pat, op === 'imatch' ? 'i' : '').test(String(columnValue(row, col) ?? ''))) return false;
        break;
      }
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
    // Varios `.order()` encadenados = ORDER BY a, b, …: el segundo solo decide
    // cuando el primero empata.
    const ords = ops.filter((o) => o.method === 'order');
    if (ords.length) {
      out = [...out].sort((a, b) => {
        for (const ord of ords) {
          const col = String(ord.args[0]);
          const asc = ((ord.args[1] as { ascending?: boolean } | undefined)?.ascending) !== false;
          const c = cmp(columnValue(a, col), columnValue(b, col)) * (asc ? 1 : -1);
          if (c !== 0) return c;
        }
        return 0;
      });
    }
    const lim = ops.find((o) => o.method === 'limit');
    if (lim) out = out.slice(0, Number(lim.args[0]));
    const count = ops.some((o) => o.method === 'select' && (o.args[1] as { count?: string } | undefined)?.count) ? out.length : undefined;
    return { ...wrap(out), ...(count === undefined ? {} : { count }) };
  };

  return { rows, resolver, selects, updates };
}
