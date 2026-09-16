/**
 * Consumo del mes de IA y comunicaciones — SOLO SERVIDOR (service client).
 *
 * Lo consumen `GET /api/crm/config/credits` (panel Créditos) y
 * `aiCostService.chargeAiCredits` (presupuesto mensual, §8). Antes cada uno
 * traía hasta 5 000 filas y sumaba en Node; una org con auto-respuesta activa
 * supera esa cifra al mes y el total quedaba truncado en silencio (QA r1,
 * medio 11). Ahora agrega en SQL con `fn_ai_usage_month` /
 * `fn_comm_usage_month` (migración crm_v4_f00_39) y el día calendario se
 * corta en la zona horaria de la organización (reglas de fechas 3 y 6).
 *
 * Camino de respaldo: mientras la migración 39 no esté aplicada (PostgREST
 * responde "function not found"), se agrega en Node leyendo la columna
 * `cost_amount` con `coalesce` sobre `metadata.cost_amount`, y se marca
 * `truncated: true` si se alcanzó el tope de filas. Es transitorio: cuando la
 * 39 esté en producción, este respaldo se elimina.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { todayInTz, toPlainDate, plainDateToInstant } from '@/lib/utils/dateDisplay';

export interface AiUsageByModel {
  model: string;
  credits: number;
  cost_usd: number;
  tokens: number;
  calls: number;
}
export interface AiUsageByDay {
  day: string;
  credits: number;
  cost_usd: number;
}
export interface AiUsageMonth {
  spent_usd: number;
  spent_credits: number;
  rows: number;
  by_model: AiUsageByModel[];
  by_day: AiUsageByDay[];
  /** true solo en el camino de respaldo cuando se alcanzó el tope de filas. */
  truncated: boolean;
  source: 'rpc' | 'fallback';
}

export interface CommUsageByChannel {
  channel: string;
  credits: number;
  cost_usd: number;
  count: number;
}
export interface CommUsageMonth {
  spent_usd: number;
  rows: number;
  by_channel: CommUsageByChannel[];
  truncated: boolean;
  source: 'rpc' | 'fallback';
}

/** Tope del camino de respaldo (solo hasta aplicar la migración 39). */
export const FALLBACK_ROW_LIMIT = 10_000;

/**
 * Instante (ISO con offset) del primer día del mes en curso en la zona
 * horaria de la organización. Nunca `setUTCDate(1)`: para una org en Bogotá
 * los consumos de las 19:00–24:00 del último día caerían en el mes siguiente.
 */
export function monthStartInTz(tz: string, now: Date = new Date()): string {
  const today = toPlainDate(now, tz) || todayInTz(tz);
  return plainDateToInstant(`${today.slice(0, 7)}-01`, tz);
}

/** `metadata.cost_amount` numérico y finito, o 0. */
function metaCost(meta: Record<string, unknown> | null | undefined): number {
  const v = meta?.cost_amount;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** `coalesce(cost_amount, metadata.cost_amount, 0)` en Node. */
export function rowCostUsd(row: { cost_amount?: number | string | null; metadata?: Record<string, unknown> | null }): number {
  if (row.cost_amount != null) {
    const n = Number(row.cost_amount);
    if (Number.isFinite(n)) return n;
  }
  return metaCost(row.metadata);
}

/** PostgREST: la función no existe todavía (migración sin aplicar). */
export function isMissingFunctionError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === 'PGRST202' || error.code === '42883') return true;
  return /could not find the function|function .* does not exist/i.test(error.message ?? '');
}

/**
 * Postgres no reconoce la zona horaria (`22023 time zone "X" not recognized`).
 * Intl (ICU) y `pg_timezone_names` no comparten catálogo: una zona válida
 * para Node puede no serlo para la BD. Con la migración 39 editada en r3 la
 * RPC ya la resuelve a UTC por sí misma; esta detección cubre la versión
 * anterior de la función y cualquier otra RPC que reciba `p_tz`.
 */
export function isUnknownTimeZoneError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '22023') return /time zone/i.test(error.message ?? '') || !error.message;
  return /time zone ".*" not recognized/i.test(error.message ?? '');
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function getAiUsageMonth(sb: SupabaseClient, orgId: number, since: string, tz: string): Promise<AiUsageMonth> {
  let { data, error } = await sb.rpc('fn_ai_usage_month', { p_org: orgId, p_since: since, p_tz: tz });
  if (error && tz !== 'UTC' && isUnknownTimeZoneError(error)) {
    // QA r2 medio 2: nunca 500 por una zona que Postgres no reconozca. Un solo
    // reintento con UTC; `since` ya viene calculado en la zona de la org.
    console.warn(`[aiUsageStats] Postgres no reconoce la zona "${tz}" (org ${orgId}); reintento con UTC`);
    ({ data, error } = await sb.rpc('fn_ai_usage_month', { p_org: orgId, p_since: since, p_tz: 'UTC' }));
  }
  if (!error && data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    const byModel = Array.isArray(d.by_model) ? (d.by_model as Record<string, unknown>[]) : [];
    const byDay = Array.isArray(d.by_day) ? (d.by_day as Record<string, unknown>[]) : [];
    return {
      spent_usd: num(d.spent_usd),
      spent_credits: num(d.spent_credits),
      rows: num(d.rows),
      by_model: byModel.map((m) => ({ model: String(m.model ?? 'desconocido'), credits: num(m.credits), cost_usd: num(m.cost_usd), tokens: num(m.tokens), calls: num(m.calls) })),
      by_day: byDay.map((x) => ({ day: String(x.day), credits: num(x.credits), cost_usd: num(x.cost_usd) })),
      truncated: false,
      source: 'rpc',
    };
  }
  if (error && !isMissingFunctionError(error)) {
    throw new Error(`fn_ai_usage_month falló: ${error.message}`);
  }
  return aiUsageFallback(sb, orgId, since, tz);
}

