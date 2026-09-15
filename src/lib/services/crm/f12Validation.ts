/**
 * F12 — validación de entrada (pura) de las rutas de partners y referidos.
 *
 * Devuelve valores normalizados y SOLO las claves permitidas: `organization_id`,
 * `id`, `status`, `reward_paid`, `commission_amount`… del body se descartan
 * aquí, y la ruta trata `organization_id` ajeno aparte (403). Los conjuntos
 * de valores son los CHECK de la BD verificados por MCP el 2026-09-15.
 */

import { DEAL_TYPES, type DealType } from './partnerCommission';
import { REWARD_TO, REWARD_TYPES } from './referralReward';

export interface FieldError {
  field: string;
  message: string;
}

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: FieldError[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const NAME_MAX = 120;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

type Body = Record<string, unknown>;

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

interface Opts {
  partial: boolean;
}

/** Cadena obligatoria (al crear) u opcional-pero-no-vacía (parcial). */
function readName(body: Body, key: string, label: string, opts: Opts, errors: FieldError[], out: Body, max = NAME_MAX): void {
  if (!(key in body) && opts.partial) return;
  const v = text(body[key]);
  if (!v) errors.push({ field: key, message: `${label} es obligatorio` });
  else if (v.length > max) errors.push({ field: key, message: `${label}: máximo ${max} caracteres` });
  else out[key] = v;
}

function readOptionalText(body: Body, key: string, errors: FieldError[], out: Body, max = 200): void {
  if (!(key in body)) return;
  const raw = body[key];
  if (raw === null || raw === '') {
    out[key] = null;
    return;
  }
  if (typeof raw !== 'string') {
    errors.push({ field: key, message: `${key} debe ser texto` });
    return;
  }
  const v = raw.trim();
  if (v.length > max) errors.push({ field: key, message: `${key}: máximo ${max} caracteres` });
  else out[key] = v || null;
}

function readEmail(body: Body, key: string, required: boolean, errors: FieldError[], out: Body): void {
  if (!(key in body)) {
    if (required) errors.push({ field: key, message: 'El correo es obligatorio' });
    return;
  }
  const raw = body[key];
  if (raw === null || raw === '') {
    if (required) errors.push({ field: key, message: 'El correo es obligatorio' });
    else out[key] = null;
    return;
  }
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!v && required) errors.push({ field: key, message: 'El correo es obligatorio' });
  else if (!EMAIL_RE.test(v) || v.length > 254) errors.push({ field: key, message: 'El correo no tiene un formato válido' });
  else out[key] = v;
}

function readRate(body: Body, key: string, errors: FieldError[], out: Body): void {
  if (!(key in body)) return;
  const n = number(body[key]);
  if (n === null || n < 0 || n > 100) errors.push({ field: key, message: 'La tasa debe estar entre 0 y 100' });
  else out[key] = n;
}

function readUuidOrNull(body: Body, key: string, errors: FieldError[], out: Body): void {
  if (!(key in body)) return;
  const raw = body[key];
  if (raw === null || raw === '') {
    out[key] = null;
    return;
  }
  if (!isUuid(raw)) errors.push({ field: key, message: `${key} no es un identificador válido` });
  else out[key] = raw;
}

function readBoolean(body: Body, key: string, errors: FieldError[], out: Body): void {
  if (!(key in body)) return;
  if (typeof body[key] !== 'boolean') errors.push({ field: key, message: `${key} debe ser verdadero o falso` });
  else out[key] = body[key];
}

function finish<T>(errors: FieldError[], out: Body, opts: Opts): Validation<T> {
  if (errors.length) return { ok: false, errors };
  if (opts.partial && Object.keys(out).length === 0) return { ok: false, errors: [{ field: 'body', message: 'Nada que actualizar' }] };
  return { ok: true, value: out as T };
}

// ─── Partner ─────────────────────────────────────────────────────────────────

export interface PartnerValues {
  name?: string;
  email?: string;
  company_name?: string | null;
  phone?: string | null;
  tier_id?: string | null;
  commission_rate?: number;
  is_active?: boolean;
}

export function validatePartnerInput(body: Body, opts: Opts): Validation<PartnerValues> {
  const errors: FieldError[] = [];
  const out: Body = {};
  readName(body, 'name', 'El nombre', opts, errors, out);
  readEmail(body, 'email', !opts.partial, errors, out);
  readOptionalText(body, 'company_name', errors, out);
  readOptionalText(body, 'phone', errors, out, 40);
  readUuidOrNull(body, 'tier_id', errors, out);
  readRate(body, 'commission_rate', errors, out);
  readBoolean(body, 'is_active', errors, out);
  return finish<PartnerValues>(errors, out, opts);
}

// ─── Tier ────────────────────────────────────────────────────────────────────

export interface TierValues {
  name?: string;
  min_deals?: number;
  min_revenue?: number;
  commission_rate?: number;
  benefits?: string[];
}

