/// <reference types="jest" />
/**
 * Reportes de ingresos comerciales del CRM (antes el tablero «Pronóstico ›
 * Análisis»). Se simulan solo las lecturas; el cálculo es el real de
 * `revenueOsService` y de los módulos puros `revenueOs/*`.
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

const getRevenueMetrics = jest.fn();
const getCohortRetention = jest.fn();
const getRevenueInputs = jest.fn();
jest.mock('@/lib/services/crm/revenueOsService', () => ({
  ...jest.requireActual('@/lib/services/crm/revenueOsService'),
  getRevenueMetrics: (...a: unknown[]) => getRevenueMetrics(...a),
  getCohortRetention: (...a: unknown[]) => getCohortRetention(...a),
  getRevenueInputs: (...a: unknown[]) => getRevenueInputs(...a),
  getRevenueCurrency: async () => 'COP',
  getOrgTimezoneServer: async () => 'America/Bogota',
}));
const fetchPipelines = jest.fn();
const fetchPipelineFunnel = jest.fn();
jest.mock('@/lib/services/crm/revenueOs/rpc', () => ({
  ...jest.requireActual('@/lib/services/crm/revenueOs/rpc'),
  fetchPipelines: (...a: unknown[]) => fetchPipelines(...a),
  fetchPipelineFunnel: (...a: unknown[]) => fetchPipelineFunnel(...a),
}));

import { crmIngresosReports } from '../modulos/crmIngresosReports';
import { getReporteById } from '../reportesCatalogo';
import type { PeriodoCierre, ReportesClient } from '../types';

const periodo: PeriodoCierre = { tipo: 'trimestral', fechaInicio: '2026-07-01', fechaFin: '2026-09-30', etiqueta: 'T3 2026' };
const db = {} as ReportesClient;
const def = (id: string) => crmIngresosReports.find((r) => r.id === id)!;

const mes = (month: string, extra: Record<string, number | null> = {}) => ({
  month, deals_won: 0, deals_lost: 0, deals_open: 0, revenue_won_pipeline: 0, revenue_lost: 0, revenue_pipeline: 0,
  arpa: null, avg_sales_cycle_days: null, win_rate: null, revenue_collected: 0, commissions_paid: 0,
  revenue_collected_linked: 0, invoices_paid: 0, ...extra,
});

beforeEach(() => jest.clearAllMocks());

describe('catálogo', () => {
  test('los cinco reportes están en el grupo «clientes», módulo CRM, de toda la organización', () => {
    for (const r of crmIngresosReports) {
      expect(getReporteById(r.id)).toMatchObject({ grupo: 'clientes', modulo: 'crm', alcance: 'organizacion' });
    }
    expect(crmIngresosReports.map((r) => r.id)).toEqual([
      'crm-ingresos-mensual', 'crm-conversion-embudo', 'crm-escenarios-forecast', 'crm-cohortes-retencion', 'crm-matematica-comercial',
    ]);
  });
});

describe('crm-ingresos-mensual', () => {
  test('el periodo va a la RPC con fin exclusivo y el resumen sale de summarizeRevenueMetrics', async () => {
    getRevenueMetrics.mockResolvedValue([
      mes('2026-07-01', { deals_won: 1, deals_lost: 3, win_rate: 0.25, revenue_collected: 1000, revenue_won_pipeline: 500, arpa: 100, invoices_paid: 10 }),
      mes('2026-08-01'),
      mes('2026-09-01', { arpa: 400, invoices_paid: 10, revenue_collected: 4000 }),
    ]);
    const r = await def('crm-ingresos-mensual').fetch(7, periodo, null, db);
    expect(getRevenueMetrics).toHaveBeenCalledWith(7, '2026-07-01', '2026-10-01', db);
    expect(r.filas).toHaveLength(3);
    expect(r.filas[0]).toMatchObject({ mes: '2026-07-01', cobrado: 1000, ganadas: 1, win_rate: 25 });
    expect(r.filas[1]).toMatchObject({ win_rate: null, arpa: null });
    const kpi = (t: string) => r.kpis.find((k) => k.titulo === t)?.valor;
    expect(kpi('Cobrado')).toBe(5000);
    expect(kpi('ARPA')).toBe(250); // ponderado por facturas, no media de medias
    expect(kpi('Ciclo medio de venta (días)')).toBe('—');
    expect(r.lectura?.map((l) => l.texto)).toContain('Ninguna factura enlazada a una oportunidad; cobrado total de la organización');
  });
});

describe('crm-conversion-embudo', () => {
  test('una fila por etapa de la cadena, perdidas aparte y aviso de etapas tras la ganada', async () => {
    fetchPipelines.mockResolvedValue([{ id: 'p1', name: 'Ventas' }]);
    const etapa = (stage_id: string, position: number, opportunity_count: number, extra = {}) => ({
      stage_id, stage_name: stage_id, position, opportunity_count, total_amount: opportunity_count * 10, avg_amount: null,
      pipeline_id: 'p1', is_won: false, is_lost: false, probability: null, ...extra,
    });
    fetchPipelineFunnel.mockResolvedValue([
      etapa('Lead', 1, 2), etapa('Demo', 2, 1), etapa('Ganado', 3, 1, { is_won: true }), etapa('Perdido', 4, 3, { is_lost: true }), etapa('Tarde', 5, 1),
    ]);
    const r = await def('crm-conversion-embudo').fetch(7, periodo, null, db);
    expect(r.filas.map((f) => f.etapa)).toEqual(['Lead', 'Demo', 'Ganado (ganada)', 'Perdidas']);
    expect(r.filas[0]).toMatchObject({ pipeline: 'Ventas', en_etapa: 2, llegaron: 4, pct_inicio: 100, pasa_siguiente: 50 });
    expect(r.vistas?.[0].filas[0]).toMatchObject({ pipeline: 'Ventas', conversion_global: 25 });
    expect(r.lectura?.some((l) => l.tono === 'aviso' && /«Tarde»/.test(l.texto))).toBe(true);
    // Pipeline abierto: etapas ni ganadas ni perdidas (Lead + Demo + Tarde).
    expect(r.kpis[0]).toMatchObject({ valor: 40, formato: 'moneda' });
  });
});

describe('crm-cohortes-retencion', () => {
  test('24 cohortes hasta el fin del periodo; lo que no ha cerrado queda en null («—»)', async () => {
    getCohortRetention.mockResolvedValue([
      { cohort_month: '2026-09-01', cohort_size: 4, retained_m1: 0, retained_m2: 0, retained_m3: 0, retained_m6: 0, retained_m12: 0,
        retention_m1_pct: null, retention_m2_pct: null, retention_m3_pct: null, retention_m6_pct: null, retention_m12_pct: null },
      { cohort_month: '2025-01-01', cohort_size: 10, retained_m1: 5, retained_m2: 4, retained_m3: 3, retained_m6: 2, retained_m12: 1,
        retention_m1_pct: 50, retention_m2_pct: 40, retention_m3_pct: 30, retention_m6_pct: 20, retention_m12_pct: 10 },
    ]);
    const r = await def('crm-cohortes-retencion').fetch(7, periodo, null, db);
    expect(getCohortRetention).toHaveBeenCalledWith(7, '2024-10-01', '2026-10-01', db);
    expect(r.filas[0]).toMatchObject({ cohorte: '2025-01-01', clientes: 10, m1: 50, m12: 10 });
    expect(r.kpis[0]).toMatchObject({ valor: 14 });
  });
});

describe('crm-matematica-comercial', () => {
  test('sin insumos manuales: CAC/LTV en «—», con el motivo y el aviso', async () => {
    getRevenueMetrics.mockResolvedValue([mes('2026-07-01', { deals_won: 2, arpa: 100, invoices_paid: 3 })]);
    getCohortRetention.mockResolvedValue([]);
    getRevenueInputs.mockResolvedValue({ acquisition_spend: null, gross_margin_pct: null, updated_at: null });
    const r = await def('crm-matematica-comercial').fetch(7, periodo, null, db);
    const kpi = (t: string) => r.kpis.find((k) => k.titulo === t)?.valor;
    expect(kpi('ARPA')).toBe(100);
    expect(kpi('CAC')).toBe('—');
    expect(r.filas.find((f) => f.metrica === 'CAC')?.estado).toMatch(/Falta el gasto de adquisición/);
    expect(r.lectura?.[0].tono).toBe('aviso');
  });
});
