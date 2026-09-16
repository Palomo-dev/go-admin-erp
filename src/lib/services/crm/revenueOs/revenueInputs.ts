/**
 * F14 — insumos manuales de la matemática comercial.
 *
 * Ni el gasto de adquisición (marketing + ventas) ni el margen bruto existen
 * en la base. Se guardan SIN tabla nueva en `organization_settings`
 * (`UNIQUE (organization_id, key)`, RLS por pertenencia, verificado por MCP
 * el 2026-09-15) bajo la clave `crm_revenue_math`:
 *
 *   settings = { acquisition_spend: number | null, gross_margin_pct: number | null }
 *
 * Validación en servidor (`validateRevenueInputs`): gasto ≥ 0 o null;
 * margen 0–100 o null; cualquier otra cosa → 400.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { RevenueOsError } from './rpc';

export const REVENUE_INPUTS_KEY = 'crm_revenue_math';

export interface RevenueInputs {
  acquisition_spend: number | null;
  gross_margin_pct: number | null;
  updated_at: string | null;
}

export interface RevenueInputsPatch {
  acquisition_spend: number | null;
  gross_margin_pct: number | null;
}

export class RevenueInputsValidationError extends Error {
  readonly statusCode = 400;
  readonly code = 'INVALID_INPUTS';
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = 'RevenueInputsValidationError';
    this.field = field;
  }
}

function parseNullableNumber(value: unknown, field: string, min: number, max: number | null): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RevenueInputsValidationError(field, `${field} debe ser un número`);
  }
  if (value < min) throw new RevenueInputsValidationError(field, `${field} no puede ser menor que ${min}`);
  if (max !== null && value > max) throw new RevenueInputsValidationError(field, `${field} no puede ser mayor que ${max}`);
  return value;
}

/** Lanza `RevenueInputsValidationError` (400) si el cuerpo no es válido. */
export function validateRevenueInputs(body: Record<string, unknown>): RevenueInputsPatch {
  return {
    acquisition_spend: parseNullableNumber(body.acquisition_spend, 'acquisition_spend', 0, null),
    gross_margin_pct: parseNullableNumber(body.gross_margin_pct, 'gross_margin_pct', 0, 100),
  };
}

function fromSettings(settings: unknown, updatedAt: unknown): RevenueInputs {
  const s = (settings && typeof settings === 'object' ? settings : {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    acquisition_spend: n(s.acquisition_spend),
    gross_margin_pct: n(s.gross_margin_pct),
    updated_at: typeof updatedAt === 'string' ? updatedAt : null,
  };
}

export async function getRevenueInputs(orgId: number, supabase: SupabaseClient): Promise<RevenueInputs> {
  const { data, error } = await supabase
    .from('organization_settings')
    .select('settings, updated_at')
    .eq('organization_id', orgId)
    .eq('key', REVENUE_INPUTS_KEY)
    .maybeSingle();
  if (error) throw new RevenueOsError(`organization_settings: ${error.message}`);
  if (!data) return { acquisition_spend: null, gross_margin_pct: null, updated_at: null };
  return fromSettings(data.settings, data.updated_at);
}

/** Upsert por `(organization_id, key)`; la organización viene de la sesión, nunca del body. */
export async function saveRevenueInputs(orgId: number, patch: RevenueInputsPatch, supabase: SupabaseClient): Promise<RevenueInputs> {
  const updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('organization_settings')
    .upsert(
      { organization_id: orgId, key: REVENUE_INPUTS_KEY, settings: { ...patch }, updated_at },
      { onConflict: 'organization_id,key' },
    )
    .select('settings, updated_at')
    .single();
  if (error) throw new RevenueOsError(`organization_settings: ${error.message}`);
  return fromSettings(data?.settings ?? patch, data?.updated_at ?? updated_at);
}
