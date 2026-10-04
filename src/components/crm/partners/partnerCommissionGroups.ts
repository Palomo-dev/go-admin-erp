import { summarizeCommissions } from "@/lib/services/crm/partnerCommission";
import type { PartnerDealView } from "@/lib/services/crm/partnerService";

/** El motor nativo suma sólo dentro de cada moneda, con ausencia explícita. */
export function commissionGroups(rows: readonly PartnerDealView[]) {
  const currencies = new Map<string, PartnerDealView[]>();
  for (const row of rows) {
    const currency = row.opportunity?.currency?.trim().toUpperCase();
    const key = currency && /^[A-Z]{3}$/.test(currency) ? currency : "?";
    const group = currencies.get(key) ?? [];
    group.push(row);
    currencies.set(key, group);
  }
  return [...currencies].map(([currency, deals]) => ({
    currency: currency === "?" ? null : currency,
    known:
      currency !== "?" &&
      deals.every(
        (d) =>
          d.commission_amount != null &&
          Number.isFinite(Number(d.commission_amount)) &&
          Number(d.commission_amount) >= 0,
      ),
    summary: summarizeCommissions(deals),
  }));
}
