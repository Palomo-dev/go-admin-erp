import type { SupabaseClient } from '@supabase/supabase-js';
import { assertReferralTransition, canTransitionReferral, type ReferralStatus } from './referralStateMachine';
import { checkRewardPayable, rewardPaidPatch } from './referralReward';
import { F12Error, notFound } from './f12Errors';
import { createLeadWithCustomer, rollbackCustomer, type LeadCreateContext, type LeadCreateResult } from './leadCreateService';

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

export interface ReferralProgram {
  id: string;
  organization_id: number;
  name: string;
  description: string | null;
  reward_type: string;
  reward_amount: number;
  reward_to: string;
  is_active: boolean;
  created_at: string;
}

export interface ReferralProgramInput {
  name: string;
  description?: string | null;
  reward_type: string;
  reward_amount: number;
  reward_to: string;
  is_active?: boolean;
}

export interface ReferralProgramUpdateInput {
  name?: string;
  description?: string | null;
  reward_type?: string;
  reward_amount?: number;
  reward_to?: string;
  is_active?: boolean;
}

export interface Referral {
  id: string;
  organization_id: number;
  program_id: string | null;
  referrer_customer_id: string;
  referred_customer_id: string | null;
  referred_name: string;
  referred_email: string | null;
  referred_phone: string | null;
  opportunity_id: string | null;
  status: ReferralStatus;
  reward_paid: boolean;
  reward_paid_at: string | null;
  created_at: string;
}

export interface ReferralCustomerRef {
  id: string;
  full_name: string | null;
  email?: string | null;
}

export interface ReferralProgramRef {
  id: string;
  name: string;
  reward_type: string;
  reward_amount: number;
  reward_to: string;
  is_active: boolean;
}

export interface ReferralOpportunityRef {
  id: string;
  name: string;
  status: string | null;
  record_type: string | null;
}

/** Fila con sus enlaces resueltos para la interfaz. */
export interface ReferralView extends Referral {
  referrer: ReferralCustomerRef | null;
  referred: ReferralCustomerRef | null;
  program: ReferralProgramRef | null;
  opportunity: ReferralOpportunityRef | null;
}

export interface ReferralInput {
  program_id?: string | null;
  referrer_customer_id: string;
  referred_name: string;
  referred_email?: string | null;
  referred_phone?: string | null;
}

export interface ReferralPatch {
  referred_name?: string;
  referred_email?: string | null;
  referred_phone?: string | null;
  program_id?: string | null;
}

export interface ReferralFilters {
  status?: string;
  program_id?: string;
  referrer_customer_id?: string;
  reward_paid?: boolean;
  limit?: number;
  offset?: number;
}

/** Tarea «pedir referido» que F10 crea al ganar (`tasks.type='referido'`). */
export interface ReferralRequest {
  id: string;
  title: string;
  due_date: string | null;
  status: string | null;
  customer_id: string | null;
  related_to_id: string | null;
  customer: ReferralCustomerRef | null;
}

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
  return { data: ((data as Record<string, unknown>[] | null) ?? []).map(toView), count: count ?? 0 };
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
 * Convierte el referido en lead (cliente `lifecycle_stage='lead'` +
 * oportunidad `record_type='lead'`, `source='referral'`, `deal_type='referral'`)
 * con el MISMO alta que `POST /api/crm/leads`, y pasa el referido a `converted`
 * enlazándolo. Si el enlace no cuaja, se deshace el alta (mejor esfuerzo).
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

  const email = body.referred_email === undefined ? current.referred_email : body.referred_email;
  const phone = body.referred_phone === undefined ? current.referred_phone : body.referred_phone;
  const leadResult = await createLeadWithCustomer(ctx, {
    name: body.name?.trim() || `Referido: ${current.referred_name}`,
    customer_id: body.customer_id,
    new_customer: body.customer_id ? undefined : { full_name: current.referred_name, email: email ?? undefined, phone: phone ?? undefined },
    pipeline_id: body.pipeline_id,
    stage_id: body.stage_id,
    amount: body.amount,
    currency: body.currency,
    salesperson_id: body.salesperson_id,
    source: 'referral',
    deal_type: 'referral',
  });
  if (leadResult.status !== 201) return leadResult;

  const { data, error } = await supabase
    .from('referrals')
    .update({ status: 'converted', opportunity_id: leadResult.data.id as string, referred_customer_id: leadResult.customer_id })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .eq('status', current.status)
    .select(REFERRAL_SELECT)
    .maybeSingle();

  if (error || !data) {
    // El lead ya está en la base pero el referido no quedó enlazado: se deshace
    // el alta (oportunidad y, si se creó aquí, la ficha) para no dejar un lead
    // huérfano. Mejor esfuerzo: si el borrado falla se registra, no se oculta.
    const { error: eOpp } = await supabase.from('opportunities').delete().eq('id', leadResult.data.id as string).eq('organization_id', organizationId);
    if (eOpp) console.error('[referralsService.convertReferral] no se pudo revertir la oportunidad %s: %s', leadResult.data.id, eOpp.message);
    if (leadResult.created_customer_id) await rollbackCustomer(ctx, leadResult.created_customer_id);
    if (error) throw error;
    throw new F12Error(409, 'CONCURRENT_CHANGE', 'El referido cambió mientras se convertía; recarga la lista.');
  }
  return { referral: toView(data as Record<string, unknown>), lead: leadResult.data, created_customer_id: leadResult.created_customer_id };
}
