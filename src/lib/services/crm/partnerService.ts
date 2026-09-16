import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computePartnerCommission,
  effectiveCommissionRate,
  summarizeCommissions,
  checkCommissionTransition,
  CommissionTransitionError,
  commissionPatch,
  type CommissionStatus,
  type CommissionSummary,
  type DealType,
} from './partnerCommission';
import { partnerStats, tierPromotion } from './partnerTierFor';
import { F12Error, notFound } from './f12Errors';

/**
 * Servicio CRM de partners (F12). Tablas: `partners`, `partner_tiers`,
 * `partner_deals` (columnas, CHECK y FK verificados por MCP el 2026-09-15).
 *
 * Hechos de la BD que condicionan el código:
 * - `partners` NO tiene UNIQUE (organization_id, email): la unicidad se
 *   comprueba aquí antes de escribir (409). Sin índice hay una ventana de
 *   carrera; la propuesta de índice queda anotada en PROGRESS, sin migración.
 * - `partners.tier_id` NO tiene FK a `partner_tiers`: se verifica pertenencia
 *   a mano y un tier en uso no se borra (409).
 * - `partner_deals` no tiene DELETE en RLS: un deal se rechaza, no se borra.
 *
 * La comisión es un REGISTRO (monto de la oportunidad × tasa efectiva); las
 * rutas de transición exigen admin/manager por id de rol. Nada de dinero real.
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
  /** 0 = hereda la tasa del tier. */
  commission_rate: number;
  is_active: boolean;
  created_at: string;
}

export interface PartnerInput {
  name: string;
  email: string;
  company_name?: string | null;
  phone?: string | null;
  tier_id?: string | null;
  commission_rate?: number;
  is_active?: boolean;
}

export type PartnerUpdateInput = Partial<PartnerInput>;

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
  benefits?: string[];
}

export type PartnerTierUpdateInput = Partial<PartnerTierInput>;

export interface PartnerDeal {
  id: string;
  organization_id: number;
  partner_id: string;
  opportunity_id: string;
  deal_type: DealType;
  commission_amount: number | null;
  commission_status: CommissionStatus;
  commission_paid_at: string | null;
  created_at: string;
}

export interface DealOpportunityRef {
  id: string;
  name: string;
  amount: number | null;
  currency: string | null;
  status: string | null;
}

export interface PartnerDealView extends PartnerDeal {
  opportunity: DealOpportunityRef | null;
}

export interface PartnerDealInput {
  opportunity_id: string;
  deal_type: DealType;
}

export interface PartnerDealFilters {
  deal_type?: string;
  commission_status?: string;
  limit?: number;
  offset?: number;
}

/** Partner con su tier resuelto y el resumen de comisiones (para la lista). */
export interface PartnerView extends Partner {
  tier: Pick<PartnerTier, 'id' | 'name' | 'commission_rate'> | null;
  effective_rate: number;
  deals_count: number;
  commissions: CommissionSummary;
  /** Moneda de las comisiones (la de las oportunidades); null sin deals. */
  commissions_currency: string | null;
  /** true si los deals mezclan monedas: la suma no se muestra. */
  currency_mixed: boolean;
}

const DEAL_SELECT = '*, opportunity:opportunities(id, name, amount, currency, status)';

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toDealView(row: Record<string, unknown>): PartnerDealView {
  return { ...(row as unknown as PartnerDeal), opportunity: one(row.opportunity as DealOpportunityRef | DealOpportunityRef[] | null) };
}

// ─── Pertenencia ─────────────────────────────────────────────────────────────

export async function getPartnerById(id: string, orgId: number, supabase: SupabaseClient): Promise<Partner | null> {
  const { data, error } = await supabase.from('partners').select('*').eq('id', id).eq('organization_id', orgId).maybeSingle();
  if (error) throw error;
  return (data as Partner | null) ?? null;
}

async function requirePartner(id: string, orgId: number, supabase: SupabaseClient): Promise<Partner> {
  const p = await getPartnerById(id, orgId, supabase);
  if (!p) throw notFound('Partner');
  return p;
}

