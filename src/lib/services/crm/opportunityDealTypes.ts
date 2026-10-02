/** Tipos comerciales compartidos por leads y oportunidades, sin dependencias de servidor. */
export const OPPORTUNITY_DEAL_TYPES = ['new', 'renewal', 'expansion', 'referral', 'partner'] as const;
export type OpportunityDealType = (typeof OPPORTUNITY_DEAL_TYPES)[number];