interface AiLogRow {
  model: string | null;
  credits_consumed: number | null;
  total_tokens: number | null;
  cost_amount: number | string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

async function aiUsageFallback(sb: SupabaseClient, orgId: number, since: string, tz: string): Promise<AiUsageMonth> {
  const { data, error } = await sb
    .from('ai_usage_logs')
    .select('model, credits_consumed, total_tokens, cost_amount, metadata, created_at')
    .eq('organization_id', orgId)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(FALLBACK_ROW_LIMIT);
  if (error) throw new Error(`ai_usage_logs: ${error.message}`);
  const rows = (data ?? []) as AiLogRow[];

  const byModel = new Map<string, AiUsageByModel>();
  const byDay = new Map<string, AiUsageByDay>();
  let credits = 0;
  let usd = 0;
  for (const r of rows) {
    const c = r.credits_consumed ?? 0;
    const u = rowCostUsd(r);
    credits += c;
    usd += u;
    const m = r.model || 'desconocido';
    const cur = byModel.get(m) ?? { model: m, credits: 0, cost_usd: 0, tokens: 0, calls: 0 };
    cur.credits += c;
    cur.cost_usd += u;
    cur.tokens += r.total_tokens ?? 0;
    // Solo los cobros cuentan como llamadas: reembolsos (<0) y `:refund_failed` (0) no.
    if (c > 0) cur.calls += 1;
    byModel.set(m, cur);
    // Regla 2: nunca `.slice(0, 10)` sobre un timestamptz; día en la zona de la org.
    const day = toPlainDate(new Date(r.created_at), tz);
    const d = byDay.get(day) ?? { day, credits: 0, cost_usd: 0 };
    d.credits += c;
    d.cost_usd += u;
    byDay.set(day, d);
  }
  return {
    spent_usd: usd,
    spent_credits: credits,
    rows: rows.length,
    by_model: [...byModel.values()].sort((a, b) => b.credits - a.credits),
    by_day: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
    truncated: rows.length >= FALLBACK_ROW_LIMIT,
    source: 'fallback',
  };
}

export async function getCommUsageMonth(sb: SupabaseClient, orgId: number, since: string): Promise<CommUsageMonth> {
  const { data, error } = await sb.rpc('fn_comm_usage_month', { p_org: orgId, p_since: since });
  if (!error && data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    const byChannel = Array.isArray(d.by_channel) ? (d.by_channel as Record<string, unknown>[]) : [];
    return {
      spent_usd: num(d.spent_usd),
      rows: num(d.rows),
      by_channel: byChannel.map((c) => ({ channel: String(c.channel), credits: num(c.credits), cost_usd: num(c.cost_usd), count: num(c.count) })),
      truncated: false,
      source: 'rpc',
    };
  }
  if (error && !isMissingFunctionError(error)) {
    throw new Error(`fn_comm_usage_month falló: ${error.message}`);
  }
  return commUsageFallback(sb, orgId, since);
}

interface CommLogRow {
  channel: string;
  credits_used: number | null;
  cost_amount: number | string | null;
  metadata: Record<string, unknown> | null;
}

async function commUsageFallback(sb: SupabaseClient, orgId: number, since: string): Promise<CommUsageMonth> {
  const { data, error } = await sb
    .from('comm_usage_logs')
    .select('channel, credits_used, cost_amount, metadata')
    .eq('organization_id', orgId)
    .gte('created_at', since)
    .limit(FALLBACK_ROW_LIMIT);
  if (error) throw new Error(`comm_usage_logs: ${error.message}`);
  const rows = (data ?? []) as CommLogRow[];
  const byChannel = new Map<string, CommUsageByChannel>();
  let usd = 0;
  for (const r of rows) {
    const u = rowCostUsd(r);
    usd += u;
    const c = byChannel.get(r.channel) ?? { channel: r.channel, credits: 0, cost_usd: 0, count: 0 };
    c.credits += r.credits_used ?? 0;
    c.cost_usd += u;
    c.count += 1;
    byChannel.set(r.channel, c);
  }
  return {
    spent_usd: usd,
    rows: rows.length,
    by_channel: [...byChannel.values()].sort((a, b) => a.channel.localeCompare(b.channel)),
    truncated: rows.length >= FALLBACK_ROW_LIMIT,
    source: 'fallback',
  };
}
