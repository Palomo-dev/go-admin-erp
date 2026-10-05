import type {
  MonthlyForecast,
  PipelineGoal,
} from "@/lib/services/forecastService";

export interface DatosGraficoPronostico {
  name: string;
  totalAmount: number;
  forecastAmount: number;
  goal?: number;
}

/** Rangos de columnas `date`: el día lo resuelve la zona de la organización. */
export function rangoMetaPronostico(
  today: string,
  period: PipelineGoal["goalPeriod"],
) {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const firstMonth =
    period === "yearly"
      ? 1
      : period === "quarterly"
        ? Math.floor((month - 1) / 3) * 3 + 1
        : month;
  const monthCount = period === "yearly" ? 12 : period === "quarterly" ? 3 : 1;
  const nextMonth = firstMonth + monthCount;
  return {
    startDay: `${year}-${String(firstMonth).padStart(2, "0")}-01`,
    endDay: `${year + (nextMonth > 12 ? 1 : 0)}-${String(((nextMonth - 1) % 12) + 1).padStart(2, "0")}-01`,
  };
}

/** Sólo presenta importes ya calculados y convertidos por el servicio canónico. */
export function agruparGraficoPronostico(
  months: MonthlyForecast[],
  period: "monthly" | "quarterly",
  goal: PipelineGoal | null,
  labels: { noDate: string; quarter: (year: string, n: number) => string },
): DatosGraficoPronostico[] {
  const groups = new Map<string, DatosGraficoPronostico>();
  const monthsInGoal =
    goal?.goalPeriod === "yearly"
      ? 12
      : goal?.goalPeriod === "quarterly"
        ? 3
        : 1;
  for (const month of months) {
    const dated = /^\d{4}-\d{2}$/.test(month.month);
    const quarter = Math.ceil(Number(month.month.slice(5, 7)) / 3);
    const key = !dated
      ? "sin-fecha"
      : period === "monthly"
        ? month.month
        : `${month.month.slice(0, 4)}-Q${quarter}`;
    const entry = groups.get(key) ?? {
      name: !dated
        ? labels.noDate
        : period === "monthly"
          ? month.monthName
          : labels.quarter(month.month.slice(0, 4), quarter),
      totalAmount: 0,
      forecastAmount: 0,
      ...(dated && goal && goal.goalAmount > 0
        ? {
            goal:
              (goal.goalAmount / monthsInGoal) * (period === "monthly" ? 1 : 3),
          }
        : {}),
    };
    entry.totalAmount += month.totalValue;
    entry.forecastAmount += month.weightedValue;
    groups.set(key, entry);
  }
  return [...groups.entries()]
    .sort(([a], [b]) =>
      a === "sin-fecha" ? 1 : b === "sin-fecha" ? -1 : a.localeCompare(b),
    )
    .map(([, value]) => value);
}
