import type { ReferralStatus } from './referralStateMachine';
import type { CommissionStatus, CommissionSummary, DealType } from './partnerCommission';
import type { ResumenMonedaBase } from '@/components/crm/kit/monedaCrm';

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
  /** Revenue atribuido de deals no rechazados, normalizado a la moneda de la organización. */
  revenue: ResumenMonedaBase | null;
}


