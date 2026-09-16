/**
 * F13 — modelo puro del editor de cuotas: formulario ↔ payload de
 * `POST /api/crm/sales-targets`, validación junto al campo y etiquetas de
 * periodo. Sin React ni I/O.
 */

import { periodBoundsFor, validateQuotaInput, type QuotaInput, type QuotaPeriod, type QuotaType } from '@/lib/services/crm/quotaProgress';

export interface QuotaFormState {
  period: QuotaPeriod;
  /** Día calendario (YYYY-MM-DD) dentro del periodo; los límites se derivan. */
  anchor: string;
  target_type: QuotaType;
  /** Texto tal cual lo escribe el usuario («2.500.000», «1.234,5»). */
  target_amount: string;
  target_currency: string;
}

export interface QuotaFormError {
  field: keyof QuotaFormState;
  message: string;
}

export function defaultQuotaForm(today: string, currency: string): QuotaFormState {
  return { period: 'monthly', anchor: today, target_type: 'revenue', target_amount: '', target_currency: currency };
}

/** «2.500.000» → 2500000 · «1.234,5» → 1234.5 · «40» → 40. */
export function parseAmount(text: string): number {
  const t = text.trim();
  if (!t) return NaN;
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/\.(?=\d{3}(\D|$))/g, '');
  return Number(normalized);
}

export function formToPayload(form: QuotaFormState): QuotaInput {
  const bounds = periodBoundsFor(form.period, form.anchor);
  return {
    period: form.period,
    period_start: bounds.period_start,
    period_end: bounds.period_end,
    target_type: form.target_type,
    target_amount: parseAmount(form.target_amount),
    target_currency: form.target_currency,
  };
}

export function validateQuotaForm(form: QuotaFormState): QuotaFormError[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.anchor)) return [{ field: 'anchor', message: 'Elige una fecha dentro del periodo.' }];
  const amount = parseAmount(form.target_amount);
  if (!form.target_amount.trim() || !Number.isFinite(amount) || amount <= 0) {
    return [{ field: 'target_amount', message: 'Escribe la meta: un número mayor que cero.' }];
  }
  const v = validateQuotaInput({ ...formToPayload(form) });
  if (!v.ok) return [{ field: v.field === 'period_start' || v.field === 'period_end' ? 'anchor' : v.field, message: v.message }];
  return [];
}

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Etiqueta del periodo a partir de días calendario (sin `Date` local: no desplaza el día). */
export function periodLabelFor(period: string, periodStart: string, periodEnd: string): string {
  const [y, m] = periodStart.split('-').map(Number);
  if (period === 'monthly') return `${MONTHS[m - 1]} ${y}`;
  if (period === 'quarterly') {
    const q = Math.floor((m - 1) / 3) + 1;
    return `${q}.${q === 1 || q === 3 ? 'er' : 'º'} trimestre ${y}`;
  }
  if (period === 'yearly') return `Año ${y}`;
  return `${periodStart} – ${periodEnd}`;
}
