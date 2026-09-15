/**
 * F14 — matemática comercial (puro, sin I/O).
 *
 * Fórmulas (FASE-14 §3.1):
 *   CAC      = gasto de adquisición (marketing + ventas) / clientes nuevos ganados
 *   LTV      = ARPA × margen bruto × (1 / churn mensual)
 *   LTV/CAC  = LTV / CAC                      (saludable: ≥ 3)
 *   Payback  = CAC / (ARPA × margen bruto)    (meses)
 *   Churn    = 100 − retención M1 ponderada por tamaño de cohorte, solo con
 *              cohortes cuyo M1 ya cerró (`fn_cohort_retention` devuelve 0 para
 *              meses futuros y no hay que confundirlo con «nadie volvió»).
 *   NRR      = (MRR_ini + expansión − contracción − churn) / MRR_ini
 *   ARPA     = ticket medio por factura pagada del periodo: Σ(arpa_mes ×
 *              invoices_paid_mes) / Σ invoices_paid_mes. La RPC entrega por mes
 *              la media (`arpa`) y el número de facturas (`invoices_paid`);
 *              ponderar recompone la media real. Una media de medias (ronda 1)
 *              daba 104 893 donde las 21 facturas reales de la org 2 promediaban
 *              90 737,50.
 *
 * Regla de honestidad: cuando falta un insumo o el denominador es 0, el
 * resultado es `null` y `missing.<métrica>` explica por qué. Nunca se devuelve
 * un 0 que parezca una cifra real.
 *
 * Insumos que NO existen en la base: gasto de adquisición y margen bruto. Se
 * guardan en `organization_settings` (clave `crm_revenue_math`, ver
 * `revenueInputs.ts`). La retención neta de ingresos necesita facturación por
 * cliente en dos periodos, que ninguna RPC de F14 expone: queda `null` con motivo.
 */

export interface CohortForChurn {
  /** YYYY-MM-DD (primer día del mes de la cohorte). */
  cohort_month: string;
  cohort_size: number;
  retained_m1: number;
}

export interface RevenueMathInputs {
  /** Gasto de marketing + ventas del periodo (moneda de la organización). */
  acquisitionSpend: number | null;
  /** Margen bruto en % (0–100). */
  grossMarginPct: number | null;
}

export interface RevenueMathMonth {
  arpa: number | null;
  /** Facturas pagadas del mes (peso del ARPA). Sin ellas el mes no pondera. */
  invoices_paid: number;
  deals_won: number;
  revenue_collected: number;
}

