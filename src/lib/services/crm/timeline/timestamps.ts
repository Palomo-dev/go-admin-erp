/**
 * Timeline v2 — precisión de `timestamptz` (F9-32, ronda 3). Sin dependencias.
 */
/**
 * `timestamptz` de Postgres tiene precisión de MICROsegundos y PostgREST los
 * devuelve tal cual (`2026-09-09T04:47:31.804766+00:00`). `Date.parse` los
 * trunca a milisegundos: dos filas separadas por 456 µs pasaban a ser un empate
 * y el `lt` del cursor las excluía para siempre (F9-32).
 *
 * `canonicalTs` normaliza a UTC con SEIS dígitos de fracción
 * (`YYYY-MM-DDTHH:MM:SS.ffffffZ`), que es un formato de ancho fijo: comparar
 * esas cadenas lexicográficamente es exactamente el orden de Postgres.
 */
const TS_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|z|[+-]\d{2}:?\d{2})?$/;

/** Instante canónico usado cuando la cadena no es una marca válida. */
export const EPOCH_CANONICAL = '1970-01-01T00:00:00.000000Z';

const tsCache = new Map<string, string>();
const TS_CACHE_MAX = 4000;

export function canonicalTs(v: string): string {
  const cached = tsCache.get(v);
  if (cached !== undefined) return cached;
  const out = computeCanonicalTs(v);
  if (tsCache.size >= TS_CACHE_MAX) tsCache.clear();
  tsCache.set(v, out);
  return out;
}

function computeCanonicalTs(v: string): string {
  const m = TS_RE.exec(String(v).trim());
  if (!m) {
    const t = Date.parse(v);
    return Number.isNaN(t) ? EPOCH_CANONICAL : withMicros(new Date(t).toISOString(), '000');
  }
  // Postgres almacena como mucho 6 dígitos; el resto se descarta (no se redondea).
  const frac = (m[7] ?? '').padEnd(6, '0').slice(0, 6);
  // Sin desfase explícito se asume UTC (PostgREST siempre manda uno; una cadena
  // sin él en un fixture no debe depender de la zona horaria de la máquina).
  const base = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${frac.slice(0, 3)}${m[8] ?? 'Z'}`;
  const t = Date.parse(base);
  if (Number.isNaN(t)) return EPOCH_CANONICAL;
  return withMicros(new Date(t).toISOString(), frac.slice(3));
}

/** Inserta los 3 dígitos extra de microsegundos en un ISO de milisegundos. */
function withMicros(iso: string, extra: string): string {
  return iso.replace(/\.(\d{3})Z$/, `.$1${extra.padEnd(3, '0')}Z`);
}

/** -1 / 0 / 1 con la precisión completa de `timestamptz`. */
export function compareTs(a: string, b: string): number {
  const ca = canonicalTs(a);
  const cb = canonicalTs(b);
  return ca < cb ? -1 : ca > cb ? 1 : 0;
}

