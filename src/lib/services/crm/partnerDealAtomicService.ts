import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sumarEnMonedaBase,
  type ResumenMonedaBase,
  type TasaCambio,
} from "@/components/crm/kit/monedaCrm";
import { toPlainDate, resolverZonaHoraria } from "@/lib/utils/timezone";
import {
  computePartnerCommission,
  effectiveCommissionRate,
} from "./partnerCommission";
import { tierPromotion, partnerStats } from "./partnerTierFor";
import { F12Error } from "./f12Errors";
import type {
  Partner,
  PartnerTier,
  PartnerDealInput,
  RegisterDealResult,
  DealOpportunityRef,
} from "./partnerService";
interface DealBase {
  partner: Partner;
  opportunity: DealOpportunityRef;
  tiers: PartnerTier[];
  deals: {
    opportunity_id: string;
    commission_status: string;
    opportunity: { amount: number | null; currency: string | null };
  }[];
  base_currency: string | null;
  timezone: string | null;
  calendar: { timezone?: string } | null;
  rates: TasaCambio[];
}
export type PromotionBlock =
  "missing_exchange_rate" | "missing_currency" | null;

/** Existing commission/tier TS engines prepare the write; a service-only CAS RPC commits both rows. */
export async function registerPartnerDealAtomic(
  partnerId: string,
  org: number,
  input: PartnerDealInput,
  actor: string,
  session: SupabaseClient,
  writer?: SupabaseClient,
  now = new Date(),
): Promise<RegisterDealResult> {
  const opp = await session
    .from("opportunities")
    .select("id,branch_id")
    .eq("organization_id", org)
    .eq("id", input.opportunity_id)
    .maybeSingle();
  if (opp.error) throw opp.error;
  if (!opp.data)
    throw new F12Error(404, "NOT_FOUND", "Oportunidad no encontrada");
  const branch = await session.rpc("app_branch_access", {
    p_branch_id: opp.data.branch_id ?? null,
  });
  if (branch.error) throw branch.error;
  if (branch.data !== true)
    throw new F12Error(
      403,
      "BRANCH_FORBIDDEN",
      "No tienes acceso a la sucursal de la oportunidad",
    );
  const service =
    writer ??
    (await import("@/lib/supabase/server-service")).getServiceClient();
  const request = input.idempotency_key
    ? {
        p_org: org,
        p_actor: actor,
        p_partner: partnerId,
        p_opportunity: input.opportunity_id,
        p_type: input.deal_type,
        p_key: input.idempotency_key,
        p_requested: input.commission_amount ?? null,
      }
    : null;
  if (request) {
    const replay = await service.rpc("fn_crm_partner_deal_receipt", request);
    if (replay.error) throw replay.error;
    if (replay.data?.deal?.id) return replay.data as RegisterDealResult;
  }
  const read = await service.rpc("fn_crm_partner_deal_base", {
    p_org: org,
    p_actor: actor,
    p_partner: partnerId,
    p_opportunity: input.opportunity_id,
    p_now: now.toISOString(),
  });
  if (read.error) throw read.error;
  const base = read.data as DealBase;
  if (
    !base?.partner ||
    !base.opportunity ||
    !Array.isArray(base.tiers) ||
    !Array.isArray(base.deals) ||
    !Array.isArray(base.rates)
  )
    throw new Error("Contexto incompleto al registrar deal");
  if (!base.partner.is_active)
    throw new F12Error(409, "PARTNER_INACTIVE", "El partner está inactivo");
  if (base.deals.some((d) => d.opportunity_id === input.opportunity_id)) {
    // Otro intento puede haber confirmado entre lectura de receipt y snapshot.
    if (request) {
      const replay = await service.rpc("fn_crm_partner_deal_receipt", request);
      if (replay.error) throw replay.error;
      if (replay.data?.deal?.id) return replay.data as RegisterDealResult;
    }
    throw new F12Error(
      409,
      "DUPLICATE_DEAL",
      "Esta oportunidad ya está registrada para el partner",
    );
  }
  const amount = Number(base.opportunity.amount);
  if (
    base.opportunity.amount === null ||
    !Number.isFinite(amount) ||
    amount < 0
  )
    throw new F12Error(
      409,
      "AMOUNT_INVALID",
      "La oportunidad necesita un monto válido",
    );
  if (
    [
      base.partner.commission_rate,
      ...base.tiers.map((t) => t.commission_rate),
    ].some(
      (r) => !Number.isFinite(Number(r)) || Number(r) < 0 || Number(r) > 100,
    )
  )
    throw new F12Error(
      409,
      "RATE_INVALID",
      "La tasa de comisión requiere revisión",
    );
  const tier = base.tiers.find((t) => t.id === base.partner.tier_id) ?? null;
  const rate = effectiveCommissionRate(base.partner, tier),
    suggested = computePartnerCommission(amount, rate);
  const commission = input.commission_amount ?? suggested;
  if (
    !Number.isFinite(commission) ||
    commission < 0 ||
    commission > 1e12 ||
    Math.abs(commission * 100 - Math.round(commission * 100)) > 0.001
  )
    throw new F12Error(
      400,
      "COMMISSION_INVALID",
      "La comisión requiere un importe válido con hasta dos decimales",
    );
  const current = [
    ...base.deals.map((d) => ({
      commission_status: d.commission_status,
      ...d.opportunity,
    })),
    {
      commission_status: "pending",
      amount,
      currency: base.opportunity.currency,
    },
  ];
  let revenue: ResumenMonedaBase | null = null,
    blocked: PromotionBlock = null;
  if (
    !base.base_currency ||
    !/^[A-Z]{3}$/.test(base.base_currency) ||
    current.some(
      (d) =>
        !d.currency ||
        !/^[A-Z]{3}$/.test(d.currency) ||
        d.amount == null ||
        !Number.isFinite(Number(d.amount)),
    )
  )
    blocked = "missing_currency";
  else {
    const timezone = resolverZonaHoraria(
      base.timezone ?? base.calendar?.timezone,
      { donde: "partner-deal", organizationId: org },
    );
    revenue = sumarEnMonedaBase(
      current.map((d) => ({ monto: d.amount, moneda: d.currency })),
      base.base_currency,
      base.rates,
      toPlainDate(now, timezone),
    );
    if (revenue.sinTasa.length) blocked = "missing_exchange_rate";
  }
  // Native stats count, with native currency conversion supplying one comparable revenue.
  const stats = partnerStats(
    current.map((d) => ({ commission_status: d.commission_status, amount: 0 })),
  );
  const promotion =
    blocked || !revenue
      ? null
      : tierPromotion(
          base.partner.tier_id,
          { ...stats, revenue: revenue.total },
          base.tiers,
        );
  const metadata = {
    commission_rate: rate,
    promoted_to: promotion
      ? {
          id: promotion.tier.id,
          name: promotion.tier.name,
          commission_rate: promotion.tier.commission_rate,
        }
      : null,
    promotion_blocked: blocked,
    revenue,
  };
  const args = {
    p_org: org,
    p_actor: actor,
    p_partner: partnerId,
    p_opportunity: input.opportunity_id,
    p_type: input.deal_type,
    p_expected: base,
    p_commission: commission,
    p_tier: promotion?.tierId ?? null,
    p_now: now.toISOString(),
  };
  const write = request
    ? await service.rpc("fn_crm_registrar_partner_deal_auditado", {
        ...args,
        p_key: request.p_key,
        p_requested: request.p_requested,
        p_suggested: suggested,
        p_metadata: metadata,
      })
    : await service.rpc("fn_crm_registrar_partner_deal", args);
  if (write.error) throw write.error;
  if (request && write.data?.deal?.id) return write.data as RegisterDealResult;
  if (!write.data?.deal?.id)
    throw new Error("Respuesta incompleta al registrar deal");
  return {
    deal: { ...write.data.deal, opportunity: base.opportunity },
    commission_rate: rate,
    promoted_to: promotion
      ? {
          id: promotion.tier.id,
          name: promotion.tier.name,
          commission_rate: promotion.tier.commission_rate,
        }
      : null,
    promotion_blocked: blocked,
    revenue,
  };
}
