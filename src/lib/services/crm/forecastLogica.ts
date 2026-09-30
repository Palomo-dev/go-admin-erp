/** Pronóstico por categorías; conversión y probabilidad comparten el núcleo existente. */
import {
  sumarEnMonedaBase,
  type MontoEnMoneda,
  type TasaCambio,
} from "@/components/crm/kit/monedaCrm";
import { probabilityToFraction } from "./revenueOs/forecastScenarios";
export const FORECAST_CATEGORIES = [
  "commit",
  "best_case",
  "pipeline",
  "omitted",
] as const;
export type ForecastCategory = (typeof FORECAST_CATEGORIES)[number];
export interface ForecastOpportunity {
  id: string;
  name: string;
  salesperson_id: string | null;
  amount: number | string | null;
  currency: string | null;
  status: string;
  expected_close_date: string | null;
  closed_at: string | null;
  updated_at: string | null;
  forecast_category: ForecastCategory | null;
  probability: number | null;
  is_won: boolean | null;
  is_lost: boolean | null;
  stage_name: string;
}
export interface ForecastAdjustment {
  id: string;
  user_id: string;
  amount_before: number | string;
  amount_after: number | string;
  currency: string;
  reason_code: string;
  reason_text: string;
  adjusted_by: string;
  created_at: string;
  reverses_id: string | null;
  author?: string;
}
export interface ForecastSnapshot {
  period: string;
  start: string;
  end: string;
  date: string;
  timezone: string;
  base: string;
  users: { id: string; first_name: string | null; last_name: string | null }[];
  opportunities: ForecastOpportunity[];
  targets: {
    id: string;
    user_id: string;
    period: string;
    target_amount: number | string;
    target_currency: string;
  }[];
  teamQuotas: {
    id: string;
    user_id: string;
    amount: number | string;
    currency: string;
  }[];
  rates: TasaCambio[];
  adjustments: ForecastAdjustment[];
  snapshotToken: string;
  canViewAll: boolean;
  canAdjust: boolean;
  canEditAny: boolean;
  currentUser: string | null;
}
export function trimestreDelDia(day: string): string {
  return `${day.slice(0, 4)}-Q${Math.ceil(Number(day.slice(5, 7)) / 3)}`;
}
export function categoriaPronostico(o: ForecastOpportunity): ForecastCategory {
  if (o.forecast_category) return o.forecast_category;
  const probability = probabilityToFraction(o.probability);
  return probability >= 0.7
    ? "commit"
    : probability >= 0.25
      ? "best_case"
      : "pipeline";
}
function montos(
  opps: ForecastOpportunity[],
  weighted = false,
): MontoEnMoneda[] {
  return opps.map((o) => ({
    monto:
      Number(o.amount ?? 0) *
      (weighted ? probabilityToFraction(o.probability) : 1),
    moneda: o.currency,
  }));
}
function cuotaPara(s: ForecastSnapshot, user: string | null): MontoEnMoneda[] {
  const targets = s.targets.filter((t) => t.user_id === user);
  const quarterly = targets.filter((t) => t.period === "quarterly");
  const chosen = quarterly.length
    ? quarterly
    : targets.filter((t) => t.period === "monthly");
  if (chosen.length)
    return chosen.map((t) => ({
      monto: t.target_amount,
      moneda: t.target_currency,
    }));
  return s.teamQuotas
    .filter((t) => t.user_id === user)
    .map((t) => ({ monto: t.amount, moneda: t.currency }));
}
export function calcularFilaPronostico(
  s: ForecastSnapshot,
  user: string | null,
) {
  const opps = s.opportunities.filter((o) => o.salesperson_id === user);
  const open = opps.filter(
    (o) =>
      o.status === "open" &&
      !o.is_lost &&
      !o.is_won &&
      categoriaPronostico(o) !== "omitted",
  );
  const won = montos(opps.filter((o) => o.status === "won" || o.is_won));
  const committed = open.filter((o) => categoriaPronostico(o) === "commit");
  const best = open.filter((o) =>
    ["commit", "best_case"].includes(categoriaPronostico(o)),
  );
  const adjustments = s.adjustments.filter((a) => a.user_id === user);
  const delta = adjustments.map((a) => ({
    monto: Number(a.amount_after) - Number(a.amount_before),
    moneda: a.currency,
    cantidad: 0,
  }));
  const sum = (values: MontoEnMoneda[]) =>
    sumarEnMonedaBase(values, s.base, s.rates, s.date);
  const quota = sum(cuotaPara(s, user));
  const commit = sum([...won, ...montos(committed), ...delta]);
  return {
    userId: user,
    name: s.users.find((u) => u.id === user),
    opportunities: opps.length,
    quota,
    won: sum(won),
    calculatedCommit: sum([...won, ...montos(committed)]),
    commit,
    bestCase: sum([...won, ...montos(best), ...delta]),
    weighted: sum([...won, ...montos(open, true)]),
    adjustment: sum(delta),
    latestAdjustment: adjustments.at(-1) ?? null,
    coverage:
      quota.total > 0 && !quota.sinTasa.length && !commit.sinTasa.length
        ? commit.total / quota.total
        : null,
  };
}
export function calcularPronostico(s: ForecastSnapshot) {
  const ids = new Set<string | null>([
    ...s.opportunities.map((o) => o.salesperson_id),
    ...s.targets.map((t) => t.user_id),
    ...s.teamQuotas.map((t) => t.user_id),
    ...s.adjustments.map((a) => a.user_id),
    ...(s.currentUser ? [s.currentUser] : []),
  ]);
  const rows = [...ids].map((id) => calcularFilaPronostico(s, id));
  const sumGroups = (
    key: "quota" | "won" | "commit" | "bestCase" | "weighted",
  ) =>
    sumarEnMonedaBase(
      rows.flatMap((row) =>
        row[key].grupos.map((g) => ({
          monto: g.monto,
          moneda: g.moneda,
          cantidad: g.cantidad,
        })),
      ),
      s.base,
      s.rates,
      s.date,
    );
  return {
    rows,
    summary: {
      quota: sumGroups("quota"),
      won: sumGroups("won"),
      commit: sumGroups("commit"),
      bestCase: sumGroups("bestCase"),
      weighted: sumGroups("weighted"),
    },
  };
}
