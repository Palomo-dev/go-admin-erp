/**
 * F14 — tarjetas KPI rápidas (`/api/crm/revenue/kpis`).
 *
 * «Mes en curso» y «semana en curso» se cortan en la zona horaria de la
 * organización: el día de hoy sale de `todayInTz(tz)` y los límites se
 * convierten a instantes con offset con `plainDateToInstant` (antes se usaba
 * `new Date(...).toISOString()` en la zona del servidor, que en Vercel es UTC:
 * un pago de las 22:00 del 31 en Bogotá contaba como del mes siguiente).
 *
 * Errores de lectura: se lanzan (`RevenueOsError`), no se tapan con 0.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { plainDateToInstant, todayInTz } from '@/lib/utils/dateDisplay';
import { RevenueOsError } from './rpc';

export interface KpiCard {
  pipeline_value: number;
  revenue_this_month: number;
  /** % 0–100; null si no hay cierres. */
  win_rate: number | null;
  open_deals: number;
  calls_this_week: number;
  emails_this_week: number;
  period: { today: string; month_start: string; week_start: string; timezone: string };
}

/** Lunes de la semana del día dado (YYYY-MM-DD), sin zonas: aritmética de calendario. */
export function weekStartPlain(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d);
  const dow = new Date(utc).getUTCDay(); // 0 = domingo
  const back = dow === 0 ? 6 : dow - 1;
  const monday = new Date(utc - back * 86_400_000);
  return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`;
}

type Raw = Record<string, unknown>;

function sumAmount(rows: Raw[] | null): number {
  return (rows ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
}

async function countRows(supabase: SupabaseClient, table: string, orgId: number, sinceCol: string, since: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .gte(sinceCol, since);
  if (error) throw new RevenueOsError(`${table}: ${error.message}`);
  return count ?? 0;
}

export async function getKpiCards(orgId: number, timezone: string, supabase: SupabaseClient): Promise<KpiCard> {
  const today = todayInTz(timezone);
  const monthStart = plainDateToInstant(`${today.slice(0, 7)}-01`, timezone);
  const weekStart = plainDateToInstant(weekStartPlain(today), timezone);

  const { data: openOpps, error: oppError } = await supabase.from('opportunities').select('amount').eq('organization_id', orgId).eq('status', 'open');
  if (oppError) throw new RevenueOsError(`opportunities: ${oppError.message}`);

  const { data: payments, error: payError } = await supabase
    .from('payments')
    .select('amount')
    .eq('organization_id', orgId)
    .eq('status', 'completed')
    .gte('payment_date', monthStart);
  if (payError) throw new RevenueOsError(`payments: ${payError.message}`);

  const [won, lost] = await Promise.all(
    (['won', 'lost'] as const).map(async (status) => {
      const { count, error } = await supabase.from('opportunities').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', status);
      if (error) throw new RevenueOsError(`opportunities: ${error.message}`);
      return count ?? 0;
    }),
  );
  const closed = won + lost;

  const [calls, emails] = await Promise.all([
    countRows(supabase, 'calls', orgId, 'created_at', weekStart),
    countRows(supabase, 'email_messages', orgId, 'created_at', weekStart),
  ]);

  return {
    pipeline_value: Math.round(sumAmount(openOpps as Raw[] | null)),
    revenue_this_month: Math.round(sumAmount(payments as Raw[] | null)),
    win_rate: closed > 0 ? Math.round((won / closed) * 1000) / 10 : null,
    open_deals: (openOpps ?? []).length,
    calls_this_week: calls,
    emails_this_week: emails,
    period: { today, month_start: monthStart, week_start: weekStart, timezone },
  };
}
