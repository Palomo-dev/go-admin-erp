/**
 * F13 — modelo puro del panel del vendedor. Sin I/O: el servicio trae filas y
 * este módulo las convierte en lo que pintan los widgets de `/app/inicio`.
 */

import { toPlainDate } from '@/lib/utils/dateDisplay';
import { STAGE_MANAGER_ROLE_IDS } from './stagePermissions';
import { groupByCurrency, resolvePrimaryCurrency } from './commissionTransitions';
import { isWithinPeriod, type QuotaPeriod } from './quotaProgress';

export interface QuotaLike {
  id: string;
  period: string;
  period_start: string;
  period_end: string;
  target_type: string;
}

const PERIOD_PRIORITY: Record<QuotaPeriod, number> = { monthly: 0, quarterly: 1, yearly: 2 };

/**
 * La cuota «vigente» del widget: la que cubre hoy, prefiriendo mensual >
 * trimestral > anual, y dentro del mismo periodo la de ingresos.
 */
export function pickCurrentQuota<T extends QuotaLike>(targets: readonly T[], today: string): T | null {
  const vigentes = targets.filter((t) => isWithinPeriod(today, t.period_start, t.period_end));
  if (vigentes.length === 0) return null;
  const sorted = [...vigentes].sort((a, b) => {
    const pa = PERIOD_PRIORITY[a.period as QuotaPeriod] ?? 9;
    const pb = PERIOD_PRIORITY[b.period as QuotaPeriod] ?? 9;
    if (pa !== pb) return pa - pb;
    const ra = a.target_type === 'revenue' ? 0 : 1;
    const rb = b.target_type === 'revenue' ? 0 : 1;
    return ra - rb;
  });
  return sorted[0];
}

/** Estado vacío honesto: sin cifras inventadas. */
export function quotaEmptyMessage(): string {
  return 'Sin cuota este mes — pídesela a tu administrador.';
}

export interface LeaderboardMember {
  user_id: string;
  name: string;
}

export interface WonRow {
  salesperson_id: string | null;
  amount: number | string | null;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  name: string;
  amount: number;
  deals: number;
  is_me: boolean;
}

/** Ranking del equipo por importe ganado en el periodo; solo miembros de la org. */
export function buildLeaderboard(won: readonly WonRow[], members: readonly LeaderboardMember[], meUserId: string): LeaderboardEntry[] {
  const totals = new Map<string, { amount: number; deals: number }>();
  for (const m of members) totals.set(m.user_id, { amount: 0, deals: 0 });
  for (const w of won) {
    if (!w.salesperson_id) continue;
    const t = totals.get(w.salesperson_id);
    if (!t) continue;
    t.amount += Number(w.amount) || 0;
    t.deals += 1;
  }
  return members
    .map((m) => ({ user_id: m.user_id, name: m.name, ...totals.get(m.user_id)! }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'es'))
    .map((e, i) => ({ rank: i + 1, user_id: e.user_id, name: e.name, amount: e.amount, deals: e.deals, is_me: e.user_id === meUserId }));
}

/** El ranking solo lo ven admin/manager: id de rol de la sesión, resuelto en servidor. */
export function canSeeLeaderboard(ctx: { roleId: number; isSuperAdmin?: boolean | null }): boolean {
  return ctx.isSuperAdmin === true || STAGE_MANAGER_ROLE_IDS.includes(ctx.roleId);
}

export interface MonthCommissionSummary {
  accrued: number;
  paid: number;
  total: number;
  count: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface MonthCommissionRow {
  status: string;
  commission_amount: number | string | null;
  currency?: string | null;
}

/** Resumen de UN bloque de una sola moneda (quien llama ya agrupó). */
export function summarizeMonthCommissions(rows: readonly MonthCommissionRow[]): MonthCommissionSummary {
  const s = { accrued: 0, paid: 0, total: 0, count: 0 };
  for (const r of rows) {
    const amount = Number(r.commission_amount) || 0;
    if (r.status === 'accrued') s.accrued += amount;
    else if (r.status === 'paid') s.paid += amount;
    else continue;
    s.count += 1;
  }
  s.accrued = round2(s.accrued);
  s.paid = round2(s.paid);
  s.total = round2(s.accrued + s.paid);
  return s;
}

export type MonthCurrencySummary = MonthCommissionSummary & { currency: string };

/**
 * Comisiones del mes POR MONEDA: la base como principal y las demás aparte
 * («+ 1 comisión en USD: 11.344,54»); nunca una suma cruzada.
 */
export function summarizeMonthCommissionsByCurrency(rows: readonly MonthCommissionRow[], baseCurrency: string | null): { primary: MonthCurrencySummary; others: MonthCurrencySummary[] } {
  const primaryCode = resolvePrimaryCurrency(rows, baseCurrency) ?? '';
  const groups = groupByCurrency(rows, primaryCode);
  const primary = { currency: primaryCode, ...summarizeMonthCommissions(groups.get(primaryCode) ?? []) };
  const others = Array.from(groups.entries())
    .filter(([code]) => code !== primaryCode)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([code, list]) => ({ currency: code, ...summarizeMonthCommissions(list) }));
  return { primary, others };
}

export function topOpenOpportunities<T extends { amount: number | string | null; status: string | null }>(opps: readonly T[], limit: number): T[] {
  return opps
    .filter((o) => o.status === 'open')
    .sort((a, b) => {
      const av = a.amount == null ? -Infinity : Number(a.amount);
      const bv = b.amount == null ? -Infinity : Number(b.amount);
      return bv - av;
    })
    .slice(0, limit);
}

const OPEN_TASK_STATUSES = new Set(['open', 'in_progress']);

/** Tareas abiertas que vencen el día calendario dado en la zona de la organización. */
export function tasksDueOn<T extends { due_date: string | null; status: string | null }>(tasks: readonly T[], day: string, timezone: string): T[] {
  return tasks.filter((t) => {
    if (!t.due_date || !OPEN_TASK_STATUSES.has(t.status ?? '')) return false;
    const d = new Date(t.due_date);
    return !Number.isNaN(d.getTime()) && toPlainDate(d, timezone) === day;
  });
}
