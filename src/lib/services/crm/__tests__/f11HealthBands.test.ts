/// <reference types="jest" />
/**
 * F11 — lógica pura del health score (`healthBands.ts`): dimensiones
 * configurables desde `health_score_configs.config` (forma real verificada por
 * MCP: `{ bands: {green,yellow,red}, indicators: [{key,label,weight,direction,thresholds}] }`)
 * aplicadas sobre los campos reales de `fn_customer_health`.
 */
import {
  bandForScore,
  bandLabel,
  buildHealthAlerts,
  indicatorSourceValue,
  latestSnapshotByCustomer,
  parseHealthConfig,
  scoreFromConfig,
  scoreIndicator,
  shouldWriteSnapshot,
  trendDelta,
  type HealthIndicatorJson,
  type HealthRpcRow,
} from '../healthBands';

/** Config tal cual la sembró `fn_crm_seed_defaults` (org 100, verificada por MCP). */
const REAL_CONFIG = {
  bands: { red: 0, green: 70, yellow: 40 },
  indicators: [
    { key: 'recency', label: 'Recencia (días sin comprar)', weight: 30, direction: 'lower_better', thresholds: [{ max: 7, score: 100 }, { max: 30, score: 70 }, { max: 60, score: 40 }, { max: 999, score: 10 }] },
    { key: 'frequency', label: 'Frecuencia (compras 90d)', weight: 25, direction: 'higher_better', thresholds: [{ min: 10, score: 100 }, { min: 5, score: 75 }, { min: 2, score: 50 }, { min: 1, score: 25 }, { min: 0, score: 0 }] },
    { key: 'ltv', label: 'LTV total', weight: 25, direction: 'higher_better', thresholds: [{ min: 1000000, score: 100 }, { min: 500000, score: 75 }, { min: 100000, score: 50 }, { min: 0, score: 20 }] },
    { key: 'avg_ticket', label: 'Ticket promedio', weight: 20, direction: 'higher_better', thresholds: [{ min: 100000, score: 100 }, { min: 50000, score: 70 }, { min: 20000, score: 40 }, { min: 0, score: 10 }] },
  ],
} as const;

const ROW: HealthRpcRow = {
  customer_id: 'c1',
  invoices_12m: 6,
  revenue_12m: 600000,
  days_since_last_invoice: 20,
  days_since_last_activity: 3,
  overdue_balance: 0,
  overdue_ratio: 0,
  score: 60,
  band: 'yellow',
};

describe('parseHealthConfig', () => {
  it('acepta la forma real y rechaza basura', () => {
    const cfg = parseHealthConfig(REAL_CONFIG);
    expect(cfg?.indicators).toHaveLength(4);
    expect(cfg?.bands).toEqual({ green: 70, yellow: 40, red: 0 });
    expect(parseHealthConfig(null)).toBeNull();
    expect(parseHealthConfig('x')).toBeNull();
    expect(parseHealthConfig({ indicators: 'nope' })).toBeNull();
  });
  it('ignora indicadores sin peso positivo o sin umbrales', () => {
    const cfg = parseHealthConfig({ bands: { green: 70, yellow: 40, red: 0 }, indicators: [
      { key: 'recency', weight: 0, direction: 'lower_better', thresholds: [{ max: 7, score: 100 }] },
      { key: 'ltv', weight: 50, direction: 'higher_better', thresholds: [] },
      { key: 'frequency', weight: 50, direction: 'higher_better', thresholds: [{ min: 0, score: 10 }] },
    ] });
    expect(cfg?.indicators.map((i) => i.key)).toEqual(['frequency']);
  });
});

describe('indicatorSourceValue — mapeo a los campos reales de fn_customer_health', () => {
  it('recency=days_since_last_invoice, frequency=invoices_12m, ltv=revenue_12m, avg_ticket=revenue/invoices', () => {
    expect(indicatorSourceValue('recency', ROW)).toBe(20);
    expect(indicatorSourceValue('frequency', ROW)).toBe(6);
    expect(indicatorSourceValue('ltv', ROW)).toBe(600000);
    expect(indicatorSourceValue('avg_ticket', ROW)).toBe(100000);
    expect(indicatorSourceValue('activity', ROW)).toBe(3);
    expect(indicatorSourceValue('receivables', ROW)).toBe(0);
  });
  it('sin facturas → recency y avg_ticket son null (no 0, que se leería como "compró hoy")', () => {
    const r = { ...ROW, invoices_12m: 0, revenue_12m: 0, days_since_last_invoice: null };
    expect(indicatorSourceValue('recency', r)).toBeNull();
    expect(indicatorSourceValue('avg_ticket', r)).toBeNull();
    expect(indicatorSourceValue('desconocido', r)).toBeNull();
  });
});

