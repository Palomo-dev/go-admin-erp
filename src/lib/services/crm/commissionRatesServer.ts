/**
 * Tasas de comisión por vendedor (`vendor_commission_rates`) — solo servidor.
 *
 * Columnas reales (verificadas por MCP 2026-09-28): id, organization_id,
 * salesperson_id, rate, valid_from (date), valid_to (date), created_at. No hay
 * `valid_until`, `updated_at` ni `salesperson_name`: el nombre se resuelve con
 * `profiles`. Las escrituras van por `fn_tasa_comision_guardar` /
 * `fn_tasa_comision_eliminar` (DEFINER, exigen rol de gestión o
 * finance.approve); authenticated ya no tiene INSERT/UPDATE/DELETE en la tabla.
 * Recibe el cliente de la SESIÓN (la RPC necesita `auth.uid()`).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { CommissionTransitionError } from './commissionTransitions';

export interface CommissionRateRow {
  id: string;
  organization_id: number;
  salesperson_id: string | null;
  /** Resuelto con `profiles` (nombre y apellido, o correo). */
  salesperson_name: string | null;
  rate: number;
  valid_from: string | null;
  valid_to: string | null;
  created_at: string;
}

export interface CommissionRatesList {
  general: CommissionRateRow | null;
  vendors: CommissionRateRow[];
}

const COLUMNS = 'id, organization_id, salesperson_id, rate, valid_from, valid_to, created_at';

type RawRate = Omit<CommissionRateRow, 'salesperson_name'>;

export async function listCommissionRates(orgId: number, supabase: SupabaseClient): Promise<CommissionRatesList> {
  const { data, error } = await supabase
    .from('vendor_commission_rates')
    .select(COLUMNS)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data || []) as RawRate[];

  const ids = Array.from(new Set(rows.map((r) => r.salesperson_id).filter((x): x is string => !!x)));
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profs, error: pErr } = await supabase.from('profiles').select('id, first_name, last_name, email').in('id', ids);
    if (pErr) throw pErr;
    for (const p of (profs || []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>) {
      const full = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
      names.set(p.id, full || p.email || p.id);
    }
  }

  const withName = (r: RawRate): CommissionRateRow => ({
    ...r,
    rate: Number(r.rate),
    salesperson_name: r.salesperson_id ? names.get(r.salesperson_id) ?? null : null,
  });
  return {
    general: rows.filter((r) => r.salesperson_id === null).map(withName)[0] ?? null,
    vendors: rows.filter((r) => r.salesperson_id !== null).map(withName),
  };
}

export interface SaveCommissionRateInput {
  id?: string | null;
  salesperson_id: string | null;
  rate: number;
  valid_from?: string | null;
  valid_to?: string | null;
}

const PLAIN_RE = /^\d{4}-\d{2}-\d{2}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida el cuerpo que llega del cliente; lanza 400 con mensaje claro. */
export function parseSaveCommissionRate(body: Record<string, unknown>): SaveCommissionRateInput {
  const rate = typeof body.rate === 'number' ? body.rate : Number(body.rate);
  if (body.rate === null || body.rate === undefined || body.rate === '' || !Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new CommissionTransitionError('La tasa debe ser un porcentaje entre 0 y 100.', 400, 'RATE_INVALID');
  }
  const sp = body.salesperson_id == null || body.salesperson_id === '' ? null : String(body.salesperson_id);
  if (sp !== null && !UUID_RE.test(sp)) throw new CommissionTransitionError('Vendedor inválido.', 400, 'SALESPERSON_INVALID');
  const id = body.id == null || body.id === '' ? null : String(body.id);
  if (id !== null && !UUID_RE.test(id)) throw new CommissionTransitionError('Tasa inválida.', 400, 'ID_INVALID');
  const day = (v: unknown, field: string): string | null => {
    if (v == null || v === '') return null;
    if (typeof v !== 'string' || !PLAIN_RE.test(v)) throw new CommissionTransitionError(`${field} debe ser YYYY-MM-DD.`, 400, 'DATE_INVALID');
    return v;
  };
  return { id, salesperson_id: sp, rate, valid_from: day(body.valid_from, 'valid_from'), valid_to: day(body.valid_to, 'valid_to') };
}

const RPC_MESSAGES: Record<string, string> = {
  tasa_invalida: 'La tasa debe ser un porcentaje entre 0 y 100.',
  vigencia_invalida: 'La vigencia termina antes de empezar.',
  vendedor_invalido: 'El vendedor no pertenece a esta organización.',
};

/** Errores de negocio de la RPC → 400/403/404; el resto se propaga tal cual (502 en la ruta). */
export function mapCommissionRateRpcError(error: { code?: string; message?: string }): never {
  const msg = error.message || '';
  if (error.code === '42501') throw new CommissionTransitionError('No tienes permiso para gestionar tasas de comisión.', 403, 'FORBIDDEN');
  if (error.code === 'P0002') throw new CommissionTransitionError('La tasa no existe en esta organización.', 404, 'NOT_FOUND');
  if (error.code === '22023') throw new CommissionTransitionError(RPC_MESSAGES[msg] ?? msg, 400, msg.toUpperCase() || 'INVALID');
  throw error;
}

export async function saveCommissionRate(orgId: number, supabase: SupabaseClient, input: SaveCommissionRateInput): Promise<RawRate> {
  const { data, error } = await supabase.rpc('fn_tasa_comision_guardar', {
    p_org: orgId,
    p_salesperson: input.salesperson_id,
    p_rate: input.rate,
    p_valid_from: input.valid_from ?? null,
    p_valid_to: input.valid_to ?? null,
    p_id: input.id ?? null,
  });
  if (error) mapCommissionRateRpcError(error);
  return data as RawRate;
}

export async function deleteCommissionRate(orgId: number, supabase: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('fn_tasa_comision_eliminar', { p_org: orgId, p_id: id });
  if (error) mapCommissionRateRpcError(error);
  return data === true;
}
