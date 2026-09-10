/**
 * Timeline v2 — cursor `(occurred_at, id)`, rango de fechas y corte seguro de
 * página (FASE-09 §4.2, ronda 2).
 *
 * Reglas que implementa este módulo (defectos F9-02, F9-03, F9-06, F9-10):
 *
 * 1. **Comparación estricta compuesta**: la página siguiente pide
 *    `(col, id) < (cursor.at, cursor.id)`. Antes se usaba `lte(col, cursor.at)`
 *    (inclusivo): la fila del cursor volvía, consumía uno de los `limit + 1`
 *    y `next_cursor` se perdía con filas pendientes.
 * 2. **`col IS NULL` == epoch**: `notes.created_at`, `tasks.created_at`,
 *    `activities.occurred_at`, `messages.created_at` y
 *    `opportunity_stage_history.changed_at` son NULLABLE. Una fila con NULL es
 *    la más antigua posible; el filtro la incluye explícitamente (en SQL
 *    `NULL <= x` es NULL, no true, así que sin esto desaparecía al paginar).
 * 3. **Corte seguro por número de filas crudas**: si Postgres devolvió
 *    `limit + 1` filas, la fuente NO está agotada aunque el filtrado en memoria
 *    haya reducido la lista; hay que emitir `tail` igualmente — y la cola sale
 *    de las filas LEÍDAS, no de las supervivientes (F9-30, ronda 3).
 * 4. **Microsegundos** (F9-32, ronda 3): `timestamptz` tiene precisión de µs y
 *    el cursor los conserva; truncar a milisegundos perdía filas para siempre.
 */
import { canonicalTs, compareDesc, isBefore, type Ctx, type Raw, type SourceResult } from './types';

export const EPOCH_ISO = '1970-01-01T00:00:00.000Z';

/**
 * Orden estándar de todas las fuentes: `col DESC NULLS LAST, id DESC`.
 * `nullsFirst: false` es imprescindible: Postgres ordena NULLS FIRST en DESC y
 * las filas sin timestamp se comerían la primera página (F9-03/F9-10).
 */
export const DESC_NULLS_LAST = { ascending: false, nullsFirst: false } as const;
export const ID_DESC = { ascending: false } as const;

/**
 * Normaliza a ISO UTC (`…Z`): dentro de un `or=()` un `+HH:MM` es ambiguo.
 *
 * F9-32: conserva los MICROsegundos de `timestamptz`. Con `Date.parse` se
 * truncaban a milisegundos y el `col.lt.<at>` del cursor excluía para siempre
 * toda fila del mismo milisegundo con microsegundos menores.
 */
export function isoUtc(v: string): string {
  return canonicalTs(v);
}

/** Timestamp con fallback: una fila con NULL es la más antigua (epoch). */
export function atOr(v: string | null | undefined): string {
  return v ?? EPOCH_ISO;
}

/** Subconjunto de PostgrestFilterBuilder que usan las fuentes. */
export interface FilterableQuery {
  gte(col: string, v: string): FilterableQuery;
  lte(col: string, v: string): FilterableQuery;
  or(filter: string): FilterableQuery;
}

/**
 * Filtro `or=()` equivalente a `(col, id) < (at, id)` tratando NULL como epoch.
 * Si el cursor ya está en epoch, las filas NULL se desempatan por id.
 */
export function cursorFilter(col: string, cursor: { at: string; id: string }): string {
  const at = isoUtc(cursor.at);
  const parts = [`${col}.lt.${at}`, `and(${col}.eq.${at},id.lt.${cursor.id})`];
  parts.push(Date.parse(at) <= 0 ? `and(${col}.is.null,id.lt.${cursor.id})` : `${col}.is.null`);
  return parts.join(',');
}

/** `from`/`to` del filtro + cursor, coherentes con "NULL == epoch". */
export function applyRange<Q extends FilterableQuery>(query: Q, col: string, ctx: Ctx): Q {
  let qq: FilterableQuery = query;
  if (ctx.q.from) {
    const from = isoUtc(ctx.q.from);
    // NULL == epoch: solo entra en el rango si `from` no es posterior a epoch
    qq = Date.parse(from) <= 0 ? qq.or(`${col}.gte.${from},${col}.is.null`) : qq.gte(col, from);
  }
  if (ctx.q.to) {
    const to = isoUtc(ctx.q.to);
    qq = Date.parse(to) >= 0 ? qq.or(`${col}.lte.${to},${col}.is.null`) : qq.lte(col, to);
  }
  if (ctx.cursor) qq = qq.or(cursorFilter(col, ctx.cursor));
  return qq as Q;
}

/**
 * Ordena, aplica el desempate en memoria y calcula la cola segura (`tail`).
 *
 * @param rawCount filas devueltas por Postgres ANTES de filtrar en memoria.
 *   Si es `> limit` la fuente tiene más filas aunque `rows` haya quedado corto.
 * @param keep filtro en memoria que NO puede aplicarse en SQL (hoy: `channels`
 *   sobre las activities genéricas). Se aplica DESPUÉS de calcular la cola.
 *
 * F9-30 (ronda 3) — la cola se calcula sobre las filas **leídas**, no sobre las
 * supervivientes. Antes, si el filtro en memoria vaciaba la lista, `tail` era
 * `null` ("fuente agotada") y la paginación se detenía con filas pendientes: con
 * 31 visitas presenciales por encima de un correo, filtrar por correo devolvía
 * el timeline vacío. La cola correcta es la fila más antigua que se llegó a
 * leer: por encima de ella no queda nada sin ver, y por debajo hay que seguir.
 */
export function finish(
  rows: Raw[],
  ctx: Ctx,
  rawCount: number = rows.length,
  keep?: (r: Raw) => boolean
): SourceResult {
  let read = rows;
  if (ctx.cursor) read = read.filter((r) => isBefore(r, ctx.cursor!));
  read.sort(compareDesc);
  const list = keep ? read.filter(keep) : read;
  if (list.length > ctx.limit) {
    return { rows: list.slice(0, ctx.limit), tail: list[ctx.limit - 1] };
  }
  if (rawCount > ctx.limit && read.length > 0) {
    return { rows: list, tail: read[read.length - 1] };
  }
  return { rows: list, tail: null };
}

// ─── Día comercial (America/Bogota, UTC-5 sin DST) ───────────────────────────

const BOGOTA_OFFSET_MS = 5 * 3600 * 1000;

/** `yyyy-mm-dd` del día de Bogotá al que pertenece el instante. */
export function bogotaDay(iso: string): string {
  return new Date(Date.parse(iso) - BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Instante (ISO UTC) en que empieza el día de Bogotá al que pertenece `iso`. */
export function bogotaDayStart(iso: string): string {
  const local = new Date(Date.parse(iso) - BOGOTA_OFFSET_MS);
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(start + BOGOTA_OFFSET_MS).toISOString();
}

/** Instante (ISO UTC) en que empieza el día siguiente al de `iso` en Bogotá. */
export function bogotaNextDayStart(iso: string): string {
  const local = new Date(Date.parse(iso) - BOGOTA_OFFSET_MS);
  const next = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1);
  return new Date(next + BOGOTA_OFFSET_MS).toISOString();
}