export async function assertTierInOrg(tierId: string, orgId: number, supabase: SupabaseClient): Promise<PartnerTier> {
  const { data, error } = await supabase.from('partner_tiers').select('*').eq('id', tierId).eq('organization_id', orgId).maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('Tier');
  return data as PartnerTier;
}

/** 409 si otro partner de la organización ya usa ese correo (no hay UNIQUE en la BD). */
export async function assertEmailFree(email: string, orgId: number, supabase: SupabaseClient, excludeId?: string): Promise<void> {
  let query = supabase.from('partners').select('id').eq('organization_id', orgId).ilike('email', email).limit(2);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query;
  if (error) throw error;
  if (((data as unknown[] | null) ?? []).length > 0) {
    throw new F12Error(409, 'DUPLICATE_EMAIL', `Ya existe un partner con el correo ${email} en esta organización`);
  }
}

// ─── Partners ────────────────────────────────────────────────────────────────

export async function getPartners(orgId: number, supabase: SupabaseClient): Promise<PartnerView[]> {
  const [{ data: partners, error: e1 }, tiers, { data: deals, error: e3 }] = await Promise.all([
    supabase.from('partners').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }),
    getPartnerTiers(orgId, supabase),
    supabase.from('partner_deals').select('partner_id, commission_status, commission_amount, opportunity:opportunities(currency)').eq('organization_id', orgId),
  ]);
  if (e1) throw e1;
  if (e3) throw e3;
  const tierById = new Map(tiers.map((t) => [t.id, t]));
  type DealRow = { partner_id: string; commission_status: string; commission_amount: number | null; opportunity: { currency: string | null } | { currency: string | null }[] | null };
  const dealsByPartner = new Map<string, DealRow[]>();
  for (const d of (deals as DealRow[] | null) ?? []) {
    const list = dealsByPartner.get(d.partner_id) ?? [];
    list.push(d);
    dealsByPartner.set(d.partner_id, list);
  }
  return ((partners as Partner[] | null) ?? []).map((p) => {
    const tier = p.tier_id ? tierById.get(p.tier_id) ?? null : null;
    const own = dealsByPartner.get(p.id) ?? [];
    const currencies = Array.from(new Set(own.map((d) => (one(d.opportunity)?.currency ?? '').trim().toUpperCase()).filter(Boolean)));
    return {
      ...p,
      tier: tier ? { id: tier.id, name: tier.name, commission_rate: tier.commission_rate } : null,
      effective_rate: effectiveCommissionRate(p, tier),
      deals_count: own.filter((d) => d.commission_status !== 'rejected').length,
      commissions: summarizeCommissions(own),
      commissions_currency: currencies.length === 1 ? currencies[0] : null,
      currency_mixed: currencies.length > 1,
    };
  });
}

export async function createPartner(orgId: number, data: PartnerInput, supabase: SupabaseClient): Promise<Partner> {
  await assertEmailFree(data.email, orgId, supabase);
  if (data.tier_id) await assertTierInOrg(data.tier_id, orgId, supabase);
  const { data: result, error } = await supabase
    .from('partners')
    .insert({
      organization_id: orgId,
      name: data.name,
      company_name: data.company_name ?? null,
      email: data.email,
      phone: data.phone ?? null,
      tier_id: data.tier_id ?? null,
      commission_rate: data.commission_rate ?? 0,
      is_active: data.is_active ?? true,
    })
    .select('*')
    .single();
  if (error) throw error;
  return result as Partner;
}

export async function updatePartner(id: string, orgId: number, data: PartnerUpdateInput, supabase: SupabaseClient): Promise<Partner | null> {
  const current = await getPartnerById(id, orgId, supabase);
  if (!current) return null;
  if (data.email !== undefined && data.email !== current.email) await assertEmailFree(data.email, orgId, supabase, id);
  if (data.tier_id) await assertTierInOrg(data.tier_id, orgId, supabase);
  const { data: result, error } = await supabase.from('partners').update(data).eq('id', id).eq('organization_id', orgId).select('*').maybeSingle();
  if (error) throw error;
  return (result as Partner | null) ?? null;
}

