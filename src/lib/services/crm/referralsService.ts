import type { SupabaseClient } from '@supabase/supabase-js';
import { assertReferralTransition, canTransitionReferral } from './referralStateMachine';
import { checkRewardPayable, rewardPaidPatch } from './referralReward';
import { F12Error, notFound } from './f12Errors';
import type { LeadCreateContext, LeadCreateResult } from './leadCreateService';
import { convertReferralAtomic } from './referralAtomicService';

/**
 * Servicio CRM de referidos (F12). Tablas: `referral_programs`, `referrals`
 * (columnas, CHECK y FK verificados por MCP el 2026-09-15). Todo va filtrado
 * por `organization_id` además de la RLS (defensa en profundidad).
 *
 * - El estado solo cambia por `transitionReferral` (máquina pura +
 *   guarda optimista `.eq('status', from)`): dos peticiones concurrentes no
 *   pueden aplicar la misma transición dos veces.
 * - La recompensa solo se marca por `markRewardPaid` (converted, con
 *   programa, una vez). Es un registro, no un pago.
 * - `convertReferral` reutiliza el alta de leads (`leadCreateService`).
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type { ReferralProgram, ReferralProgramInput, ReferralProgramUpdateInput, Referral, ReferralCustomerRef, ReferralProgramRef, ReferralOpportunityRef, ReferralView, ReferralInput, ReferralPatch, ReferralFilters, ReferralRequest } from './redCommercialTypes';
import type { ReferralProgram, ReferralProgramInput, ReferralProgramUpdateInput, Referral, ReferralCustomerRef, ReferralProgramRef, ReferralOpportunityRef, ReferralView, ReferralInput, ReferralPatch, ReferralFilters, ReferralRequest } from './redCommercialTypes';

const REFERRAL_SELECT = `*,
  referrer:customers!referrals_referrer_customer_id_fkey(id, full_name, email),
  referred:customers!referrals_referred_customer_id_fkey(id, full_name),
  program:referral_programs(id, name, reward_type, reward_amount, reward_to, is_active),
  opportunity:opportunities(id, name, status, record_type)`;

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toView(row: Record<string, unknown>): ReferralView {
  return {
    ...(row as unknown as Referral),
    referrer: one(row.referrer as ReferralCustomerRef | ReferralCustomerRef[] | null),
    referred: one(row.referred as ReferralCustomerRef | ReferralCustomerRef[] | null),
    program: one(row.program as ReferralProgramRef | ReferralProgramRef[] | null),
    opportunity: one(row.opportunity as ReferralOpportunityRef | ReferralOpportunityRef[] | null),
  };
}

// ─── Pertenencia ─────────────────────────────────────────────────────────────

export async function assertCustomerInOrg(customerId: string, orgId: number, supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase.from('customers').select('id').eq('id', customerId).eq('organization_id', orgId).maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('Cliente');
}

export async function assertProgramInOrg(programId: string, orgId: number, supabase: SupabaseClient): Promise<ReferralProgram> {
  const { data, error } = await supabase.from('referral_programs').select('*').eq('id', programId).eq('organization_id', orgId).maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('Programa de referidos');
  return data as ReferralProgram;
}

// ─── Programas ───────────────────────────────────────────────────────────────

export async function getReferralPrograms(orgId: number, supabase: SupabaseClient, opts?: { activeOnly?: boolean }): Promise<ReferralProgram[]> {
  let query = supabase.from('referral_programs').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });
  if (opts?.activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as ReferralProgram[];
}

export async function createReferralProgram(orgId: number, data: ReferralProgramInput, supabase: SupabaseClient): Promise<ReferralProgram> {
  const { data: result, error } = await supabase
    .from('referral_programs')
    .insert({
      organization_id: orgId,
      name: data.name,
      description: data.description ?? null,
      reward_type: data.reward_type,
      reward_amount: data.reward_amount,
      reward_to: data.reward_to,
      is_active: data.is_active ?? true,
    })
    .select('*')
    .single();
  if (error) throw error;
  return result as ReferralProgram;
}

export async function updateReferralProgram(id: string, orgId: number, data: ReferralProgramUpdateInput, supabase: SupabaseClient): Promise<ReferralProgram | null> {
  const { data: result, error } = await supabase
    .from('referral_programs')
    .update(data)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return (result as ReferralProgram | null) ?? null;
}

/** Devuelve `false` si el programa no existía en la organización. */
export async function deleteReferralProgram(id: string, orgId: number, supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.from('referral_programs').delete().eq('id', id).eq('organization_id', orgId).select('id');
  if (error) throw error;
  return ((data as unknown[] | null) ?? []).length > 0;
}

