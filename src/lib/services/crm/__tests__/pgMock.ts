/**
 * Mock fiel de PostgREST/Postgres para los tests del timeline (F9).
 *
 * Nace del mock adversario que dejó el tester en `timelineAdversarial.test.ts`
 * (ronda 1) y lo amplía con lo que el servicio usa ahora. Emula los puntos
 * donde el servicio puede fallar de verdad:
 *
 * - `lte/gte/lt/gt` sobre una columna NULL EXCLUYEN la fila (`NULL <= x` es
 *   NULL, no true).
 * - `order(col, {ascending:false})` pone NULLS FIRST salvo `nullsFirst:false`
 *   (comportamiento real de Postgres), y NULLS LAST en ascendente.
 * - `or('a.lt.x,and(b.eq.y,id.lt.z),c.is.null')` con anidamiento `and()`/`or()`.
 * - Los empates se pueden romper al revés del orden de inserción
 *   (`unstableTies`), porque sin `.order('id')` el plan no garantiza nada.
 * - Los filtros se aplican en el orden en que se encadenan y `limit` recorta
 *   AL FINAL, como hace PostgREST (no como una lista JS).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from '@supabase/supabase-js';
import { compareTs } from '../timeline/types';

export type Row = Record<string, any>;

export interface PgMockOptions {
  /** Rompe los empates al revés del orden de inserción (simula otro plan). */
  unstableTies?: boolean;
}

type Pred = (r: Row) => boolean;

/** Valor de `a.b.c` (embed de PostgREST) o `undefined` si no existe. */
function pick(r: Row, col: string): unknown {
  if (!col.includes('.')) return r[col];
  let cur: unknown = r;
  for (const part of col.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = Array.isArray(cur) ? (cur[0] as Row)?.[part] : (cur as Row)[part];
  }
  return cur;
}

const isTimestamp = (v: string) => /^\d{4}-\d{2}-\d{2}[T ]/.test(v);

/**
 * -1 / 0 / 1 con la misma semántica que Postgres para timestamps y texto.
 *
 * F9-40 (ronda 3): los timestamps se comparan con la precisión REAL de
 * `timestamptz` (microsegundos). Con `Date.parse` el simulador tenía resolución
 * de milisegundos, que es exactamente donde vivía el fallo del cursor (F9-32):
 * daba por buenas comparaciones que en Postgres no lo son.
 */
function cmpValues(a: unknown, b: unknown): number {
  const sa = String(a);
  const sb = String(b);
  if (isTimestamp(sa) && isTimestamp(sb)) return compareTs(sa, sb);
  return sa === sb ? 0 : sa < sb ? -1 : 1;
}

/** Igualdad de `contains` (`@>`): arrays y objetos jsonb. */
function containsValue(actual: unknown, expected: unknown): boolean {
  if (actual == null) return false;
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    return expected.every((e) => actual.some((a) => JSON.stringify(a) === JSON.stringify(e)));
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
    return Object.entries(expected as Record<string, unknown>).every(
      ([k, v]) => JSON.stringify((actual as Record<string, unknown>)[k]) === JSON.stringify(v)
    );
  }
  return Array.isArray(actual) ? actual.includes(expected) : false;
}

/**
 * Embeds `!inner` del `select` de PostgREST: `conversation:conversations!inner(…)`
 * o `pipelines!inner(…)`. Devuelve los alias que la fila DEBE traer poblados.
 */
