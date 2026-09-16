/// <reference types="jest" />
/**
 * F14 — ronda 2, pruebas del tester. Filas reales de `fn_revenue_metrics`
 * reescrita (espina de meses, 14 columnas; verificado en pg_proc el 2026-09-15)
 * y los seis casos límite pedidos por el orquestador.
 */

import { computeArpa, computeRevenueMath } from '../revenueMath';
import { computeFunnelConversion } from '../funnelConversion';
import { summarizeRevenueMetrics, monthHasData } from '../../revenueOsService';
import type { RevenueMetricRow } from '../rpc';
import { fmtMoney, SIN_DATOS } from '@/components/crm/revenueos/formatters';
import { collectedHint, arpaHint, winRateHint } from '@/components/crm/revenueos/kpiHints';
import { fmtDays, fmtPct } from '@/components/crm/revenueos/formatters';

const TODAY = '2026-09-15';

function spineRow(month: string, over: Partial<RevenueMetricRow> = {}): RevenueMetricRow {
  return {
    month,
    deals_won: 0,
    deals_lost: 0,
    deals_open: 0,
    revenue_won_pipeline: 0,
    revenue_lost: 0,
    revenue_pipeline: 0,
    arpa: null,
    avg_sales_cycle_days: null,
    win_rate: null,
    revenue_collected: 0,
    commissions_paid: 0,
    revenue_collected_linked: 0,
    invoices_paid: 0,
    ...over,
  };
}

/** fn_revenue_metrics(135, '2025-10-01', '2026-10-01') — 12 filas, solo ago/sep con dato. */
const ORG135: RevenueMetricRow[] = [
  ...['2025-10-01', '2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01'].map((m) => spineRow(m)),
  spineRow('2026-08-01', { arpa: 65902.17391304348, invoices_paid: 46, revenue_collected: 3031500 }),
  spineRow('2026-09-01', { deals_open: 19, arpa: 61136.40350877193, invoices_paid: 228, revenue_collected: 13939100 }),
];

describe('F14 r2 tester — org 135 con la RPC nueva', () => {
  const s = summarizeRevenueMetrics(ORG135);
  it('cobrado 16 970 600 (ago 3 031 500 + sep 13 939 100), 0 enlazado, agosto visible', () => {
    expect(s.revenue_collected).toBe(16970600);
    expect(s.revenue_collected_linked).toBe(0);
    expect(ORG135.filter(monthHasData).map((r) => r.month)).toEqual(['2026-08-01', '2026-09-01']);
    expect(s.months_with_data).toBe(2);
  });
  it('ARPA ponderado (46×65 902,17 + 228×61 136,40) / 274 = 61 936,50 = AVG(total) de las 274 facturas', () => {
    expect(s.arpa).toBeCloseTo(61936.4963, 3);
    expect(s.invoices_paid).toBe(274);
  });
  it('win rate y ciclo siguen null aunque la espina traiga 10 meses en 0', () => {
    expect(s.win_rate_pct).toBeNull();
    expect(s.avg_sales_cycle_days).toBeNull();
  });
});

