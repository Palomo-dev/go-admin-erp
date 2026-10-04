import { sumarEnMonedaBase } from "@/components/crm/kit/monedaCrm";
import { toPlainDate } from "@/lib/utils/dateDisplay";
import { calcularPronostico, type ForecastSnapshot } from "./forecastLogica";
import { esOportunidadGanada } from "./estadoOportunidadLogica";

/** Agrupa el snapshot completo, antes de paginar. No reparte metas ni ajustes. */
export function calcularPronosticoMensual(snapshot: ForecastSnapshot) {
  const year = Number(snapshot.start.slice(0, 4));
  const firstMonth = Number(snapshot.start.slice(5, 7));
  const months = Array.from({ length: 3 }, (_, index) => {
    const month = `${year}-${String(firstMonth + index).padStart(2, "0")}`;
    const opportunities = snapshot.opportunities.filter((opportunity) => {
      let day = opportunity.expected_close_date;
      if (esOportunidadGanada(opportunity) && opportunity.closed_at) {
        const instant = new Date(opportunity.closed_at);
        day = Number.isFinite(instant.getTime())
          ? toPlainDate(instant, snapshot.timezone)
          : null;
      }
      return day?.slice(0, 7) === month;
    });
    const monthlyTargets = snapshot.targets.filter(
      (target) =>
        target.period === "monthly" &&
        target.period_start?.slice(0, 7) === month &&
        target.period_end?.slice(0, 7) === month,
    );
    const result = calcularPronostico({
      ...snapshot,
      opportunities,
      targets: monthlyTargets,
      teamQuotas: [],
      adjustments: [],
    });
    return { month, summary: result.summary };
  });
  const quarterlyAdjustment = sumarEnMonedaBase(
    snapshot.adjustments.map((adjustment) => ({
      monto: Number(adjustment.amount_after) - Number(adjustment.amount_before),
      moneda: adjustment.currency,
      cantidad: 0,
    })),
    snapshot.base,
    snapshot.rates,
    snapshot.date,
  );
  return { months, quarterlyAdjustment };
}