const INNER_RE = /(?:([A-Za-z_]\w*)\s*:\s*)?([A-Za-z_]\w*)!inner\s*\(/g;

export function innerAliases(select: string): string[] {
  const out: string[] = [];
  for (const m of select.matchAll(INNER_RE)) out.push(m[1] ?? m[2]);
  return out;
}

/** Divide por comas de primer nivel (respeta paréntesis). */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function parseClause(clause: string): Pred {
  const c = clause.trim();
  if (c.startsWith('and(') && c.endsWith(')')) {
    const parts = splitTop(c.slice(4, -1)).map(parseClause);
    return (r) => parts.every((p) => p(r));
  }
  if (c.startsWith('or(') && c.endsWith(')')) {
    const parts = splitTop(c.slice(3, -1)).map(parseClause);
    return (r) => parts.some((p) => p(r));
  }
  const i1 = c.indexOf('.');
  const i2 = c.indexOf('.', i1 + 1);
  if (i1 < 0 || i2 < 0) return () => true;
  const col = c.slice(0, i1);
  const op = c.slice(i1 + 1, i2);
  const val = c.slice(i2 + 1);
  return (r) => {
    const v = pick(r, col);
    if (op === 'is') return val === 'null' ? v == null : String(v) === val;
    if (v == null) return false; // comparar con NULL nunca es true
    const cmp = cmpValues(v, val);
    switch (op) {
      case 'eq': return cmp === 0;
      case 'neq': return cmp !== 0;
      case 'lt': return cmp < 0;
      case 'lte': return cmp <= 0;
      case 'gt': return cmp > 0;
      case 'gte': return cmp >= 0;
      default: return true;
    }
  };
}

export function createPgMock(
  tables: Record<string, Row[]>,
  log: string[] = [],
  opts: PgMockOptions = {}
): SupabaseClient {
  const from = (table: string) => {
    log.push(table);
    let rows = [...(tables[table] ?? [])];
    let single = false;
    /** Payload de `update()`: se aplica a las filas que sobreviven a los filtros. */
    let pendingUpdate: Row | null = null;
    const orders: Array<{ col: string; asc: boolean; nullsFirst: boolean }> = [];
    const builder: Row = {
      // F9-40: `!inner` filtra de verdad. En Postgres un join interno descarta
      // la fila sin pareja; el mock antiguo ignoraba el argumento de `select`,
      // así que ni el `conversations!inner` de WhatsApp ni el `pipelines!inner`
      // del cambio de etapa se probaban nunca.
      select: (cols?: unknown) => {
        if (typeof cols === 'string') {
          for (const alias of innerAliases(cols)) {
            rows = rows.filter((r) => {
              const v = pick(r, alias);
              return Array.isArray(v) ? v.length > 0 : v != null;
            });
          }
        }
        return builder;
      },
      // F9-40: una columna ausente (o NULL) NO casa, igual que en Postgres.
      // Antes se daban por buenas y ningún test del timeline comprobaba de
      // verdad el aislamiento entre organizaciones.
      eq: (col: string, v: unknown) => {
        rows = rows.filter((r) => {
          const val = pick(r, col);
          return val == null ? false : val === v;
        });
        return builder;
      },
      in: (col: string, list: unknown[]) => {
        rows = rows.filter((r) => { const v = pick(r, col); return v != null && list.includes(v); });
        return builder;
      },
      contains: (col: string, v: unknown) => { rows = rows.filter((r) => containsValue(pick(r, col), v)); return builder; },
      lte: (col: string, v: string) => { rows = rows.filter((r) => r[col] != null && cmpValues(r[col], v) <= 0); return builder; },
      gte: (col: string, v: string) => { rows = rows.filter((r) => r[col] != null && cmpValues(r[col], v) >= 0); return builder; },
      lt: (col: string, v: string) => { rows = rows.filter((r) => r[col] != null && cmpValues(r[col], v) < 0); return builder; },
      gt: (col: string, v: string) => { rows = rows.filter((r) => r[col] != null && cmpValues(r[col], v) > 0); return builder; },
      or: (filter: string) => { const p = parseClause(`or(${filter})`); rows = rows.filter(p); return builder; },
      order: (col: string, o?: { ascending?: boolean; nullsFirst?: boolean }) => {
        const asc = o?.ascending !== false;
        orders.push({ col, asc, nullsFirst: o?.nullsFirst ?? !asc });
        return builder;
      },
      limit: (n: number) => {
        const idx = new Map(rows.map((r, i) => [r, i] as const));
        rows.sort((a, b) => {
          for (const { col, asc, nullsFirst } of orders) {
            const va = pick(a, col);
            const vb = pick(b, col);
            if (va == null && vb == null) continue;
            if (va == null) return nullsFirst ? -1 : 1;
            if (vb == null) return nullsFirst ? 1 : -1;
            const cmp = cmpValues(va, vb);
            if (cmp !== 0) return asc ? cmp : -cmp;
          }
          return opts.unstableTies ? (idx.get(b)! - idx.get(a)!) : (idx.get(a)! - idx.get(b)!);
        });
        rows = rows.slice(0, n);
        return builder;
      },
      // UPDATE con los mismos filtros que un SELECT: si ninguno casa (guarda
      // optimista perdida) devuelve `data: null`, como PostgREST.
      update: (payload: Row) => { pendingUpdate = { ...payload }; return builder; },
      maybeSingle: () => { single = true; return builder; },
      single: () => { single = true; return builder; },
      then: (resolve: (v: unknown) => void) => {
        if (pendingUpdate) for (const r of rows) Object.assign(r, pendingUpdate);
        resolve({ data: single ? rows[0] ?? null : rows, error: null });
      },
    };
    return builder;
  };
  return { from } as unknown as SupabaseClient;
}
