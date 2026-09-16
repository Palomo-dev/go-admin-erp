import { plainDateToInstant, toPlainDate } from '@/lib/utils/dateDisplay';

/**
 * F11 — renovación: lógica pura (sin Supabase, sin `Date.now()` implícito).
 *
 * Regla del método (FASE-11 §3.1): por contrato ganado existe UNA oportunidad
 * `deal_type='renewal'`; los toques 120/90/60/30/15/7 días antes del
 * vencimiento son TAREAS de esa oportunidad. Los hitos ya vencidos no se
 * crean; `next_contact_at` apunta al primer hito pendiente. El vencimiento se
 * calcula desde `opportunities.closed_at` (lo escribe el trigger
 * `trg_opportunities_closed_at` al pasar a `won`); si es null no hay contrato
 * cerrado y se falla con mensaje claro.
 */

export const RENEWAL_MILESTONE_DAYS = [120, 90, 60, 30, 15, 7] as const;
export type RenewalMilestoneDays = (typeof RENEWAL_MILESTONE_DAYS)[number];

export class RenewalPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RenewalPlanError';
  }
}

export interface RenewalMilestone {
  days: RenewalMilestoneDays;
  dueAt: Date;
}

export interface RenewalPlan {
  expiryDate: Date;
  /** Día calendario del vencimiento en la zona de la organización (`date`). */
  expiryPlainDate: string;
  milestones: RenewalMilestone[];
  nextContactAt: Date | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Fallback de zona (regla 6 de fechas): la real sale de `organizations.timezone`. */
const DEFAULT_TIMEZONE = 'America/Bogota';

/** Hora local (HH:mm, segundos y ms) de un instante en la zona dada. */
function localTimeParts(date: Date, timezone: string): { hhmm: string; seconds: number; ms: number } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? '00';
  return { hhmm: `${get('hour')}:${get('minute')}`, seconds: Number(get('second')) || 0, ms: date.getUTCMilliseconds() };
}

/**
 * Suma meses en el CALENDARIO de la organización (r2; antes en UTC: 30 ene
 * 23:30 Bogotá + 1 mes daba 27 feb). `toPlainDate` → sumar meses sin
 * desbordar (31 ene + 1 = 28/29 feb) → `plainDateToInstant` con la misma hora
 * local. No depende del TZ del proceso.
 */
export function computeExpiryDate(closedAt: Date, billingCycleMonths: number, timezone: string = DEFAULT_TIMEZONE): Date {
  if (!Number.isInteger(billingCycleMonths) || billingCycleMonths <= 0) {
    throw new RenewalPlanError(`billing_cycle_months inválido: ${billingCycleMonths}`);
  }
  const plain = toPlainDate(closedAt, timezone);
  if (!plain) throw new RenewalPlanError(`closed_at inválido: ${String(closedAt)}`);
  const [y, m, d] = plain.split('-').map(Number);
  const total = m - 1 + billingCycleMonths;
  const targetYear = y + Math.floor(total / 12);
  const targetMonth = total % 12; // 0-11
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  const targetPlain = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const local = localTimeParts(closedAt, timezone);
  const base = new Date(plainDateToInstant(targetPlain, timezone, local.hhmm));
  return new Date(base.getTime() + local.seconds * 1000 + local.ms);
}

/** Hitos estrictamente futuros, ordenados en el tiempo (120 → 7). */
export function computeRenewalMilestones(expiryDate: Date, now: Date): RenewalMilestone[] {
  return RENEWAL_MILESTONE_DAYS
    .map((days) => ({ days, dueAt: new Date(expiryDate.getTime() - days * DAY_MS) }))
    .filter((m) => m.dueAt.getTime() > now.getTime());
}

export interface BuildRenewalPlanInput {
  closedAt: string | Date | null | undefined;
  billingCycleMonths: number;
  now: Date;
  /** Zona de la organización para el día calendario del vencimiento. */
  timezone?: string;
}

export function buildRenewalPlan(input: BuildRenewalPlanInput): RenewalPlan {
  if (input.closedAt == null || input.closedAt === '') {
    throw new RenewalPlanError('La oportunidad no tiene closed_at: no hay contrato cerrado del que calcular la renovación');
  }
  const closed = input.closedAt instanceof Date ? input.closedAt : new Date(input.closedAt);
  if (Number.isNaN(closed.getTime())) {
    throw new RenewalPlanError(`closed_at inválido: ${String(input.closedAt)}`);
  }
  const timezone = input.timezone || DEFAULT_TIMEZONE;
  const expiryDate = computeExpiryDate(closed, input.billingCycleMonths, timezone);
  const milestones = computeRenewalMilestones(expiryDate, input.now);
  return {
    expiryDate,
    expiryPlainDate: toPlainDate(expiryDate, timezone),
    milestones,
    nextContactAt: milestones[0]?.dueAt ?? null,
  };
}

/** Próximo toque a partir de las tareas reales (abiertas/en curso y futuras). */
export function nextContactFromTasks(
  tasks: ReadonlyArray<{ due_date: string | null; status: string | null }>,
  now: Date,
): Date | null {
  let best: Date | null = null;
  for (const t of tasks) {
    if (!t.due_date || (t.status !== 'open' && t.status !== 'in_progress')) continue;
    const d = new Date(t.due_date);
    if (Number.isNaN(d.getTime()) || d.getTime() <= now.getTime()) continue;
    if (!best || d.getTime() < best.getTime()) best = d;
  }
  return best;
}

export function milestoneTaskTitle(days: number): string {
  return `Contacto de renovación — ${days} días antes del vencimiento`;
}

export interface RenewalSequenceCandidate {
  id: string;
  is_active: boolean | null;
  trigger_type: string | null;
  trigger_config: unknown;
  template_key: string | null;
}

/**
 * Punto de extensión sobre el motor F8: la organización marca su secuencia de
 * renovación con `trigger_type='event'` + `trigger_config.event='renewal_scheduled'`
 * (preferente) o `template_key='renewal'`. Solo secuencias activas.
 */
export function pickRenewalSequence<T extends RenewalSequenceCandidate>(sequences: ReadonlyArray<T>): T | null {
  const active = sequences.filter((s) => s.is_active === true);
  const byEvent = active.find((s) => {
    if (s.trigger_type !== 'event') return false;
    const cfg = s.trigger_config;
    return !!cfg && typeof cfg === 'object' && (cfg as { event?: unknown }).event === 'renewal_scheduled';
  });
  if (byEvent) return byEvent;
  return active.find((s) => s.template_key === 'renewal') ?? null;
}
