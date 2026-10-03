import { calcularPronosticoMensual } from "../forecastMensualLogica";
import {
  calcularPronostico,
  type ForecastSnapshot,
  type ForecastOpportunity,
} from "../forecastLogica";
const opportunity: ForecastOpportunity = {
  id: "o",
  name: "Oportunidad de prueba",
  salesperson_id: "u",
  amount: 100,
  currency: "USD",
  status: "open",
  expected_close_date: "2026-09-01",
  closed_at: null,
  updated_at: null,
  forecast_category: "commit",
  probability: 70,
  is_won: false,
  is_lost: false,
  stage_name: "Negociación",
};
const snapshot = (): ForecastSnapshot => ({
  period: "2026-Q3",
  start: "2026-07-01",
  end: "2026-10-01",
  date: "2026-09-30",
  timezone: "Pacific/Honolulu",
  base: "USD",
  users: [{ id: "u", first_name: "Persona", last_name: null }],
  opportunities: [opportunity],
  targets: [],
  teamQuotas: [],
  rates: [],
  adjustments: [],
  snapshotToken: "synthetic",
  canViewAll: true,
  canAdjust: true,
  canEditAny: true,
  currentUser: "u",
});
it("la fecha plana de una abierta conserva septiembre aunque el proceso cambie de zona", () => {
  const result = calcularPronosticoMensual(snapshot());
  expect(result.months.map((m) => m.summary.commit.total)).toEqual([0, 0, 100]);
  expect(result.months[2].summary.weighted.total).toBe(70);
});
it("asigna la venta cerrada al mes de la organización, no al mes UTC ni al cierre esperado", () => {
  const source = snapshot();
  source.opportunities = [
    {
      ...opportunity,
      status: "won",
      is_won: true,
      closed_at: "2026-09-01T00:30:00Z",
      expected_close_date: "2026-09-15",
    },
  ];
  expect(
    calcularPronosticoMensual(source).months.map((m) => m.summary.won.total),
  ).toEqual([0, 100, 0]);
  expect(
    calcularPronosticoMensual({ ...source, timezone: "UTC" }).months.map(
      (m) => m.summary.won.total,
    ),
  ).toEqual([0, 0, 100]);
});
it("el cierre ganado sin instante usa la misma fecha esperada de respaldo que el snapshot", () => {
  const source = snapshot();
  source.opportunities = [
    {
      ...opportunity,
      status: "won",
      closed_at: null,
      expected_close_date: "2026-08-01",
    },
  ];
  expect(
    calcularPronosticoMensual(source).months.map((m) => m.summary.won.total),
  ).toEqual([0, 100, 0]);
});
it("conserva ajustes y metas trimestrales en el trimestre, sin repartirlos ni duplicarlos", () => {
  const source = snapshot();
  source.targets = [
    {
      id: "quarter",
      user_id: "u",
      period: "quarterly",
      period_start: "2026-07-01",
      period_end: "2026-09-30",
      target_amount: 900,
      target_currency: "USD",
    },
  ];
  source.teamQuotas = [
    { id: "team", user_id: "u", amount: 600, currency: "USD" },
  ];
  source.adjustments = [
    {
      id: "adjust",
      user_id: "u",
      amount_before: 100,
      amount_after: 110,
      currency: "USD",
      reason_code: "upside",
      reason_text: "Acuerdo confirmado",
      adjusted_by: "admin",
      created_at: "2026-09-30T15:00:00Z",
      reverses_id: null,
    },
  ];
  const result = calcularPronosticoMensual(source);
  expect(result.months.map((m) => m.summary.quota.total)).toEqual([0, 0, 0]);
  expect(result.months.map((m) => m.summary.commit.total)).toEqual([0, 0, 100]);
  expect(result.quarterlyAdjustment.total).toBe(10);
  expect(calcularPronostico(source).summary.commit.total).toBe(110);
  expect(calcularPronostico(source).summary.quota.total).toBe(900);
});
it("solo presenta metas mensuales con fechas explícitas del mismo mes", () => {
  const source = snapshot();
  source.targets = [
    {
      id: "aug",
      user_id: "u",
      period: "monthly",
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      target_amount: 200,
      target_currency: "USD",
    },
    {
      id: "unknown",
      user_id: "u",
      period: "monthly",
      target_amount: 300,
      target_currency: "USD",
    },
  ];
  const result = calcularPronosticoMensual(source);
  expect(result.months.map((m) => m.summary.quota.total)).toEqual([0, 200, 0]);
  expect(result.months.map((m) => m.summary.quota.cantidad)).toEqual([0, 1, 0]);
});
it("no omite oportunidades después de la primera página de 25", () => {
  const source = snapshot();
  source.opportunities = Array.from({ length: 205 }, (_, i) => ({
    ...opportunity,
    id: `o${i}`,
  }));
  const result = calcularPronosticoMensual(source);
  expect(result.months[2].summary.commit.total).toBe(20500);
  expect(result.months[2].summary.weighted.total).toBe(14350);
});
it("una conversión ausente continúa parcial y no inventa una cuota mensual convertida", () => {
  const source = snapshot();
  source.targets = [
    {
      id: "foreign",
      user_id: "u",
      period: "monthly",
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      target_amount: 200,
      target_currency: "EUR",
    },
  ];
  const month = calcularPronosticoMensual(source).months[2];
  expect(month.summary.quota.total).toBe(0);
  expect(month.summary.quota.sinTasa).toHaveLength(1);
  expect(month.summary.quota.sinTasa[0].moneda).toBe("EUR");
});
