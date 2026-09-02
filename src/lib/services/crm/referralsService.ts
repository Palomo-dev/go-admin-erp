import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Servicio CRM para gestión de programas de referidos (F12).
 * Tablas: referral_programs, referrals
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
  status: 'pending' | 'contacted' | 'qualified' | 'converted' | 'rejected';
  reward_paid: boolean;
  reward_paid_at: string | null;
  created_at: string;
}

export interface ReferralInput {
  program_id?: string | null;
  referrer_customer_id: string;
  referred_customer_id?: string | null;
  referred_name: string;
  referred_email?: string | null;
  referred_phone?: string | null;
  opportunity_id?: string | null;
  status?: string;
}

export interface ReferralFilters {
  status?: string;
  program_id?: string;
  referrer_customer_id?: string;
  reward_paid?: boolean;
  limit?: number;
  offset?: number;
}

// ─── Funciones del servicio ──────────────────────────────────────────────────

/**
 * Lista los programas de referidos de una organización.
 */
export async function getReferralPrograms(
  orgId: number,
  supabase: SupabaseClient
): Promise<ReferralProgram[]> {
  const { data, error } = await supabase
    .from('referral_programs')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[referralsService.getReferralPrograms] error:', error.message);
    return [];
  }

  return (data || []) as ReferralProgram[];
}

/**
 * Crea un programa de referidos.
 */
export async function createReferralProgram(
  orgId: number,
  data: ReferralProgramInput,
  supabase: SupabaseClient
): Promise<ReferralProgram | null> {
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

/**
 * Actualiza un programa de referidos.
 */
export async function updateReferralProgram(
  id: string,
  orgId: number,
  data: ReferralProgramUpdateInput,
  supabase: SupabaseClient
): Promise<ReferralProgram | null> {
  const updateData: Record<string, unknown> = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.reward_type !== undefined) updateData.reward_type = data.reward_type;
  if (data.reward_amount !== undefined) updateData.reward_amount = data.reward_amount;
  if (data.reward_to !== undefined) updateData.reward_to = data.reward_to;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;

  const { data: result, error } = await supabase
    .from('referral_programs')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('*')
    .maybeSingle();

  if (error) throw error;

  return result as ReferralProgram | null;
}

/**
 * Elimina un programa de referidos.
 */
export async function deleteReferralProgram(
  id: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('referral_programs')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) throw error;
}

/**
 * Lista los referidos de una organización con filtros opcionales.
 */
export async function getReferrals(
  orgId: number,
  supabase: SupabaseClient,
  filters?: ReferralFilters
): Promise<{ data: Referral[]; count: number }> {
  let query = supabase
    .from('referrals')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.program_id) {
    query = query.eq('program_id', filters.program_id);
  }
  if (filters?.referrer_customer_id) {
    query = query.eq('referrer_customer_id', filters.referrer_customer_id);
  }
  if (filters?.reward_paid !== undefined) {
    query = query.eq('reward_paid', filters.reward_paid);
  }

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('[referralsService.getReferrals] error:', error.message);
    return { data: [], count: 0 };
  }

  return {
    data: (data || []) as Referral[],
    count: count || 0,
  };
}

/**
 * Crea un referido.
 */
export async function createReferral(
  orgId: number,
  data: ReferralInput,
  supabase: SupabaseClient
): Promise<Referral | null> {
  const { data: result, error } = await supabase
    .from('referrals')
    .insert({
      organization_id: orgId,
      program_id: data.program_id ?? null,
      referrer_customer_id: data.referrer_customer_id,
      referred_customer_id: data.referred_customer_id ?? null,
      referred_name: data.referred_name,
      referred_email: data.referred_email ?? null,
      referred_phone: data.referred_phone ?? null,
      opportunity_id: data.opportunity_id ?? null,
      status: (data.status as Referral['status']) || 'pending',
    })
    .select('*')
    .single();

  if (error) throw error;

  return result as Referral;
}

/**
 * Actualiza el estado de un referido.
 */
export async function updateReferralStatus(
  id: string,
  orgId: number,
  status: 'pending' | 'contacted' | 'qualified' | 'converted' | 'rejected',
  supabase: SupabaseClient
): Promise<Referral | null> {
  const { data: result, error } = await supabase
    .from('referrals')
    .update({ status })
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('*')
    .maybeSingle();

  if (error) throw error;

  return result as Referral | null;
}

/**
 * Marca la recompensa de un referido como pagada.
 */
export async function markRewardPaid(
  id: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<Referral | null> {
  const { data: result, error } = await supabase
    .from('referrals')
    .update({
      reward_paid: true,
      reward_paid_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('*')
    .maybeSingle();

  if (error) throw error;

  return result as Referral | null;
}