describe('scoreIndicator', () => {
  const recency: HealthIndicatorJson = { ...REAL_CONFIG.indicators[0], thresholds: [...REAL_CONFIG.indicators[0].thresholds] };
  const frequency: HealthIndicatorJson = { ...REAL_CONFIG.indicators[1], thresholds: [...REAL_CONFIG.indicators[1].thresholds] };
  it('lower_better: primer umbral cuyo max cubre el valor', () => {
    expect(scoreIndicator(recency, 5)).toBe(100);
    expect(scoreIndicator(recency, 7)).toBe(100);
    expect(scoreIndicator(recency, 8)).toBe(70);
    expect(scoreIndicator(recency, 45)).toBe(40);
    expect(scoreIndicator(recency, 5000)).toBe(10); // por encima de todo: el peor
  });
  it('higher_better: primer umbral cuyo min alcanza el valor', () => {
    expect(scoreIndicator(frequency, 12)).toBe(100);
    expect(scoreIndicator(frequency, 5)).toBe(75);
    expect(scoreIndicator(frequency, 1)).toBe(25);
    expect(scoreIndicator(frequency, 0)).toBe(0);
  });
  it('valor null → el peor umbral del indicador', () => {
    expect(scoreIndicator(recency, null)).toBe(10);
    expect(scoreIndicator(frequency, null)).toBe(0);
  });
});

describe('scoreFromConfig', () => {
  it('pondera por peso normalizado y deriva la banda desde config.bands', () => {
    const cfg = parseHealthConfig(REAL_CONFIG)!;
    const r = scoreFromConfig(cfg, ROW)!;
    // recency 20d→70 (30%), frequency 6→75 (25%), ltv 600000→75 (25%), avg_ticket 100000→100 (20%)
    expect(r.score).toBe(Math.round(70 * 0.3 + 75 * 0.25 + 75 * 0.25 + 100 * 0.2)); // 79
    expect(r.band).toBe('green');
    expect(r.indicators.map((i) => i.key)).toEqual(['recency', 'frequency', 'ltv', 'avg_ticket']);
    expect(r.indicators[0]).toMatchObject({ value: 20, score: 70, weight: 30 });
  });
  it('config sin indicadores → null (se usa el score de la RPC)', () => {
    expect(scoreFromConfig({ bands: { green: 70, yellow: 40, red: 0 }, indicators: [] }, ROW)).toBeNull();
  });
  it('los pesos se normalizan aunque no sumen 100', () => {
    const cfg = parseHealthConfig({ bands: { green: 70, yellow: 40, red: 0 }, indicators: [
      { key: 'frequency', weight: 3, direction: 'higher_better', thresholds: [{ min: 0, score: 100 }] },
      { key: 'ltv', weight: 1, direction: 'higher_better', thresholds: [{ min: 0, score: 0 }] },
    ] })!;
    expect(scoreFromConfig(cfg, ROW)?.score).toBe(75);
  });
  it('el score queda acotado a 0..100 y es entero', () => {
    const cfg = parseHealthConfig({ bands: { green: 70, yellow: 40, red: 0 }, indicators: [
      { key: 'frequency', weight: 1, direction: 'higher_better', thresholds: [{ min: 0, score: 250 }] },
    ] })!;
    expect(scoreFromConfig(cfg, ROW)?.score).toBe(100);
  });
});

describe('bandForScore / bandLabel', () => {
  const bands = { green: 70, yellow: 40, red: 0 };
  it('umbrales inclusivos', () => {
    expect(bandForScore(70, bands)).toBe('green');
    expect(bandForScore(69, bands)).toBe('yellow');
    expect(bandForScore(40, bands)).toBe('yellow');
    expect(bandForScore(39, bands)).toBe('red');
    expect(bandForScore(0, bands)).toBe('red');
  });
  it('la banda siempre tiene texto (nunca solo color)', () => {
    expect(bandLabel('green')).toBe('Saludable');
    expect(bandLabel('yellow')).toBe('Atención');
    expect(bandLabel('red')).toBe('Crítico');
  });
});

