/// <reference types="jest" />
/**
 * F14 — matemática comercial pura (`revenueMath.ts`).
 * Fórmulas documentadas en el módulo; aquí se fijan con números redondos para
 * que una inversión (CAC/LTV en vez de LTV/CAC), una división por cero o un
 * `0` inventado donde falta el insumo se vean en rojo.
 */
import {
  computeCac,
  computeLtv,
  computeLtvCacRatio,
  computePaybackMonths,
  computeChurnFromCohorts,
  computeNetRevenueRetention,
  computeArpa,
  computeRevenueMath,
  type CohortForChurn,
} from '../revenueMath';

describe('CAC = gasto de adquisición / clientes nuevos ganados', () => {
  it('1 200 000 / 12 = 100 000', () => {
    expect(computeCac({ acquisitionSpend: 1_200_000, newCustomers: 12 })).toBe(100_000);
  });
  it('sin gasto (null) → null, nunca 0', () => {
    expect(computeCac({ acquisitionSpend: null, newCustomers: 12 })).toBeNull();
  });
  it('0 clientes nuevos → null (no divide por cero)', () => {
    expect(computeCac({ acquisitionSpend: 500, newCustomers: 0 })).toBeNull();
  });
  it('gasto negativo → null (insumo inválido)', () => {
    expect(computeCac({ acquisitionSpend: -1, newCustomers: 3 })).toBeNull();
  });
});

describe('LTV = ARPA × margen bruto × (1 / churn)', () => {
  it('ARPA 700, margen 60 %, churn 2 % → 700 × 0,6 / 0,02 = 21 000', () => {
    expect(computeLtv({ arpa: 700, grossMarginPct: 60, churnRatePct: 2 })).toBeCloseTo(21_000, 6);
  });
  it('churn 0 → null (vida infinita no es una cifra)', () => {
    expect(computeLtv({ arpa: 700, grossMarginPct: 60, churnRatePct: 0 })).toBeNull();
  });
  it('sin margen → null', () => {
    expect(computeLtv({ arpa: 700, grossMarginPct: null, churnRatePct: 2 })).toBeNull();
  });
  it('sin ARPA → null', () => {
    expect(computeLtv({ arpa: null, grossMarginPct: 60, churnRatePct: 2 })).toBeNull();
  });
  it('margen fuera de 0–100 → null', () => {
    expect(computeLtv({ arpa: 700, grossMarginPct: 140, churnRatePct: 2 })).toBeNull();
  });
});

describe('LTV/CAC', () => {
  it('21 000 / 7 000 = 3 (y no 7 000 / 21 000)', () => {
    expect(computeLtvCacRatio({ ltv: 21_000, cac: 7_000 })).toBeCloseTo(3, 9);
  });
  it('CAC 0 o nulo → null', () => {
    expect(computeLtvCacRatio({ ltv: 21_000, cac: 0 })).toBeNull();
    expect(computeLtvCacRatio({ ltv: 21_000, cac: null })).toBeNull();
    expect(computeLtvCacRatio({ ltv: null, cac: 7_000 })).toBeNull();
  });
});

describe('Payback (meses) = CAC / (ARPA × margen)', () => {
  it('CAC 8 400, ARPA 700, margen 60 % → 8 400 / 420 = 20 meses', () => {
    expect(computePaybackMonths({ cac: 8_400, arpa: 700, grossMarginPct: 60 })).toBeCloseTo(20, 9);
  });
  it('denominador 0 → null', () => {
    expect(computePaybackMonths({ cac: 8_400, arpa: 0, grossMarginPct: 60 })).toBeNull();
    expect(computePaybackMonths({ cac: 8_400, arpa: 700, grossMarginPct: 0 })).toBeNull();
  });
});