describe('F14 r2 tester — casos límite pedidos', () => {
  it('(1) espina de 36 meses en 0: KPIs «Sin datos», nunca «0 %» ni «0 d»; cobrado 0 con hint honesto', () => {
    const rows = Array.from({ length: 36 }, (_, i) => spineRow(`${2023 + Math.floor((9 + i) / 12)}-${String(((9 + i) % 12) + 1).padStart(2, '0')}-01`));
    const s = summarizeRevenueMetrics(rows);
    expect(s.months_with_data).toBe(0);
    expect(s.win_rate_pct).toBeNull();
    expect(s.avg_sales_cycle_days).toBeNull();
    expect(s.arpa).toBeNull();
    expect(fmtPct(s.win_rate_pct)).toBe(SIN_DATOS);
    expect(fmtDays(s.avg_sales_cycle_days)).toBe(SIN_DATOS);
    expect(fmtMoney(s.arpa, 'COP')).toBe(SIN_DATOS);
    expect(winRateHint(s)).toMatch(/Sin cierres/);
    expect(arpaHint(s)).toMatch(/Sin facturas pagadas/);
    expect(collectedHint(s, 'COP')).toMatch(/Sin pagos completados/);
    const m = computeRevenueMath({ months: rows, cohorts: [], today: TODAY, inputs: { acquisitionSpend: 1000, grossMarginPct: 50 } });
    expect(m.cac).toBeNull();
    expect(m.missing.cac).toMatch(/Sin oportunidades ganadas/);
    expect(m.arpa).toBeNull();
  });

  it('(2) invoices_paid 0 con arpa no nulo (fila incoherente) no pesa: el ARPA es el del mes sano; solo filas así → null', () => {
    expect(computeArpa([{ arpa: 999999, invoices_paid: 0 }, { arpa: 100, invoices_paid: 2 }])).toBe(100);
    expect(computeArpa([{ arpa: 999999, invoices_paid: 0 }])).toBeNull();
    expect(computeArpa([{ arpa: 999999 }])).toBeNull();
  });

  it('(3) sin etapa is_won: overallBasis = "last" y la global se calcula hasta la última etapa (decisión: aceptable solo porque la UI lo declara; 0 de 14 pipelines reales carecen de ganada)', () => {
    const c = computeFunnelConversion([
      { stage_id: 'a', stage_name: 'Lead', position: 0, opportunity_count: 2, total_amount: 0 },
      { stage_id: 'b', stage_name: 'Demo', position: 1, opportunity_count: 1, total_amount: 0 },
    ]);
    expect(c.overallBasis).toBe('last');
    expect(c.overallPct).toBeCloseTo(33.33, 1);
    expect(computeFunnelConversion([]).overallBasis).toBeNull();
  });

  it('(4) fila corrupta revenue_collected_linked > revenue_collected: la cifra mostrada es revenue_collected y el hint no inventa una cantidad', () => {
    const s = summarizeRevenueMetrics([spineRow('2026-09-01', { revenue_collected: 100, revenue_collected_linked: 250, invoices_paid: 1, arpa: 100 })]);
    expect(s.revenue_collected).toBe(100);
    const hint = collectedHint(s, 'COP');
    expect(hint).not.toMatch(/250/);
    expect(hint).toMatch(/enlazadas a oportunidades/);
  });

  it('(5) moneda null: número sin símbolo y sin COP inventado; con COP símbolo; null de valor → «Sin datos»', () => {
    expect(fmtMoney(16970600, null)).toBe('16.970.600');
    expect(fmtMoney(16970600, null)).not.toMatch(/\$|COP/);
    expect(fmtMoney(16970600, 'COP')).toMatch(/\$/);
    expect(fmtMoney(null, 'COP')).toBe(SIN_DATOS);
    expect(fmtMoney(12, 'XXXX')).toBe('12 XXXX');
  });

  it('(6) fetchPipelines filtra por organización: con señuelo de otra org solo vuelve la propia', async () => {
    const { fetchPipelines } = await import('../rpc');
    const { createFakeSupabase } = await import('./revenueOsFakeSupabase');
    const db = {
      rpcCalls: [],
      writes: [],
      reads: [],
      rpc: {},
      rows: { pipelines: [{ id: 'p-2', organization_id: 2, name: 'Ventas' }, { id: 'p-121', organization_id: 121, name: 'Ajeno' }] },
    };
    const list = await fetchPipelines(2, createFakeSupabase(db) as never);
    expect(list).toEqual([{ id: 'p-2', name: 'Ventas' }]);
  });
});

describe('F14 r2 tester — R09: un error al leer la moneda base es 502, no «sin moneda»', () => {
  it('getRevenueCurrency convierte el fallo de getOrgBaseCurrency en RevenueOsError (502) en vez de devolver null', async () => {
    jest.resetModules();
    jest.doMock('../../salesTargetService', () => ({
      getOrgBaseCurrency: async () => {
        throw new Error('organization_currencies: permission denied');
      },
    }));
    const { getRevenueCurrency, RevenueOsError } = await import('../../revenueOsService');
    await expect(getRevenueCurrency(2, {} as never)).rejects.toBeInstanceOf(RevenueOsError);
    await expect(getRevenueCurrency(2, {} as never)).rejects.toMatchObject({ statusCode: 502 });
    jest.dontMock('../../salesTargetService');
  });
});