export interface RevenueMathResult {
  arpa: number | null;
  newCustomers: number;
  revenueCollected: number;
  cac: number | null;
  churnRatePct: number | null;
  ltv: number | null;
  ltvCacRatio: number | null;
  paybackMonths: number | null;
  netRevenueRetentionPct: number | null;
  /** Motivo por el que cada métrica nula no se pudo calcular. */
  missing: Partial<Record<keyof Omit<RevenueMathResult, 'missing' | 'newCustomers' | 'revenueCollected'>, string>>;
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function marginFraction(grossMarginPct: number | null): number | null {
  if (!isFiniteNumber(grossMarginPct) || grossMarginPct < 0 || grossMarginPct > 100) return null;
  return grossMarginPct / 100;
}

export function computeCac(p: { acquisitionSpend: number | null; newCustomers: number }): number | null {
  if (!isFiniteNumber(p.acquisitionSpend) || p.acquisitionSpend < 0) return null;
  if (!isFiniteNumber(p.newCustomers) || p.newCustomers <= 0) return null;
  return p.acquisitionSpend / p.newCustomers;
}

export function computeLtv(p: { arpa: number | null; grossMarginPct: number | null; churnRatePct: number | null }): number | null {
  const margin = marginFraction(p.grossMarginPct);
  if (margin === null) return null;
  if (!isFiniteNumber(p.arpa) || p.arpa < 0) return null;
  if (!isFiniteNumber(p.churnRatePct) || p.churnRatePct <= 0) return null;
  return p.arpa * margin * (1 / (p.churnRatePct / 100));
}

export function computeLtvCacRatio(p: { ltv: number | null; cac: number | null }): number | null {
  if (!isFiniteNumber(p.ltv) || !isFiniteNumber(p.cac) || p.cac <= 0) return null;
  return p.ltv / p.cac;
}

export function computePaybackMonths(p: { cac: number | null; arpa: number | null; grossMarginPct: number | null }): number | null {
  const margin = marginFraction(p.grossMarginPct);
  if (margin === null || !isFiniteNumber(p.cac) || !isFiniteNumber(p.arpa)) return null;
  const monthlyGrossProfit = p.arpa * margin;
  if (monthlyGrossProfit <= 0) return null;
  return p.cac / monthlyGrossProfit;
}

/** El M1 de una cohorte es observable cuando el mes siguiente al M1 ya empezó: cohorte + 2 meses ≤ hoy. */
function m1Observable(cohortMonth: string, today: string): boolean {
  const [y, m] = cohortMonth.split('-').map(Number);
  const total = y * 12 + (m - 1) + 2;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12 + 1;
  const limit = `${ny}-${String(nm).padStart(2, '0')}-01`;
  return limit <= today;
}

export function computeChurnFromCohorts(rows: CohortForChurn[], today: string): number | null {
  let size = 0;
  let retained = 0;
  for (const r of rows) {
    if (!isFiniteNumber(r.cohort_size) || r.cohort_size <= 0) continue;
    if (!m1Observable(r.cohort_month, today)) continue;
    size += r.cohort_size;
    retained += Math.max(0, r.retained_m1 || 0);
  }
  if (size === 0) return null;
  return 100 - (retained / size) * 100;
}

export function computeNetRevenueRetention(p: { startingMrr: number; expansion: number; contraction: number; churned: number }): number | null {
  if (!isFiniteNumber(p.startingMrr) || p.startingMrr <= 0) return null;
  return ((p.startingMrr + p.expansion - p.contraction - p.churned) / p.startingMrr) * 100;
}

/**
 * ARPA del periodo ponderado por facturas pagadas. Un mes con `arpa` pero sin
 * `invoices_paid` es incoherente (la RPC solo emite `arpa` cuando hay facturas)
 * y no pesa; sin facturas en ningún mes → null.
 */
export function computeArpa(months: Array<{ arpa: number | null; invoices_paid?: number | null }>): number | null {
  let weighted = 0;
  let invoices = 0;
  for (const m of months) {
    const n = m.invoices_paid;
    if (!isFiniteNumber(m.arpa) || m.arpa <= 0 || !isFiniteNumber(n) || n <= 0) continue;
    weighted += m.arpa * n;
    invoices += n;
  }
  return invoices > 0 ? weighted / invoices : null;
}

export function computeRevenueMath(p: {
  months: RevenueMathMonth[];
  cohorts: CohortForChurn[];
  today: string;
  inputs: RevenueMathInputs;
}): RevenueMathResult {
  const missing: RevenueMathResult['missing'] = {};
  const arpa = computeArpa(p.months);
  if (arpa === null) missing.arpa = 'Sin facturas pagadas en el periodo';
  const newCustomers = p.months.reduce((s, m) => s + (m.deals_won || 0), 0);
  const revenueCollected = p.months.reduce((s, m) => s + (m.revenue_collected || 0), 0);

  const cac = computeCac({ acquisitionSpend: p.inputs.acquisitionSpend, newCustomers });
  if (cac === null) {
    missing.cac = !isFiniteNumber(p.inputs.acquisitionSpend)
      ? 'Falta el gasto de adquisición (marketing + ventas) del periodo'
      : 'Sin oportunidades ganadas en el periodo';
  }

  const churnRatePct = computeChurnFromCohorts(p.cohorts, p.today);
  if (churnRatePct === null) missing.churnRatePct = 'Ninguna cohorte de clientes con un mes completo de observación';

  const ltv = computeLtv({ arpa, grossMarginPct: p.inputs.grossMarginPct, churnRatePct });
  if (ltv === null) {
    missing.ltv = marginFraction(p.inputs.grossMarginPct) === null
      ? 'Falta el margen bruto (0–100 %)'
      : arpa === null
        ? 'Sin ARPA (no hay facturas pagadas)'
        : 'Churn 0 % o sin observar: la vida del cliente no es acotable';
  }

  const ltvCacRatio = computeLtvCacRatio({ ltv, cac });
  if (ltvCacRatio === null) missing.ltvCacRatio = 'Requiere LTV y CAC';

  const paybackMonths = computePaybackMonths({ cac, arpa, grossMarginPct: p.inputs.grossMarginPct });
  if (paybackMonths === null) missing.paybackMonths = 'Requiere CAC, ARPA y margen bruto';

  const netRevenueRetentionPct = null;
  missing.netRevenueRetentionPct = 'Requiere facturación por cliente en dos periodos; las RPC actuales no la exponen';

  return { arpa, newCustomers, revenueCollected, cac, churnRatePct, ltv, ltvCacRatio, paybackMonths, netRevenueRetentionPct, missing };
}
