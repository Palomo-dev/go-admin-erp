import type { SupabaseClient } from '@supabase/supabase-js';
import { sumarEnMonedaBase, type ResumenMonedaBase, type TasaCambio } from '@/components/crm/kit/monedaCrm';
import { plainDateToInstant, toPlainDate, resolverZonaHoraria } from '@/lib/utils/timezone';
import { F12Error } from './f12Errors';

/** Páginas inferiores al límite PostgREST; nunca se agrega una primera página incompleta. */
export async function readAllF12<T>(sb: SupabaseClient, table: string, select: string, org: number): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const r = await sb.from(table).select(select).eq('organization_id', org).order('id', { ascending: true }).range(offset, offset + 499);
    if (r.error) throw r.error;
    if (!Array.isArray(r.data)) throw new Error('Lectura incompleta de la red comercial');
    rows.push(...r.data as T[]);
    if (r.data.length < 500) return rows;
  }
}

export interface F12MoneyContext { base: string | null; rates: TasaCambio[]; date: string; timezone: string }
export async function readF12Money(org: number, sb: SupabaseClient, now: Date): Promise<F12MoneyContext> {
  const [currency, organization, calendar, rates] = await Promise.all([
    sb.rpc('fn_moneda_base_organizacion', { p_org: org }),
    sb.from('organizations').select('timezone').eq('id', org).maybeSingle(),
    sb.from('organization_settings').select('settings').eq('organization_id', org).eq('key', 'calendar').maybeSingle(),
    readAllF12<TasaCambio>(sb, 'exchange_rates', 'id, base_currency, target_currency, rate, effective_date', org),
  ]);
  if (currency.error) throw currency.error;
  if (organization.error) throw organization.error;
  if (calendar.error) throw calendar.error;
  const timezone = resolverZonaHoraria(organization.data?.timezone ?? calendar.data?.settings?.timezone, { donde: 'red-comercial', organizationId: org });
  const base = typeof currency.data === 'string' && /^[A-Z]{3}$/.test(currency.data.trim().toUpperCase()) ? currency.data.trim().toUpperCase() : null;
  return { base, rates, date: toPlainDate(now, timezone), timezone };
}

export interface F12Stats {
  period: 'month' | 'year'; start: string; end: string; timezone: string; base_currency: string | null;
  counts: Record<string, number>; currency_missing: boolean;
  commissions?: { pending: ResumenMonedaBase | null; paid: ResumenMonedaBase | null };
  rewards?: { pending: ResumenMonedaBase | null; paid: ResumenMonedaBase | null };
}
const one = <T>(x: T | T[] | null | undefined): T | null => Array.isArray(x) ? x[0] ?? null : x ?? null;
function periodBounds(period: 'month' | 'year', context: F12MoneyContext) {
  const year = Number(context.date.slice(0, 4)), month = Number(context.date.slice(5, 7));
  const startDay = period === 'month' ? `${year}-${String(month).padStart(2, '0')}-01` : `${year}-01-01`;
  const endDay = period === 'year' || month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return { start: plainDateToInstant(startDay, context.timezone, '00:00'), end: plainDateToInstant(endDay, context.timezone, '00:00') };
}
const within = (stamp: string | null | undefined, bounds: { start: string; end: string }) => !!stamp && Date.parse(stamp) >= Date.parse(bounds.start) && Date.parse(stamp) < Date.parse(bounds.end);
export function summarizeF12Money(items: Array<{ monto: unknown; moneda: string | null }>, c: F12MoneyContext): ResumenMonedaBase | null {
  if (!c.base || items.some(i => !i.moneda || !/^[A-Z]{3}$/.test(i.moneda) || i.monto == null || !Number.isFinite(Number(i.monto)))) return null;
  return sumarEnMonedaBase(items.map(i => ({ monto: Number(i.monto), moneda: i.moneda })), c.base, c.rates, c.date);
}
export async function referralStats(org: number, sb: SupabaseClient, period: 'month' | 'year' = 'month', now = new Date()): Promise<F12Stats> {
  type Row = { status: string; reward_paid: boolean; reward_paid_at: string | null; created_at: string; program: { reward_type: string; reward_amount: number } | null };
  const [c, rows] = await Promise.all([readF12Money(org, sb, now), readAllF12<Row>(sb, 'referrals', 'id,status,reward_paid,reward_paid_at,created_at,program:referral_programs(reward_type,reward_amount)', org)]);
  const bounds = periodBounds(period, c), current = rows.filter(r => within(r.created_at, bounds));
  const monetary = current.filter(r => r.status === 'converted' && ['cash', 'credit'].includes(one(r.program)?.reward_type ?? ''));
  const summary = (paid: boolean) => summarizeF12Money(monetary.filter(r => r.reward_paid === paid).map(r => ({ monto: one(r.program)!.reward_amount, moneda: c.base })), c);
  const pending = summary(false), paid = summary(true);
  return { period, ...bounds, timezone: c.timezone, base_currency: c.base,
    counts: { total: current.length, converted: current.filter(r => r.status === 'converted').length, pending: current.filter(r => r.status === 'pending').length, qualified: current.filter(r => r.status === 'qualified').length, reward_paid: current.filter(r => r.reward_paid).length },
    rewards: { pending, paid }, currency_missing: !pending || !paid || pending.sinTasa.length > 0 || paid.sinTasa.length > 0 };
}
export async function partnerNetworkStats(org: number, sb: SupabaseClient, period: 'month' | 'year' = 'year', now = new Date()): Promise<F12Stats> {
  type Deal = { commission_status: string; commission_amount: number | null; created_at: string; commission_paid_at: string | null; opportunity: { currency: string | null } | null };
  const [c, partners, deals] = await Promise.all([readF12Money(org, sb, now), readAllF12<{ is_active: boolean }>(sb, 'partners', 'id,is_active', org), readAllF12<Deal>(sb, 'partner_deals', 'id,commission_status,commission_amount,commission_paid_at,created_at,opportunity:opportunities(currency)', org)]);
  const bounds = periodBounds(period, c), current = deals.filter(r => within(r.created_at, bounds));
  const pendingRows = deals.filter(r => ['pending', 'approved'].includes(r.commission_status)), paidRows = deals.filter(r => r.commission_status === 'paid' && within(r.commission_paid_at, bounds));
  const summary = (rows: Deal[]) => summarizeF12Money(rows.map(r => ({ monto: r.commission_amount, moneda: one(r.opportunity)?.currency?.trim().toUpperCase() ?? null })), c);
  const pending = summary(pendingRows), paid = summary(paidRows);
  return { period, ...bounds, timezone: c.timezone, base_currency: c.base,
    counts: { total: partners.length, active: partners.filter(p => p.is_active).length, deals: current.filter(d => d.commission_status !== 'rejected').length, pending: pendingRows.length, paid: paidRows.length },
    commissions: { pending, paid }, currency_missing: !pending || !paid || pending.sinTasa.length > 0 || paid.sinTasa.length > 0 };
}
export function readF12Period(params: URLSearchParams, fallback: 'month' | 'year'): 'month' | 'year' {
  const p = params.get('period') ?? fallback;
  if (p !== 'month' && p !== 'year') throw new F12Error(400, 'VALIDATION', 'period debe ser month o year');
  return p;
}