describe('buildHealthAlerts — motivos con los campos reales', () => {
  it('cartera vencida → alerta roja con importe y ratio', () => {
    const a = buildHealthAlerts({ ...ROW, overdue_balance: 250000, overdue_ratio: 0.35 });
    expect(a).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'overdue', severity: 'red' })]));
    expect(a.find((x) => x.code === 'overdue')?.message).toMatch(/35 ?%/);
  });
  it('cartera vencida leve (ratio < 20 %) → amarilla', () => {
    const a = buildHealthAlerts({ ...ROW, overdue_balance: 10000, overdue_ratio: 0.05 });
    expect(a.find((x) => x.code === 'overdue')?.severity).toBe('yellow');
  });
  it('sin actividad N días y sin factura N días, con umbrales configurables', () => {
    const a = buildHealthAlerts({ ...ROW, days_since_last_activity: 45, days_since_last_invoice: 100 }, { noActivityDays: 30, noInvoiceDays: 60 });
    expect(a.map((x) => x.code).sort()).toEqual(['no_activity', 'no_invoice']);
    expect(a.find((x) => x.code === 'no_activity')?.message).toMatch(/45 días/);
    expect(a.find((x) => x.code === 'no_invoice')?.message).toMatch(/100 días/);
  });
  it('nunca registró actividad ni factura → también alerta (null no es "todo bien")', () => {
    const a = buildHealthAlerts({ ...ROW, days_since_last_activity: null, days_since_last_invoice: null, invoices_12m: 0, revenue_12m: 0 });
    expect(a.map((x) => x.code).sort()).toEqual(['no_activity', 'no_invoice']);
  });
  it('cliente sano → sin alertas', () => {
    expect(buildHealthAlerts(ROW)).toEqual([]);
  });
  it('las alertas rojas van primero', () => {
    const a = buildHealthAlerts({ ...ROW, days_since_last_activity: 40, overdue_balance: 1, overdue_ratio: 0.5 });
    expect(a[0].severity).toBe('red');
  });
});

describe('shouldWriteSnapshot', () => {
  const now = new Date('2026-09-15T08:30:00Z');
  it('sin snapshot previo → escribe', () => {
    expect(shouldWriteSnapshot({ last: null, score: 50, now, refreshIntervalHours: 24 })).toBe(true);
  });
  it('mismo score dentro del intervalo → NO escribe', () => {
    expect(shouldWriteSnapshot({ last: { score: 50, created_at: '2026-09-15T00:00:00Z' }, score: 50, now, refreshIntervalHours: 24 })).toBe(false);
  });
  it('score distinto → escribe aunque el intervalo no haya vencido', () => {
    expect(shouldWriteSnapshot({ last: { score: 50, created_at: '2026-09-15T08:00:00Z' }, score: 51, now, refreshIntervalHours: 24 })).toBe(true);
  });
  it('mismo score pero intervalo vencido → escribe (bitácora de tendencia)', () => {
    expect(shouldWriteSnapshot({ last: { score: 50, created_at: '2026-09-14T08:00:00Z' }, score: 50, now, refreshIntervalHours: 24 })).toBe(true);
    expect(shouldWriteSnapshot({ last: { score: 50, created_at: '2026-09-14T08:31:00Z' }, score: 50, now, refreshIntervalHours: 24 })).toBe(false);
  });
  it('intervalo inválido cae a 24 h', () => {
    expect(shouldWriteSnapshot({ last: { score: 50, created_at: '2026-09-14T08:00:00Z' }, score: 50, now, refreshIntervalHours: null })).toBe(true);
    expect(shouldWriteSnapshot({ last: { score: 50, created_at: '2026-09-15T00:00:00Z' }, score: 50, now, refreshIntervalHours: 0 })).toBe(false);
  });
});

describe('latestSnapshotByCustomer / trendDelta', () => {
  it('se queda con el más reciente por cliente', () => {
    const m = latestSnapshotByCustomer([
      { customer_id: 'a', score: 10, created_at: '2026-09-01T00:00:00Z' },
      { customer_id: 'a', score: 20, created_at: '2026-09-10T00:00:00Z' },
      { customer_id: 'b', score: 30, created_at: '2026-09-05T00:00:00Z' },
      { customer_id: 'a', score: 15, created_at: '2026-09-05T00:00:00Z' },
    ]);
    expect(m.get('a')?.score).toBe(20);
    expect(m.get('b')?.score).toBe(30);
  });
  it('tendencia = último − penúltimo; null con menos de dos puntos', () => {
    expect(trendDelta([{ score: 40 }, { score: 55 }, { score: 50 }])).toBe(-5);
    expect(trendDelta([{ score: 40 }])).toBeNull();
  });
});
