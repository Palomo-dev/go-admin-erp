import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Servicio CRM para gestión de partners y tiers (F12).
 * Tablas: partners, partner_tiers, partner_deals
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface Partner {
  id: string;
  organization_id: number;
  name: string;
  company_name: string | null;
  email: string;
  phone: string | null;
  tier_id: string | null;
  commission_rate: number;
  is_active: boolean;
  created_at: string;
}

export interface PartnerInput {
  name: string;
  company_name?: string | null;
  email: string;
  phone?: string | null;
  tier_id?: string | null;
  commission_rate?: number;
  is_active?: boolean;
}

export interface PartnerUpdateInput {
  name?: string;
  company_name?: string | null;
  email?: string;
  phone?: string | null;
  tier_id?: string | null;
  commission_rate?: number;
  is_active?: boolean;
}

export interface PartnerTier {
  id: string;
  organization_id: number;
  name: string;
  min_deals: number;
  min_revenue: number;
  commission_rate: number;
  benefits: unknown;
  created_at: string;
}

export interface PartnerTierInput {
  name: string;
  min_deals?: number;
  min_revenue?: number;
  commission_rate?: number;
  benefits?: unknown;
}

export interface PartnerTierUpdateInput {
  name?: string;
  min_deals?: number;
  min_revenue?: number;
  commission_rate?: number;
  benefits?: unknown;
}

export interface PartnerDeal {
  id: string;
  organization_id: number;
  partner_id: string;
  opportunity_id: string;
  deal_type: 'referral' | 'co_sell' | 'reseller';
  commission_amount: number | null;
  commission_status: 'pending' | 'approved' | 'paid' | 'rejected';
  commission_paid_at: string | null;
  created_at: string;
}

export interface PartnerDealInput {
  partner_id: string;
  opportunity_id: string;
  deal_type: 'referral' | 'co_sell' | 'reseller';
  commission_amount?: number | null;
}

export interface PartnerDealFilters {
  partner_id?: string;
  deal_type?: string;
  commission_status?: string;
  limit?: number;
  offset?: number;
}

// ─── Partners ────────────────────────────────────────────────────────────────

/**
 * Lista los partners de una organización.
 */
export async function getPartners(
  orgId: number,
  supabase: SupabaseClient
): Promise<Partner[]> {
  const { data, error } = await supabase
    .from('partners')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[partnerService.getPartners] error:', error.message);
    return [];
  }

  return (data || []) as Partner[];
}

/**
 * Crea un partner.
 */
export async function createPartner(
  orgId: number,
  data: PartnerInput,
  supabase: SupabaseClient
): Promise<Partner | null> {
  const { data: result, error } = await supabase
    .from('partners')
    .insert({
      organization_id: orgId,
      name: data.name,
      company_name: data.company_name ?? null,
      email: data.email,
      phone: data.phone ?? null,
      tier_id: data.tier_id ?? null,
      commission_rate: data.commission_rate ?? 10,
      is_active: data.is_active ?? true,
    })
    .select('*')
    .single();

  if (error) throw error;

  return result as Partner;
}

/**
 * Actualiza un partner.
 */
export async function updatePartner(
  id: string,
  orgId: number,
  data: PartnerUpdateInput,
  supabase: SupabaseClient
): Promise<Partner | null> {
  const updateData: Record<string, unknown> = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.company_name !== undefined) updateData.company_name = data.company_name;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.tier_id !== undefined) updateData.tier_id = data.tier_id;
  if (data.commission_rate !== undefined) updateData.commission_rate = data.commission_rate;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;

  const { data: result, error } = await supabase
    .from('partners')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('*')
    .maybeSingle();

  if (error) throw error;

  return result as Partner | null;
}

/**
 * Elimina un partner.
 */
export async function deletePartner(
  id: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('partners')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) throw error;
}

// ─── Partner Tiers ───────────────────────────────────────────────────────────

/**
 * Lista los tiers de partners de una organización.
 */