describe('Churn mensual desde cohortes (100 − retención M1 ponderada por tamaño)', () => {
  const rows: CohortForChurn[] = [
    { cohort_month: '2026-05-01', cohort_size: 40, retained_m1: 36 },
    { cohort_month: '2026-06-01', cohort_size: 10, retained_m1: 5 },
  ];
  it('ponderado: (36+5)/(40+10) = 82 % retenidos → churn 18 %', () => {
    expect(computeChurnFromCohorts(rows, '2026-09-15')).toBeCloseTo(18, 9);
  });
  it('solo cuenta cohortes cuyo M1 ya se pudo observar (mes de cohorte + 2 meses ≤ hoy)', () => {
    // Cohorte de agosto: su M1 es septiembre, aún no cerrado a 15 de septiembre.
    const withYoung = [...rows, { cohort_month: '2026-08-01', cohort_size: 100, retained_m1: 0 }];
    expect(computeChurnFromCohorts(withYoung, '2026-09-15')).toBeCloseTo(18, 9);
  });
  it('sin cohortes observables → null (no inventa 100 % de churn)', () => {
    expect(computeChurnFromCohorts([{ cohort_month: '2026-09-01', cohort_size: 9, retained_m1: 0 }], '2026-09-15')).toBeNull();
    expect(computeChurnFromCohorts([], '2026-09-15')).toBeNull();
  });
  it('cohortes de tamaño 0 no cuentan', () => {
    expect(computeChurnFromCohorts([{ cohort_month: '2026-01-01', cohort_size: 0, retained_m1: 0 }], '2026-09-15')).toBeNull();
  });
});

describe('Retención neta de ingresos = (MRR_ini + expansión − contracción − churn) / MRR_ini', () => {
  it('(100 + 20 − 5 − 15) / 100 = 100 %', () => {
    expect(computeNetRevenueRetention({ startingMrr: 100, expansion: 20, contraction: 5, churned: 15 })).toBeCloseTo(100, 9);
  });
  it('MRR inicial 0 → null', () => {
    expect(computeNetRevenueRetention({ startingMrr: 0, expansion: 1, contraction: 0, churned: 0 })).toBeNull();
  });
});

// r2: el ARPA se pondera por facturas pagadas (Σ arpa×n / Σ n). La media de
// medias de la ronda 1 daba 104 893 donde las 21 facturas de la org 2 promediaban 90 737,50.
describe('ARPA = ticket medio por factura pagada, ponderado por invoices_paid', () => {
  it('ignora meses sin dato (null) y pondera por facturas: (100×1 + 300×3) / 4 = 250, no 200', () => {
    expect(computeArpa([{ arpa: 100, invoices_paid: 1 }, { arpa: null, invoices_paid: 0 }, { arpa: 300, invoices_paid: 3 }])).toBe(250);
  });
  it('sin ningún mes con facturas → null (un arpa sin invoices_paid no pesa)', () => {
    expect(computeArpa([{ arpa: null, invoices_paid: 0 }, { arpa: null, invoices_paid: 0 }])).toBeNull();
    expect(computeArpa([{ arpa: 700 }])).toBeNull();
    expect(computeArpa([])).toBeNull();
  });
});

describe('computeRevenueMath (agregado)', () => {
  it('encadena las fórmulas y explica cada ausencia', () => {
    const r = computeRevenueMath({
      months: [
        { arpa: 700, invoices_paid: 2, deals_won: 6, revenue_collected: 5_000 },
        { arpa: 700, invoices_paid: 5, deals_won: 6, revenue_collected: 7_000 },
      ],
      cohorts: [{ cohort_month: '2026-01-01', cohort_size: 50, retained_m1: 49 }],
      today: '2026-09-15',
      inputs: { acquisitionSpend: 84_000, grossMarginPct: 60 },
    });
    expect(r.arpa).toBe(700);
    expect(r.newCustomers).toBe(12);
    expect(r.cac).toBe(7_000);
    expect(r.churnRatePct).toBeCloseTo(2, 9);
    expect(r.ltv).toBeCloseTo(21_000, 6);
    expect(r.ltvCacRatio).toBeCloseTo(3, 9);
    expect(r.paybackMonths).toBeCloseTo(16.6667, 3);
    expect(r.netRevenueRetentionPct).toBeNull();
    expect(r.missing.netRevenueRetentionPct).toMatch(/por cliente/);
    expect(r.missing.cac).toBeUndefined();
  });
  it('sin insumos manuales: CAC/LTV/payback nulos con motivo, ARPA y churn siguen', () => {
    const r = computeRevenueMath({
      months: [{ arpa: 500, invoices_paid: 1, deals_won: 1, revenue_collected: 100 }],
      cohorts: [{ cohort_month: '2026-01-01', cohort_size: 10, retained_m1: 9 }],
      today: '2026-09-15',
      inputs: { acquisitionSpend: null, grossMarginPct: null },
    });
    expect(r.arpa).toBe(500);
    expect(r.churnRatePct).toBeCloseTo(10, 9);
    expect(r.cac).toBeNull();
    expect(r.ltv).toBeNull();
    expect(r.paybackMonths).toBeNull();
    expect(r.missing.cac).toMatch(/gasto/i);
    expect(r.missing.ltv).toMatch(/margen/i);
  });
});
