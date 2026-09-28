/**
 * F12 — modelo puro de la página de partners: formularios de partner y tier
 * (validación junto al campo, conversión a payload), filtros y formato de
 * dinero sin moneda cableada. Sin I/O.
 */

import type { PartnerTier, PartnerView } from './partnerService';
import { mensajeErrorTelefono } from '@/lib/utils/telefono';

export interface PartnerForm {
  name: string;
  company_name: string;
  email: string;
  phone: string;
  tier_id: string;
  /** Vacío = hereda la tasa del tier (se guarda 0). */
  commission_rate: string;
  is_active: boolean;
}

export interface FieldError<F extends string = string> {
  field: F;
  message: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emptyPartnerForm(): PartnerForm {
  return { name: '', company_name: '', email: '', phone: '', tier_id: '', commission_rate: '', is_active: true };
}

export function partnerToForm(p: PartnerView | null): PartnerForm {
  if (!p) return emptyPartnerForm();
  const rate = Number(p.commission_rate);
  return {
    name: p.name,
    company_name: p.company_name ?? '',
    email: p.email,
    phone: p.phone ?? '',
    tier_id: p.tier_id ?? '',
    commission_rate: Number.isFinite(rate) && rate > 0 ? String(rate) : '',
    is_active: p.is_active,
  };
}

export function validatePartnerForm(f: PartnerForm): FieldError<keyof PartnerForm>[] {
  const errors: FieldError<keyof PartnerForm>[] = [];
  if (!f.name.trim()) errors.push({ field: 'name', message: 'El nombre es obligatorio' });
  if (!f.email.trim()) errors.push({ field: 'email', message: 'El correo es obligatorio' });
  else if (!EMAIL_RE.test(f.email.trim())) errors.push({ field: 'email', message: 'El correo no tiene un formato válido' });
  const phoneError = mensajeErrorTelefono(f.phone);
  if (phoneError) errors.push({ field: 'phone', message: phoneError });
  if (f.commission_rate.trim() !== '') {
    const n = Number(f.commission_rate);
    if (!Number.isFinite(n) || n < 0 || n > 100) errors.push({ field: 'commission_rate', message: 'La tasa debe estar entre 0 y 100' });
  }
  return errors;
}

export function partnerFormToPayload(f: PartnerForm): Record<string, unknown> {
  return {
    name: f.name.trim(),
    company_name: f.company_name.trim() || null,
    email: f.email.trim(),
    phone: f.phone.trim() || null,
    tier_id: f.tier_id || null,
    commission_rate: f.commission_rate.trim() === '' ? 0 : Number(f.commission_rate),
    is_active: f.is_active,
  };
}

// ─── Tier ────────────────────────────────────────────────────────────────────

export interface TierForm {
  name: string;
  min_deals: string;
  min_revenue: string;
  commission_rate: string;
  /** Un beneficio por línea. */
  benefitsText: string;
}

export function emptyTierForm(): TierForm {
  return { name: '', min_deals: '0', min_revenue: '0', commission_rate: '10', benefitsText: '' };
}

export function tierToForm(t: PartnerTier | null): TierForm {
  if (!t) return emptyTierForm();
  const benefits = Array.isArray(t.benefits) ? (t.benefits as unknown[]).filter((b): b is string => typeof b === 'string') : [];
  return { name: t.name, min_deals: String(t.min_deals), min_revenue: String(t.min_revenue), commission_rate: String(t.commission_rate), benefitsText: benefits.join('\n') };
}

export function validateTierForm(f: TierForm): FieldError<keyof TierForm>[] {
  const errors: FieldError<keyof TierForm>[] = [];
  if (!f.name.trim()) errors.push({ field: 'name', message: 'El nombre del tier es obligatorio' });
  const deals = Number(f.min_deals);
  if (f.min_deals.trim() === '' || !Number.isInteger(deals) || deals < 0) errors.push({ field: 'min_deals', message: 'Deals mínimos: entero mayor o igual a 0' });
  const revenue = Number(f.min_revenue);
  if (f.min_revenue.trim() === '' || !Number.isFinite(revenue) || revenue < 0) errors.push({ field: 'min_revenue', message: 'Revenue mínimo: número mayor o igual a 0' });
  const rate = Number(f.commission_rate);
  if (f.commission_rate.trim() === '' || !Number.isFinite(rate) || rate < 0 || rate > 100) errors.push({ field: 'commission_rate', message: 'La tasa debe estar entre 0 y 100' });
  return errors;
}

export function tierFormToPayload(f: TierForm): Record<string, unknown> {
  return {
    name: f.name.trim(),
    min_deals: Number(f.min_deals),
    min_revenue: Number(f.min_revenue),
    commission_rate: Number(f.commission_rate),
    benefits: f.benefitsText.split('\n').map((b) => b.trim()).filter(Boolean),
  };
}

// ─── Lista ───────────────────────────────────────────────────────────────────

export interface PartnerListFilters {
  q: string;
  onlyActive: boolean;
}

export const EMPTY_PARTNER_FILTERS: PartnerListFilters = { q: '', onlyActive: false };

function norm(v: string | null | undefined): string {
  return (v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function filterPartners(list: PartnerView[], f: PartnerListFilters): PartnerView[] {
  const q = norm(f.q).trim();
  return list.filter((p) => {
    if (f.onlyActive && !p.is_active) return false;
    if (!q) return true;
    return [p.name, p.company_name, p.email, p.tier?.name].some((v) => norm(v).includes(q));
  });
}

/**
 * Dinero con la moneda dada; sin moneda, la cifra sola (nunca se inventa una).
 * Entero → sin decimales; con fracción → dos decimales fijos («250.000,50»,
 * nunca «250.000,5»). Se redondea a centésimas antes de decidir.
 */
export function formatMoney(value: number | string | null | undefined, currency: string | null): string {
  const n = Number(value);
  // `toFixed` redondea sobre el decimal exacto (sin el error de `n * 100`) y no pierde
  // precisión con cifras ≥ 1e21; el `+ 0` convierte el `-0` de «-0.001» en 0 («$ 0», no «-$ 0»).
  const amount = Number.isFinite(n) ? Number(n.toFixed(2)) + 0 : 0;
  const digits = Number.isInteger(amount) ? 0 : 2;
  const opts = { minimumFractionDigits: digits, maximumFractionDigits: digits };
  if (currency) {
    try {
      return new Intl.NumberFormat('es-CO', { style: 'currency', currency, ...opts }).format(amount);
    } catch {
      return `${new Intl.NumberFormat('es-CO', opts).format(amount)} ${currency}`;
    }
  }
  return new Intl.NumberFormat('es-CO', opts).format(amount);
}

export function formatRate(rate: number | string | null | undefined): string {
  const n = Number(rate);
  return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0)} %`;
}