export function validateTierInput(body: Body, opts: Opts): Validation<TierValues> {
  const errors: FieldError[] = [];
  const out: Body = {};
  readName(body, 'name', 'El nombre del tier', opts, errors, out, 60);
  if ('min_deals' in body) {
    const n = number(body.min_deals);
    if (n === null || n < 0 || !Number.isInteger(n)) errors.push({ field: 'min_deals', message: 'Los deals mínimos deben ser un entero ≥ 0' });
    else out.min_deals = n;
  }
  if ('min_revenue' in body) {
    const n = number(body.min_revenue);
    if (n === null || n < 0) errors.push({ field: 'min_revenue', message: 'El revenue mínimo debe ser un número ≥ 0' });
    else out.min_revenue = n;
  }
  readRate(body, 'commission_rate', errors, out);
  if ('benefits' in body) {
    const b = body.benefits;
    if (!Array.isArray(b) || b.some((x) => typeof x !== 'string')) errors.push({ field: 'benefits', message: 'Los beneficios son una lista de textos' });
    else out.benefits = (b as string[]).map((x) => x.trim()).filter(Boolean).slice(0, 20);
  }
  return finish<TierValues>(errors, out, opts);
}

// ─── Programa de referidos ───────────────────────────────────────────────────

export interface ProgramValues {
  name?: string;
  description?: string | null;
  reward_type?: (typeof REWARD_TYPES)[number];
  reward_amount?: number;
  reward_to?: (typeof REWARD_TO)[number];
  is_active?: boolean;
}

export function validateProgramInput(body: Body, opts: Opts): Validation<ProgramValues> {
  const errors: FieldError[] = [];
  const out: Body = {};
  readName(body, 'name', 'El nombre del programa', opts, errors, out);
  readOptionalText(body, 'description', errors, out, 500);
  if ('reward_type' in body || !opts.partial) {
    if (!(REWARD_TYPES as readonly unknown[]).includes(body.reward_type)) errors.push({ field: 'reward_type', message: `Tipo de recompensa inválido. Valores: ${REWARD_TYPES.join(', ')}` });
    else out.reward_type = body.reward_type;
  }
  if ('reward_to' in body || !opts.partial) {
    if (!(REWARD_TO as readonly unknown[]).includes(body.reward_to)) errors.push({ field: 'reward_to', message: `Destinatario inválido. Valores: ${REWARD_TO.join(', ')}` });
    else out.reward_to = body.reward_to;
  }
  if ('reward_amount' in body || !opts.partial) {
    const n = 'reward_amount' in body ? number(body.reward_amount) : 0;
    if (n === null || n < 0) errors.push({ field: 'reward_amount', message: 'El valor de la recompensa debe ser un número ≥ 0' });
    else out.reward_amount = n;
  }
  const type = (out.reward_type ?? body.reward_type) as string | undefined;
  if (type === 'discount' && typeof out.reward_amount === 'number' && out.reward_amount > 100) {
    errors.push({ field: 'reward_amount', message: 'Un descuento no puede superar el 100 %' });
  }
  readBoolean(body, 'is_active', errors, out);
  return finish<ProgramValues>(errors, out, opts);
}

// ─── Referido ────────────────────────────────────────────────────────────────

export interface ReferralValues {
  referrer_customer_id: string;
  referred_name: string;
  referred_email?: string | null;
  referred_phone?: string | null;
  program_id?: string | null;
}

/** Alta de referido: nace `pending`, sin recompensa y sin enlaces; esos campos del body se ignoran. */
export function validateReferralInput(body: Body): Validation<ReferralValues> {
  const errors: FieldError[] = [];
  const out: Body = {};
  if (!isUuid(body.referrer_customer_id)) errors.push({ field: 'referrer_customer_id', message: 'Elige el cliente que refiere' });
  else out.referrer_customer_id = body.referrer_customer_id;
  readName(body, 'referred_name', 'El nombre del referido', { partial: false }, errors, out);
  readEmail(body, 'referred_email', false, errors, out);
  readOptionalText(body, 'referred_phone', errors, out, 40);
  readUuidOrNull(body, 'program_id', errors, out);
  return finish<ReferralValues>(errors, out, { partial: false });
}

export interface ReferralPatchValues {
  referred_name?: string;
  referred_email?: string | null;
  referred_phone?: string | null;
  program_id?: string | null;
}

/** Edición de datos descriptivos; el estado y la recompensa van por sus rutas. */
export function validateReferralPatch(body: Body): Validation<ReferralPatchValues> {
  const errors: FieldError[] = [];
  const out: Body = {};
  readName(body, 'referred_name', 'El nombre del referido', { partial: true }, errors, out);
  readEmail(body, 'referred_email', false, errors, out);
  readOptionalText(body, 'referred_phone', errors, out, 40);
  readUuidOrNull(body, 'program_id', errors, out);
  return finish<ReferralPatchValues>(errors, out, { partial: true });
}

// ─── Deal de partner ─────────────────────────────────────────────────────────

export interface DealValues {
  opportunity_id: string;
  deal_type: DealType;
}

/** La comisión NUNCA viene del body: la calcula el servidor (monto × tasa efectiva). */
export function validateDealInput(body: Body): Validation<DealValues> {
  const errors: FieldError[] = [];
  const out: Body = {};
  if (!isUuid(body.opportunity_id)) errors.push({ field: 'opportunity_id', message: 'Elige la oportunidad del deal' });
  else out.opportunity_id = body.opportunity_id;
  if (!(DEAL_TYPES as readonly unknown[]).includes(body.deal_type)) errors.push({ field: 'deal_type', message: `Tipo de deal inválido. Valores: ${DEAL_TYPES.join(', ')}` });
  else out.deal_type = body.deal_type;
  return finish<DealValues>(errors, out, { partial: false });
}

export function firstErrorMessage(errors: FieldError[]): string {
  return errors.map((e) => e.message).join('. ');
}