// ─── Referidos ───────────────────────────────────────────────────────────────

export async function getReferrals(orgId: number, supabase: SupabaseClient, filters?: ReferralFilters): Promise<{ data: ReferralView[]; count: number }> {
  let query = supabase.from('referrals').select(REFERRAL_SELECT, { count: 'exact' }).eq('organization_id', orgId).order('created_at', { ascending: false });
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.program_id) query = query.eq('program_id', filters.program_id);
  if (filters?.referrer_customer_id) query = query.eq('referrer_customer_id', filters.referrer_customer_id);
  if (filters?.reward_paid !== undefined) query = query.eq('reward_paid', filters.reward_paid);
  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  query = query.range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw error;
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) throw new Error('La base no devolvió el conteo exacto de referidos');
  return { data: ((data as Record<string, unknown>[] | null) ?? []).map(toView), count };
}

export async function getReferralById(id: string, orgId: number, supabase: SupabaseClient): Promise<ReferralView | null> {
  const { data, error } = await supabase.from('referrals').select(REFERRAL_SELECT).eq('id', id).eq('organization_id', orgId).maybeSingle();
  if (error) throw error;
  return data ? toView(data as Record<string, unknown>) : null;
}

async function requireReferral(id: string, orgId: number, supabase: SupabaseClient): Promise<ReferralView> {
  const row = await getReferralById(id, orgId, supabase);
  if (!row) throw notFound('Referido');
  return row;
}

/** Alta: verifica que el cliente que refiere y el programa (si viene) sean de la organización; nace `pending`. */
export async function createReferral(orgId: number, data: ReferralInput, supabase: SupabaseClient): Promise<ReferralView> {
  await assertCustomerInOrg(data.referrer_customer_id, orgId, supabase);
  if (data.program_id) {
    const program = await assertProgramInOrg(data.program_id, orgId, supabase);
    if (!program.is_active) throw new F12Error(409, 'PROGRAM_INACTIVE', 'El programa de referidos está inactivo');
  }
  const { data: result, error } = await supabase
    .from('referrals')
    .insert({
      organization_id: orgId,
      program_id: data.program_id ?? null,
      referrer_customer_id: data.referrer_customer_id,
      referred_name: data.referred_name,
      referred_email: data.referred_email ?? null,
      referred_phone: data.referred_phone ?? null,
      status: 'pending',
    })
    .select(REFERRAL_SELECT)
    .single();
  if (error) throw error;
  return toView(result as Record<string, unknown>);
}

export async function updateReferral(id: string, orgId: number, patch: ReferralPatch, supabase: SupabaseClient): Promise<ReferralView | null> {
  if (patch.program_id) await assertProgramInOrg(patch.program_id, orgId, supabase);
  const { data, error } = await supabase.from('referrals').update(patch).eq('id', id).eq('organization_id', orgId).select(REFERRAL_SELECT).maybeSingle();
  if (error) throw error;
  return data ? toView(data as Record<string, unknown>) : null;
}

/** Cambio de estado por la máquina pura, con guarda optimista sobre el estado leído. */
export async function transitionReferral(id: string, orgId: number, to: unknown, supabase: SupabaseClient): Promise<ReferralView> {
  const current = await requireReferral(id, orgId, supabase);
  assertReferralTransition(current.status, to, current);
  const { data, error } = await supabase
    .from('referrals')
    .update({ status: to })
    .eq('id', id)
    .eq('organization_id', orgId)
    .eq('status', current.status)
    .select(REFERRAL_SELECT)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new F12Error(409, 'CONCURRENT_CHANGE', 'El referido cambió de estado mientras se procesaba; recarga la lista.');
  return toView(data as Record<string, unknown>);
}