export async function getPartnerTiers(
  orgId: number,
  supabase: SupabaseClient
): Promise<PartnerTier[]> {
  const { data, error } = await supabase
    .from('partner_tiers')
    .select('*')
    .eq('organization_id', orgId)
    .order('min_revenue', { ascending: true });

  if (error) {
    console.warn('[partnerService.getPartnerTiers] error:', error.message);
    return [];
  }

  return (data || []) as PartnerTier[];
}

/**
 * Crea un tier de partner.
 */
export async function createPartnerTier(
  orgId: number,
  data: PartnerTierInput,
  supabase: SupabaseClient
): Promise<PartnerTier | null> {
  const { data: result, error } = await supabase
    .from('partner_tiers')
    .insert({
      organization_id: orgId,
      name: data.name,
      min_deals: data.min_deals ?? 0,
      min_revenue: data.min_revenue ?? 0,
      commission_rate: data.commission_rate ?? 10,
      benefits: data.benefits ?? [],
    })
    .select('*')
    .single();

  if (error) throw error;

  return result as PartnerTier;
}

/**
 * Actualiza un tier de partner.
 */
export async function updatePartnerTier(
  id: string,
  orgId: number,
  data: PartnerTierUpdateInput,
  supabase: SupabaseClient
): Promise<PartnerTier | null> {
  const updateData: Record<string, unknown> = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.min_deals !== undefined) updateData.min_deals = data.min_deals;
  if (data.min_revenue !== undefined) updateData.min_revenue = data.min_revenue;
  if (data.commission_rate !== undefined) updateData.commission_rate = data.commission_rate;
  if (data.benefits !== undefined) updateData.benefits = data.benefits;

  const { data: result, error } = await supabase
    .from('partner_tiers')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('*')
    .maybeSingle();

  if (error) throw error;

  return result as PartnerTier | null;
}

/**
 * Elimina un tier de partner.
 */
export async function deletePartnerTier(
  id: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('partner_tiers')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) throw error;
}

// ─── Partner Deals ───────────────────────────────────────────────────────────

/**
 * Lista los deals de partners con filtros opcionales.
 */
export async function getPartnerDeals(
  orgId: number,
  supabase: SupabaseClient,
  filters?: PartnerDealFilters
): Promise<{ data: PartnerDeal[]; count: number }> {
  let query = supabase
    .from('partner_deals')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (filters?.partner_id) {
    query = query.eq('partner_id', filters.partner_id);
  }
  if (filters?.deal_type) {
    query = query.eq('deal_type', filters.deal_type);
  }
  if (filters?.commission_status) {
    query = query.eq('commission_status', filters.commission_status);
  }

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('[partnerService.getPartnerDeals] error:', error.message);
    return { data: [], count: 0 };
  }

  return {
    data: (data || []) as PartnerDeal[],
    count: count || 0,
  };
}

/**
 * Crea un deal de partner.
 */
export async function createPartnerDeal(
  orgId: number,
  data: PartnerDealInput,
  supabase: SupabaseClient
): Promise<PartnerDeal | null> {
  const { data: result, error } = await supabase
    .from('partner_deals')
    .insert({
      organization_id: orgId,
      partner_id: data.partner_id,
      opportunity_id: data.opportunity_id,
      deal_type: data.deal_type,
      commission_amount: data.commission_amount ?? null,
      commission_status: 'pending',
    })
    .select('*')
    .single();

  if (error) throw error;

  return result as PartnerDeal;
}

/**
 * Actualiza el estado de comisión de un partner deal.
 */
export async function updatePartnerDealStatus(
  id: string,
  orgId: number,
  status: 'pending' | 'approved' | 'paid' | 'rejected',
  supabase: SupabaseClient
): Promise<PartnerDeal | null> {
  const updateData: Record<string, unknown> = {
    commission_status: status,
  };

  if (status === 'paid') {
    updateData.commission_paid_at = new Date().toISOString();
  }

  const { data: result, error } = await supabase
    .from('partner_deals')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('*')
    .maybeSingle();

  if (error) throw error;

  return result as PartnerDeal | null;
}
