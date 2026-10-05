import {
  calcularPronostico,
  calcularFilaPronostico,
  categoriaPronostico,
  trimestreDelDia,
  type ForecastSnapshot,
  type ForecastOpportunity,
  type ForecastAdjustment,
} from "../forecastLogica";
const op = (v: Partial<ForecastOpportunity> = {}): ForecastOpportunity => ({
  id: "op",
  name: "Ejemplo",
  salesperson_id: "u",
  amount: 100,
  currency: "USD",
  status: "open",
  expected_close_date: "2026-09-30",
  closed_at: null,
  updated_at: null,
  forecast_category: null,
  probability: 70,
  is_won: false,
  is_lost: false,
  stage_name: "Propuesta",
  ...v,
});
export const snapshot = (
  v: Partial<ForecastSnapshot> = {},
): ForecastSnapshot => ({
  period: "2026-Q3",
  start: "2026-07-01",
  end: "2026-10-01",
  date: "2026-09-30",
  timezone: "UTC",
  base: "USD",
  users: [{ id: "u", first_name: "Ejemplo", last_name: null }],
  opportunities: [],
  targets: [],
  teamQuotas: [],
  rates: [],
  adjustments: [],
  snapshotToken: "trusted",
  canViewAll: true,
  canAdjust: true,
  canEditAny: false,
  currentUser: "u",
  ...v,
});
const adjustment = (
  v: Partial<ForecastAdjustment> = {},
): ForecastAdjustment => ({
  id: "a",
  user_id: "u",
  amount_before: 100,
  amount_after: 150,
  currency: "USD",
  reason_code: "upside",
  reason_text: "Acuerdo confirmado",
  adjusted_by: "admin",
  created_at: "2026-09-30T12:00:00Z",
  reverses_id: null,
  ...v,
});
describe("Pronóstico: cifras globales y categorías", () => {
  it.each([
    [24, "pipeline"],
    [25, "best_case"],
    [69, "best_case"],
    [70, "commit"],
    [100, "commit"],
    [null, "pipeline"],
  ] as const)("probabilidad %s → %s", (probability, category) =>
    expect(categoriaPronostico(op({ probability }))).toBe(category),
  );
  it("la exclusión explícita prevalece sobre la etapa y no entra a ningún pronóstico", () => {
    const row = calcularFilaPronostico(
      snapshot({ opportunities: [op({ forecast_category: "omitted" })] }),
      "u",
    );
    expect(row.commit.total).toBe(0);
    expect(row.bestCase.total).toBe(0);
    expect(row.weighted.total).toBe(0);
    expect(row.opportunities).toBe(1);
  });
  it("convierte cada moneda con la tasa vigente, acepta inversas e ignora la futura", () => {
    const s = snapshot({
      opportunities: [
        op(),
        op({ id: "cop", amount: 400000, currency: "COP", probability: 50 }),
        op({ id: "won", amount: 25, status: "won", probability: 0 }),
        op({ id: "lost", status: "lost", amount: 999999 }),
      ],
      rates: [
        {
          base_currency: "USD",
          target_currency: "COP",
          rate: 4000,
          effective_date: "2026-09-29",
        },
        {
          base_currency: "USD",
          target_currency: "COP",
          rate: 1,
          effective_date: "2026-10-01",
        },
      ],
    });
    const r = calcularFilaPronostico(s, "u");
    expect(r.won.total).toBe(25);
    expect(r.commit.total).toBe(125);
    expect(r.bestCase.total).toBe(225);
    expect(r.weighted.total).toBe(145);
  });
  it("una tasa ausente queda fuera y no presenta cobertura engañosa", () => {
    const r = calcularFilaPronostico(
      snapshot({
        opportunities: [op({ currency: "EUR" })],
        targets: [
          {
            id: "goal",
            user_id: "u",
            period: "quarterly",
            target_amount: 200,
            target_currency: "USD",
          },
        ],
      }),
      "u",
    );
    expect(r.commit.total).toBe(0);
    expect(r.commit.sinTasa[0].moneda).toBe("EUR");
    expect(r.coverage).toBeNull();
    expect(
      calcularPronostico(snapshot({ opportunities: [op({ currency: "EUR" })] }))
        .summary.commit.sinTasa[0].moneda,
    ).toBe("EUR");
  });
  it("la cuota trimestral prevalece sobre mensuales y la cuota del equipo", () => {
    const s = snapshot({
      targets: [
        {
          id: "q",
          user_id: "u",
          period: "quarterly",
          target_amount: 1000,
          target_currency: "USD",
        },
        {
          id: "m",
          user_id: "u",
          period: "monthly",
          target_amount: 300,
          target_currency: "USD",
        },
      ],
      teamQuotas: [{ id: "t", user_id: "u", amount: 999, currency: "USD" }],
    });
    expect(calcularFilaPronostico(s, "u").quota.total).toBe(1000);
    s.targets.shift();
    expect(calcularFilaPronostico(s, "u").quota.total).toBe(300);
    s.targets = [];
    expect(calcularFilaPronostico(s, "u").quota.total).toBe(999);
  });
  it("acumula ajustes y su reversión sin alterar el ponderado ni oportunidades", () => {
    const s = snapshot({
      opportunities: [op()],
      adjustments: [
        adjustment(),
        adjustment({ id: "b", amount_before: 150, amount_after: 130 }),
        adjustment({
          id: "c",
          amount_before: 130,
          amount_after: 150,
          reverses_id: "b",
          reason_code: "reversal",
        }),
      ],
    });
    const r = calcularFilaPronostico(s, "u");
    expect(r.commit.total).toBe(150);
    expect(r.weighted.total).toBe(70);
    expect(r.latestAdjustment?.id).toBe("c");
    expect(s.opportunities[0].amount).toBe(100);
  });
  it("incluye las 205 oportunidades y los vendedores sin asignar", () => {
    const s = snapshot({
      opportunities: [
        ...Array.from({ length: 205 }, (_, i) => op({ id: String(i) })),
        op({ id: "none", salesperson_id: null, amount: 50 }),
      ],
    });
    const r = calcularPronostico(s);
    expect(r.rows.find((x) => x.userId === "u")?.commit.total).toBe(20500);
    expect(r.summary.commit.total).toBe(20550);
  });
  it("deriva el trimestre de la fecha calendario de la organización", () => {
    expect(trimestreDelDia("2026-09-30")).toBe("2026-Q3");
    expect(trimestreDelDia("2026-10-01")).toBe("2026-Q4");
  });
});
