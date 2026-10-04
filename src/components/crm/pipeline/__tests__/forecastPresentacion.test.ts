import {
  agruparGraficoPronostico,
  rangoMetaPronostico,
} from "../forecastPresentacion";
import type {
  MonthlyForecast,
  PipelineGoal,
} from "@/lib/services/forecastService";

const month = (
  key: string,
  gross: number,
  weighted: number,
): MonthlyForecast => ({
  month: key,
  monthName: key,
  totalValue: gross,
  weightedValue: weighted,
  opportunityCount: 1,
  opportunities: [],
});
const labels = {
  noDate: "Sin fecha",
  quarter: (year: string, n: number) => `T${n} ${year}`,
};

describe("Presentación del pronóstico ya calculado", () => {
  it("suma cada mes una vez por trimestre y conserva el cero y el grupo sin fecha", () => {
    const result = agruparGraficoPronostico(
      [
        month("2026-11", 100, 0),
        month("2026-10", 200, 100),
        month("2027-01", 500, 500),
        month("sin-fecha", 50, 0),
      ],
      "quarterly",
      { goalAmount: 1000, goalCurrency: "USD", goalPeriod: "monthly" },
      labels,
    );
    expect(result).toEqual([
      { name: "T4 2026", totalAmount: 300, forecastAmount: 100, goal: 3000 },
      { name: "T1 2027", totalAmount: 500, forecastAmount: 500, goal: 3000 },
      { name: "Sin fecha", totalAmount: 50, forecastAmount: 0 },
    ]);
  });

  it.each([
    ["monthly", "monthly", 1200],
    ["monthly", "quarterly", 3600],
    ["quarterly", "monthly", 400],
    ["quarterly", "quarterly", 1200],
    ["yearly", "monthly", 100],
    ["yearly", "quarterly", 300],
  ] as const)(
    "adapta la meta %s a vista %s sin cambiar el ponderado",
    (goalPeriod, period, amount) => {
      const result = agruparGraficoPronostico(
        [month("2026-10", 200, 100)],
        period,
        { goalAmount: 1200, goalCurrency: "USD", goalPeriod },
        labels,
      );
      expect(result[0].goal).toBe(amount);
      expect(result[0].forecastAmount).toBe(100);
    },
  );

  it.each([
    ["2026-10-04", "monthly", "2026-10-01", "2026-11-01"],
    ["2026-12-31", "monthly", "2026-12-01", "2027-01-01"],
    ["2026-10-04", "quarterly", "2026-10-01", "2027-01-01"],
    ["2026-03-31", "quarterly", "2026-01-01", "2026-04-01"],
    ["2026-10-04", "yearly", "2026-01-01", "2027-01-01"],
  ] as Array<[string, PipelineGoal["goalPeriod"], string, string]>)(
    "rango %s %s incluye sólo su período y cruza el año",
    (day, period, startDay, endDay) => {
      expect(rangoMetaPronostico(day, period)).toEqual({ startDay, endDay });
    },
  );
});