/** Compatibilidad con el índice de servicios: misma garantía que `transitionReferral`. */
export const updateReferralStatus = transitionReferral;

/** Marca la recompensa como pagada (registro). Solo `converted`, con programa y una vez. */
export async function markRewardPaid(id: string, orgId: number, supabase: SupabaseClient, now: Date = new Date()): Promise<ReferralView> {
  const current = await requireReferral(id, orgId, supabase);
  const check = checkRewardPayable(current);
  if (!check.ok) throw new F12Error(check.statusCode, check.code, check.message);
  const { data, error } = await supabase
    .from('referrals')
    .update(rewardPaidPatch(now))
    .eq('id', id)
    .eq('organization_id', orgId)
    .eq('status', 'converted')
    .eq('reward_paid', false)
    .select(REFERRAL_SELECT)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new F12Error(409, 'ALREADY_PAID', 'La recompensa ya fue marcada como pagada por otra petición.');
  return toView(data as Record<string, unknown>);
}

/** Tareas «pedir referido» abiertas (F10 las crea al ganar; `tasks.status` CHECK: open|in_progress|done|canceled). */
export async function getReferralRequests(orgId: number, supabase: SupabaseClient, limit = 50): Promise<ReferralRequest[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, due_date, status, customer_id, related_to_id, customer:customers(id, full_name, email)')
    .eq('organization_id', orgId)
    .eq('type', 'referido')
    .in('status', ['open', 'in_progress'])
    .order('due_date', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return ((data as Record<string, unknown>[] | null) ?? []).map((t) => ({
    id: t.id as string,
    title: t.title as string,
    due_date: (t.due_date as string | null) ?? null,
    status: (t.status as string | null) ?? null,
    customer_id: (t.customer_id as string | null) ?? null,
    related_to_id: (t.related_to_id as string | null) ?? null,
    customer: one(t.customer as ReferralCustomerRef | ReferralCustomerRef[] | null),
  }));
}

// ─── Conversión en lead / oportunidad ────────────────────────────────────────

export interface ConvertReferralBody {
  /** Cliente existente al que enlazar; si falta, se crea la ficha con los datos del referido. */
  customer_id?: string;
  /** Datos de contacto corregidos por el usuario (opcionales). */
  referred_email?: string | null;
  referred_phone?: string | null;
  name?: string;
  pipeline_id?: string;
  stage_id?: string;
  amount?: number;
  currency?: string;
  salesperson_id?: string;
}

export interface ConvertReferralResult {
  referral: ReferralView;
  lead: Record<string, unknown>;
  created_customer_id: string | null;
}

/**
 * Convierte el referido en lead con el MISMO alta que `POST /api/crm/leads`:
 * CRM ola 1 (D2) → el lead es el CLIENTE (`lifecycle_stage='lead'`,
 * `lead_source='referral'`, `metadata.lead.deal_type='referral'`), sin
 * oportunidad. El referido pasa a `converted` enlazado al cliente; su
 * `opportunity_id` lo pone `crm_create_opportunity` cuando el lead se califica.
 * La ficha y el enlace se guardan juntos o se revierten juntos.
 */
export async function convertReferral(ctx: LeadCreateContext, id: string, body: ConvertReferralBody): Promise<ConvertReferralResult | Exclude<LeadCreateResult, { status: 201 }>> {
  const { supabase, organizationId } = ctx;
  const current = await requireReferral(id, organizationId, supabase);
  if (!canTransitionReferral(current.status, 'converted')) {
    throw new F12Error(409, 'INVALID_TRANSITION', `Solo un referido calificado se puede convertir (estado actual: ${current.status})`);
  }
  if (current.opportunity_id || current.referred_customer_id) {
    throw new F12Error(409, 'ALREADY_LINKED', 'El referido ya está enlazado a un lead u oportunidad');
  }

  return convertReferralAtomic(ctx, current, body);
}