/** Devuelve `false` si no existía en la organización. Borra en cascada sus deals (FK). */
export async function deletePartner(id: string, orgId: number, supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.from('partners').delete().eq('id', id).eq('organization_id', orgId).select('id');
  if (error) throw error;
  return ((data as unknown[] | null) ?? []).length > 0;
}

// ─── Tiers ───────────────────────────────────────────────────────────────────

export async function getPartnerTiers(orgId: number, supabase: SupabaseClient): Promise<PartnerTier[]> {
  const { data, error } = await supabase
    .from('partner_tiers')
    .select('*')
    .eq('organization_id', orgId)
    .order('min_revenue', { ascending: true })
    .order('min_deals', { ascending: true });
  if (error) throw error;
  return (data || []) as PartnerTier[];
}

export async function createPartnerTier(orgId: number, data: PartnerTierInput, supabase: SupabaseClient): Promise<PartnerTier> {
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

export async function updatePartnerTier(id: string, orgId: number, data: PartnerTierUpdateInput, supabase: SupabaseClient): Promise<PartnerTier | null> {
  const { data: result, error } = await supabase.from('partner_tiers').update(data).eq('id', id).eq('organization_id', orgId).select('*').maybeSingle();
  if (error) throw error;
  return (result as PartnerTier | null) ?? null;
}

/** 409 si algún partner de la organización lo usa (no hay FK que lo impida); `false` si no existía. */
export async function deletePartnerTier(id: string, orgId: number, supabase: SupabaseClient): Promise<boolean> {
  const { data: users, error: e1 } = await supabase.from('partners').select('id').eq('organization_id', orgId).eq('tier_id', id).limit(1);
  if (e1) throw e1;
  if (((users as unknown[] | null) ?? []).length > 0) {
    throw new F12Error(409, 'TIER_IN_USE', 'Hay partners en este tier: muévelos a otro antes de borrarlo');
  }
  const { data, error } = await supabase.from('partner_tiers').delete().eq('id', id).eq('organization_id', orgId).select('id');
  if (error) throw error;
  return ((data as unknown[] | null) ?? []).length > 0;
}

// ─── Deals ───────────────────────────────────────────────────────────────────

export async function getPartnerDeals(partnerId: string, orgId: number, supabase: SupabaseClient, filters?: PartnerDealFilters): Promise<{ data: PartnerDealView[]; count: number }> {
  await requirePartner(partnerId, orgId, supabase);
  let query = supabase
    .from('partner_deals')
    .select(DEAL_SELECT, { count: 'exact' })
    .eq('organization_id', orgId)
    .eq('partner_id', partnerId)
    .order('created_at', { ascending: false });
  if (filters?.deal_type) query = query.eq('deal_type', filters.deal_type);
  if (filters?.commission_status) query = query.eq('commission_status', filters.commission_status);
  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  query = query.range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw error;
  return { data: ((data as Record<string, unknown>[] | null) ?? []).map(toDealView), count: count ?? 0 };
}

export interface RegisterDealResult {
  deal: PartnerDealView;
  commission_rate: number;
  /** Tier al que subió el partner con este deal, si subió. */
  promoted_to: Pick<PartnerTier, 'id' | 'name' | 'commission_rate'> | null;
}

/**
 * Registra un deal: la oportunidad debe ser de la organización (404), la
 * comisión se calcula en servidor (monto × tasa efectiva) y luego se evalúa la
 * promoción de tier con todos los deals no rechazados del partner.
 * Dos escrituras (deal, tier): si la promoción falla, el deal queda y se
 * reevalúa en el siguiente; se registra el fallo.
 */
export async function registerPartnerDeal(partnerId: string, orgId: number, input: PartnerDealInput, supabase: SupabaseClient): Promise<RegisterDealResult> {
  const partner = await requirePartner(partnerId, orgId, supabase);
  const { data: opp, error: eOpp } = await supabase
    .from('opportunities')
    .select('id, name, amount, currency, status')
    .eq('id', input.opportunity_id)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (eOpp) throw eOpp;
  if (!opp) throw notFound('Oportunidad');

  const { data: dup, error: eDup } = await supabase
    .from('partner_deals')
    .select('id')
    .eq('organization_id', orgId)
    .eq('partner_id', partnerId)
    .eq('opportunity_id', input.opportunity_id)
    .neq('commission_status', 'rejected')
    .limit(1);
  if (eDup) throw eDup;
  if (((dup as unknown[] | null) ?? []).length > 0) {
    throw new F12Error(409, 'DUPLICATE_DEAL', 'Esta oportunidad ya está registrada como deal de este partner');
  }

  const tiers = await getPartnerTiers(orgId, supabase);
  const tier = partner.tier_id ? tiers.find((t) => t.id === partner.tier_id) ?? null : null;
  const rate = effectiveCommissionRate(partner, tier);
  const commission = computePartnerCommission((opp as { amount: unknown }).amount, rate);

  const { data: deal, error } = await supabase
    .from('partner_deals')
    .insert({
      organization_id: orgId,
      partner_id: partnerId,
      opportunity_id: input.opportunity_id,
      deal_type: input.deal_type,
      commission_amount: commission,
      commission_status: 'pending',
    })
    .select(DEAL_SELECT)
    .single();
  if (error) throw error;

  let promotedTo: RegisterDealResult['promoted_to'] = null;
  const { data: all, error: eAll } = await supabase
    .from('partner_deals')
    .select('commission_status, opportunity:opportunities(amount)')
    .eq('organization_id', orgId)
    .eq('partner_id', partnerId);
  if (eAll) {
    console.error('[partnerService.registerPartnerDeal] no se pudo evaluar la promoción:', eAll.message);
  } else {
    const stats = partnerStats(
      ((all as Array<{ commission_status: string; opportunity: { amount: unknown } | { amount: unknown }[] | null }> | null) ?? []).map((d) => ({
        commission_status: d.commission_status,
        amount: one(d.opportunity)?.amount as number | string | null | undefined,
      })),
    );
    const promotion = tierPromotion(partner.tier_id, stats, tiers);
    if (promotion) {
      const { error: eTier } = await supabase.from('partners').update({ tier_id: promotion.tierId }).eq('id', partnerId).eq('organization_id', orgId);
      if (eTier) console.error('[partnerService.registerPartnerDeal] no se pudo promocionar el tier:', eTier.message);
      else promotedTo = { id: promotion.tier.id, name: promotion.tier.name, commission_rate: promotion.tier.commission_rate };
    }
  }

  return { deal: toDealView(deal as Record<string, unknown>), commission_rate: rate, promoted_to: promotedTo };
}

/** Transición de comisión por la máquina pura, con guarda optimista: dos «pagar» concurrentes → uno gana, el otro 409. */
export async function transitionPartnerDeal(dealId: string, partnerId: string, orgId: number, to: unknown, supabase: SupabaseClient, now: Date = new Date()): Promise<PartnerDealView> {
  const { data: current, error: eCur } = await supabase
    .from('partner_deals')
    .select('id, commission_status')
    .eq('id', dealId)
    .eq('partner_id', partnerId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (eCur) throw eCur;
  if (!current) throw notFound('Deal');
  const check = checkCommissionTransition((current as { commission_status: string }).commission_status, to);
  if (!check.ok) throw new CommissionTransitionError(check);
  const { data, error } = await supabase
    .from('partner_deals')
    .update(commissionPatch(to as CommissionStatus, now))
    .eq('id', dealId)
    .eq('organization_id', orgId)
    .eq('commission_status', (current as { commission_status: string }).commission_status)
    .select(DEAL_SELECT)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new F12Error(409, 'CONCURRENT_CHANGE', 'La comisión cambió de estado mientras se procesaba; recarga la lista.');
  return toDealView(data as Record<string, unknown>);
}
