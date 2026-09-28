/**
 * F12 — modelo puro de la página de referidos: filtros en memoria, conteos
 * por estado y el formulario de registro (validación junto al campo y
 * conversión a payload). Sin I/O: la página lo llama, las rutas guardan.
 */

import { REFERRAL_STATUSES, type ReferralStatus } from './referralStateMachine';
import type { ReferralView } from './referralsService';
import { mensajeErrorTelefono } from '@/lib/utils/telefono';

export interface ReferralListFilters {
  status: ReferralStatus | 'all';
  q: string;
}

export const EMPTY_REFERRAL_FILTERS: ReferralListFilters = { status: 'all', q: '' };

function norm(value: string | null | undefined): string {
  return (value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function filterReferrals(list: ReferralView[], filters: ReferralListFilters): ReferralView[] {
  const q = norm(filters.q).trim();
  return list.filter((r) => {
    if (filters.status !== 'all' && r.status !== filters.status) return false;
    if (!q) return true;
    return [r.referred_name, r.referred_email, r.referred_phone, r.referrer?.full_name, r.program?.name].some((v) => norm(v).includes(q));
  });
}

export function countByStatus(list: ReferralView[]): Record<ReferralStatus, number> {
  const counts = Object.fromEntries(REFERRAL_STATUSES.map((s) => [s, 0])) as Record<ReferralStatus, number>;
  for (const r of list) if (r.status in counts) counts[r.status] += 1;
  return counts;
}

// ─── Formulario de registro ──────────────────────────────────────────────────

export interface RegisterReferralForm {
  referrer_customer_id: string | null;
  /** Nombre del referidor elegido (solo para mostrar). */
  referrer_name: string | null;
  referred_name: string;
  referred_email: string;
  referred_phone: string;
  program_id: string;
}

export interface FormError {
  field: keyof RegisterReferralForm;
  message: string;
}

export const REFERRED_NAME_MAX = 120;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emptyRegisterForm(): RegisterReferralForm {
  return { referrer_customer_id: null, referrer_name: null, referred_name: '', referred_email: '', referred_phone: '', program_id: '' };
}

export function validateRegisterForm(form: RegisterReferralForm): FormError[] {
  const errors: FormError[] = [];
  if (!form.referrer_customer_id) errors.push({ field: 'referrer_customer_id', message: 'Elige el cliente que hace la recomendación' });
  const name = form.referred_name.trim();
  if (!name) errors.push({ field: 'referred_name', message: 'Escribe el nombre de la persona referida' });
  else if (name.length > REFERRED_NAME_MAX) errors.push({ field: 'referred_name', message: `Máximo ${REFERRED_NAME_MAX} caracteres` });
  const email = form.referred_email.trim();
  if (email && !EMAIL_RE.test(email)) errors.push({ field: 'referred_email', message: 'El correo no tiene un formato válido' });
  const phoneError = mensajeErrorTelefono(form.referred_phone);
  if (phoneError) errors.push({ field: 'referred_phone', message: phoneError });
  return errors;
}

export function registerFormToPayload(form: RegisterReferralForm): {
  referrer_customer_id: string;
  referred_name: string;
  referred_email: string | null;
  referred_phone: string | null;
  program_id: string | null;
} {
  return {
    referrer_customer_id: form.referrer_customer_id ?? '',
    referred_name: form.referred_name.trim(),
    referred_email: form.referred_email.trim() || null,
    referred_phone: form.referred_phone.trim() || null,
    program_id: form.program_id.trim() || null,
  };
}
