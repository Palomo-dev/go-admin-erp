/**
 * F13 — modelos puros de los widgets del vendedor (`/app/inicio`): convierten
 * la respuesta de `GET /api/crm/seller-dashboard` en textos y números listos
 * para pintar. Sin React ni I/O; probados en `__tests__/f13Widgets.test.ts`.
 */

import { QUOTA_TYPE_LABELS, quotaStatusLabel, type QuotaStatus, type QuotaType } from '@/lib/services/crm/quotaProgress';
import { quotaEmptyMessage, type LeaderboardEntry, type MonthCommissionSummary, type MonthCurrencySummary } from '@/lib/services/crm/sellerDashboardModel';
import { pluralComisiones } from '@/components/finanzas/comisiones/comisionesModel';
import type { SellerDashboard, SellerOpportunity, SellerTask } from '@/lib/services/crm/sellerDashboardService';
import { periodLabelFor } from '@/components/organization/quotas/quotaForm';
import { formatCurrency } from '@/utils/Utils';

const COUNT_UNITS: Record<string, string> = { deals: 'negocios', activities: 'actividades', calls: 'llamadas' };

export function formatQuotaAmount(type: string, value: number, currency: string, withUnit = false): string {
  if (type === 'revenue') return formatCurrency(value, currency);
  const n = `${Math.round(value)}`;
  return withUnit ? `${n} ${COUNT_UNITS[type] ?? ''}`.trim() : n;
}

export type QuotaWidgetModel =
  | { kind: 'empty'; message: string }
  | {
      kind: 'quota';
      title: string;
      typeLabel: string;
      pct: number;
      status: QuotaStatus;
      statusLabel: string;
      achievedLabel: string;
      targetLabel: string;
      detail: string;
      ariaLabel: string;
    };

export function quotaWidgetModel(quota: SellerDashboard['quota'], orgCurrency: string): QuotaWidgetModel {
  if (!quota) return { kind: 'empty', message: quotaEmptyMessage() };
  const { target, progress } = quota;
  const currency = target.target_currency || orgCurrency;
  const type = target.target_type;
  const achievedLabel = formatQuotaAmount(type, target.achieved_amount, currency);
  const targetLabel = formatQuotaAmount(type, Number(target.target_amount), currency, true);
  const remaining = formatQuotaAmount(type, progress.remaining, currency);
  const pace = formatQuotaAmount(type, progress.needed_per_day, currency);
  let detail: string;
  if (progress.status === 'cumplida') detail = `Cuota superada. ${progress.days_remaining} día${progress.days_remaining === 1 ? '' : 's'} restante${progress.days_remaining === 1 ? '' : 's'}.`;
  else if (progress.days_remaining === 0) detail = `Periodo cerrado: faltaron ${remaining}.`;
  else detail = `Faltan ${remaining} · ${progress.days_remaining} día${progress.days_remaining === 1 ? '' : 's'} · necesitas ${pace}/día`;
  return {
    kind: 'quota',
    title: `Cuota de ${periodLabelFor(target.period, target.period_start, target.period_end)}`,
    typeLabel: QUOTA_TYPE_LABELS[type as QuotaType] ?? type,
    pct: progress.pct,
    status: progress.status,
    statusLabel: quotaStatusLabel(progress.status),
    achievedLabel,
    targetLabel,
    detail,
    ariaLabel: `${progress.pct} % de la cuota, ${quotaStatusLabel(progress.status).toLowerCase()}`,
  };
}

export type CommissionsWidgetModel =
  | { kind: 'empty'; message: string }
  | { kind: 'data'; accruedLabel: string; paidLabel: string; pendingLabel: string; totalLabel: string; paidPct: number; count: number; otherLines: string[] };

/**
 * Cifras SOLO de la moneda base; cada otra moneda es una línea aparte
 * («+ 1 comisión en USD: 11.344,54»). Nunca se suman monedas distintas.
 */
export function commissionsWidgetModel(c: MonthCommissionSummary, currency: string, others: readonly MonthCurrencySummary[] = []): CommissionsWidgetModel {
  const otherLines = others
    .filter((o) => o.count > 0)
    .map((o) => `+ ${pluralComisiones(o.count)} en ${o.currency}: ${formatCurrency(o.total, o.currency)}`);
  if (c.count === 0 && otherLines.length === 0) return { kind: 'empty', message: 'Sin comisiones devengadas este mes.' };
  return {
    kind: 'data',
    accruedLabel: formatCurrency(c.total, currency),
    paidLabel: formatCurrency(c.paid, currency),
    pendingLabel: formatCurrency(c.accrued, currency),
    totalLabel: formatCurrency(c.total, currency),
    paidPct: c.total > 0 ? Math.round((c.paid / c.total) * 100) : 0,
    count: c.count,
    otherLines,
  };
}

export type LeaderboardWidgetModel =
  | { kind: 'hidden' }
  | { kind: 'empty'; message: string }
  | { kind: 'data'; top: Array<LeaderboardEntry & { amountLabel: string }>; me: (LeaderboardEntry & { amountLabel: string }) | null };

const TOP_N = 5;

export function leaderboardWidgetModel(rows: LeaderboardEntry[] | null, currency: string): LeaderboardWidgetModel {
  if (rows === null) return { kind: 'hidden' };
  if (rows.length === 0) return { kind: 'empty', message: 'Aún no hay miembros activos con ventas este mes.' };
  const withLabel = rows.map((r) => ({ ...r, amountLabel: formatCurrency(r.amount, currency) }));
  const top = withLabel.slice(0, TOP_N);
  const me = withLabel.find((r) => r.is_me) ?? null;
  return { kind: 'data', top, me };
}

export interface PipelineWidgetModel {
  opportunities: Array<SellerOpportunity & { amountLabel: string; href: string }>;
  tasks: Array<SellerTask & { href: string }>;
  opportunitiesEmpty: string;
  tasksEmpty: string;
}

export function pipelineWidgetModel(opps: SellerOpportunity[], tasks: SellerTask[], currency: string): PipelineWidgetModel {
  return {
    opportunities: opps.map((o) => ({ ...o, amountLabel: o.amount == null ? 'Sin monto' : formatCurrency(o.amount, o.currency || currency), href: `/app/crm/oportunidades/${encodeURIComponent(o.id)}` })),
    tasks: tasks.map((t) => ({ ...t, href: `/app/pm/tareas?taskId=${encodeURIComponent(t.id)}` })),
    opportunitiesEmpty: 'Sin oportunidades abiertas a tu nombre. Crea una desde el pipeline.',
    tasksEmpty: 'Sin tareas para hoy.',
  };
}

/** Entrada escalonada: 60 ms por widget; 0 con `prefers-reduced-motion`. */
export function staggerDelay(index: number, reduced: boolean | null): number {
  return reduced ? 0 : index * 0.06;
}
