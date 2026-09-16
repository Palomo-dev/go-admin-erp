/// <reference types="jest" />
/**
 * F14 — contrato de `/api/crm/revenue/*` (Revenue OS) contra un doble que
 * aplica el filtro de organización a las RPC y lleva señuelos de la org 121.
 * La organización sale SIEMPRE de `getServerOrgContext()`; el rango de fechas
 * se valida; un fallo de RPC es un error visible (502), nunca `[]` con 200.
 */

import { createFakeSupabase, type FakeDb, type Row } from '@/lib/services/crm/revenueOs/__tests__/revenueOsFakeSupabase';

// F0-SEC r2: `readOrgBody` (módulo hoja) lanza la clase REAL de `OrgContextError`,
// así que el mock de orgContext expone esa misma clase para que el `instanceof`
// de la ruta la reconozca (antes era una clase falsa local).
const { OrgContextError: FakeOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

let db: FakeDb;
const session = { roleId: 2, userId: 'u-admin', isSuperAdmin: false };

function seed(): FakeDb {
  return {
    rpcCalls: [],
    writes: [],
    reads: [],
    rows: {
      organizations: [
        { id: 120, timezone: 'America/Bogota' },
        { id: 121, timezone: 'UTC' },
      ],
      pipelines: [
        { id: 'p1', organization_id: 120, name: 'Ventas B2B' },
        { id: 'p9', organization_id: 121, name: 'Ajeno' },
      ],
      organization_currencies: [
        { organization_id: 120, currency_code: 'USD', is_base: false },
        { organization_id: 120, currency_code: 'MXN', is_base: true },
        { organization_id: 121, currency_code: 'COP', is_base: true },
      ],
      stages: [
        { id: 'a', pipeline_id: 'p1', is_won: false, is_lost: false, probability: 20 },
        { id: 'w', pipeline_id: 'p1', is_won: true, is_lost: false, probability: 100 },
        { id: 'l', pipeline_id: 'p1', is_won: false, is_lost: true, probability: 0 },
        { id: 'z', pipeline_id: 'p9', is_won: false, is_lost: false, probability: 50 },
      ],
      organization_settings: [
        { id: 'os-1', organization_id: 120, key: 'crm_revenue_math', settings: { acquisition_spend: 14000, gross_margin_pct: 50 }, updated_at: '2026-09-01T00:00:00Z' },
        { id: 'os-9', organization_id: 121, key: 'crm_revenue_math', settings: { acquisition_spend: 999, gross_margin_pct: 99 }, updated_at: '2026-09-01T00:00:00Z' },
      ],
      opportunities: [
        { id: 'o1', organization_id: 120, status: 'open', amount: 500 },
        { id: 'o2', organization_id: 120, status: 'won', amount: 100 },
        { id: 'o3', organization_id: 120, status: 'lost', amount: 100 },
        { id: 'o9', organization_id: 121, status: 'open', amount: 9999 },
      ],
      payments: [
        { id: 'pay-1', organization_id: 120, status: 'completed', amount: 100, payment_date: '2026-09-10T15:00:00Z' },
        // 31 de agosto 22:00 en Bogotá: fuera del mes en curso aunque en UTC sea 1 de septiembre.
        { id: 'pay-2', organization_id: 120, status: 'completed', amount: 999, payment_date: '2026-09-01T03:00:00Z' },
        { id: 'pay-9', organization_id: 121, status: 'completed', amount: 5000, payment_date: '2026-09-10T15:00:00Z' },
      ],
      calls: [{ id: 'c1', organization_id: 120, created_at: '2026-09-14T12:00:00Z' }],
      email_messages: [],
    },
    rpc: {
      fn_revenue_metrics: [
        // r2: la RPC añade revenue_collected_linked e invoices_paid (peso del ARPA).
        { p_org_id: 120, month: '2026-07-01', deals_won: 2, deals_lost: 1, deals_open: 3, revenue_won_pipeline: 300, revenue_lost: 100, revenue_pipeline: 500, arpa: 500, avg_sales_cycle_days: 12, win_rate: 0.6667, revenue_collected: 1000, commissions_paid: 50, revenue_collected_linked: 1000, invoices_paid: 4 },
        { p_org_id: 120, month: '2026-08-01', deals_won: 1, deals_lost: 0, deals_open: 2, revenue_won_pipeline: 100, revenue_lost: 0, revenue_pipeline: 400, arpa: null, avg_sales_cycle_days: null, win_rate: null, revenue_collected: 2000, commissions_paid: 0, revenue_collected_linked: 0, invoices_paid: 0 },
        { p_org_id: 121, month: '2026-08-01', deals_won: 50, deals_lost: 0, deals_open: 0, revenue_won_pipeline: 1, revenue_lost: 0, revenue_pipeline: 0, arpa: 1, avg_sales_cycle_days: 1, win_rate: 1, revenue_collected: 999999, commissions_paid: 999, revenue_collected_linked: 999999, invoices_paid: 1 },
      ],
      fn_pipeline_funnel: [
        { p_org_id: 120, stage_id: 'a', stage_name: 'Lead', position: 1, opportunity_count: 10, total_amount: 1000, avg_amount: 100 },
        { p_org_id: 120, stage_id: 'w', stage_name: 'Ganada', position: 2, opportunity_count: 2, total_amount: 600, avg_amount: 300 },
        { p_org_id: 120, stage_id: 'l', stage_name: 'Perdida', position: 3, opportunity_count: 4, total_amount: 300, avg_amount: null },
        { p_org_id: 121, stage_id: 'z', stage_name: 'Ajena', position: 1, opportunity_count: 77, total_amount: 7, avg_amount: 7 },
      ],
      fn_cohort_retention: [
        { p_org_id: 120, cohort_month: '2026-01-01', cohort_size: 10, retained_m1: 9, retained_m2: 8, retained_m3: 7, retained_m6: 0, retained_m12: 0, retention_m1_pct: 90, retention_m2_pct: 80, retention_m3_pct: 70, retention_m6_pct: 0, retention_m12_pct: 0 },
        { p_org_id: 121, cohort_month: '2026-01-01', cohort_size: 1000, retained_m1: 0, retained_m2: 0, retained_m3: 0, retained_m6: 0, retained_m12: 0, retention_m1_pct: 0, retention_m2_pct: 0, retention_m3_pct: 0, retention_m6_pct: 0, retention_m12_pct: 0 },
      ],
    },
  };
}

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: FakeOrgContextError,
  requireOrgAdmin: jest.fn((ctx: { roleId: number; isSuperAdmin: boolean }) => {
    if (!(ctx.isSuperAdmin || ctx.roleId === 1 || ctx.roleId === 2)) {
      throw new FakeOrgContextError('Requiere rol de administrador de la organización', 403, 'ADMIN_REQUIRED');
    }
  }),
  getServerOrgContext: jest.fn(async () => ({
    organizationId: 120,
    userId: session.userId,
    roleId: session.roleId,
    roleName: 'x',
    isSuperAdmin: session.isSuperAdmin,
    supabase: createFakeSupabase(db),
  })),
}));

import { NextRequest } from 'next/server';
import { GET as getDashboard } from '../dashboard/route';
import { GET as getMetrics } from '../metrics/route';
import { GET as getFunnel } from '../funnel/route';
import { GET as getCohorts } from '../cohorts/route';
import { GET as getKpis } from '../kpis/route';
import { GET as getInputs, PUT as putInputs } from '../inputs/route';

const req = (url: string, method = 'GET', body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  db = seed();
  session.roleId = 2;
  session.userId = 'u-admin';
  session.isSuperAdmin = false;
  jest.useFakeTimers().setSystemTime(new Date('2026-09-15T12:00:00Z'));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('GET /api/crm/revenue/dashboard', () => {
  it('rango por defecto = últimos 12 meses en la zona de la org y las tres RPC con p_org_id de la sesión', async () => {
    const res = await getDashboard(req('/api/crm/revenue/dashboard'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.period).toEqual({ start: '2025-10-01', end: '2026-10-01', today: '2026-09-15', timezone: 'America/Bogota' });
    expect(db.rpcCalls).toEqual(
      expect.arrayContaining([
        { name: 'fn_revenue_metrics', args: { p_org_id: 120, p_start: '2025-10-01', p_end: '2026-10-01' } },
        { name: 'fn_pipeline_funnel', args: { p_org_id: 120 } },
        { name: 'fn_cohort_retention', args: { p_org_id: 120, p_start: expect.any(String), p_end: '2026-10-01' } },
      ]),
    );
  });
  it('métricas solo de la org 120; null se conserva como null (win_rate, arpa, ciclo), no como 0', async () => {
    const body = await (await getDashboard(req('/api/crm/revenue/dashboard'))).json();
    expect(body.data.revenue_metrics).toHaveLength(2);
    expect(body.data.revenue_metrics[1]).toMatchObject({ month: '2026-08-01', arpa: null, win_rate: null, avg_sales_cycle_days: null, revenue_collected: 2000 });
    expect(body.data.summary).toMatchObject({
      revenue_collected: 3000,
      revenue_won_pipeline: 400,
      deals_won: 3,
      deals_lost: 1,
      deals_open: 5,
      win_rate_pct: 75,
      avg_sales_cycle_days: 12,
      arpa: 500,
      invoices_paid: 4,
      revenue_collected_linked: 1000,
      commissions_paid: 50,
    });
  });
  it('r2: moneda base de la org (MXN, no la COP de la 121 ni un COP cableado) y nombres de pipeline de la org', async () => {
    const body = await (await getDashboard(req('/api/crm/revenue/dashboard'))).json();
    expect(body.data.currency).toBe('MXN');
    expect(body.data.pipeline_names).toEqual({ p1: 'Ventas B2B' });
    const cur = db.reads.filter((r) => r.table === 'organization_currencies');
    expect(cur).toHaveLength(1);
    expect(cur[0].filters).toMatchObject({ 'eq:organization_id': 120, 'eq:is_base': true });
    expect(db.reads.filter((r) => r.table === 'pipelines')).toHaveLength(1);
  });
  it('r2: sin moneda base configurada → currency null (nunca «COP» por defecto)', async () => {
    db.rows.organization_currencies = db.rows.organization_currencies.filter((r) => r.organization_id !== 120);
    const body = await (await getDashboard(req('/api/crm/revenue/dashboard'))).json();
    expect(body.data.currency).toBeNull();
  });
  it('embudo enriquecido con is_won/is_lost/pipeline_id desde las etapas de los pipelines de la org (nunca los de la 121)', async () => {
    const body = await (await getDashboard(req('/api/crm/revenue/dashboard'))).json();
    const funnel = body.data.pipeline_funnel as Row[];
    expect(funnel.map((f) => f.stage_id)).toEqual(['a', 'w', 'l']);
    expect(funnel[1]).toMatchObject({ is_won: true, is_lost: false, pipeline_id: 'p1', probability: 100 });
    expect(funnel[2]).toMatchObject({ is_lost: true, avg_amount: null });
    expect(db.reads.find((r) => r.table === 'pipelines')?.filters).toEqual({ 'eq:organization_id': 120 });
  });
  it('cohortes de la org, insumos de organization_settings de la org y matemática encadenada', async () => {
    const body = await (await getDashboard(req('/api/crm/revenue/dashboard'))).json();
    expect(body.data.cohort_retention).toHaveLength(1);
    expect(body.data.cohort_retention[0].cohort_size).toBe(10);
    expect(body.data.inputs).toMatchObject({ acquisition_spend: 14000, gross_margin_pct: 50 });
    const m = body.data.math;
    expect(m.newCustomers).toBe(3);
    expect(m.cac).toBeCloseTo(14000 / 3, 6);
    expect(m.churnRatePct).toBeCloseTo(10, 6);
    expect(m.arpa).toBe(500);
    expect(m.ltv).toBeCloseTo(2500, 6);
    expect(m.ltvCacRatio).toBeCloseTo(2500 / (14000 / 3), 6);
    expect(m.paybackMonths).toBeCloseTo((14000 / 3) / 250, 6);
    expect(m.netRevenueRetentionPct).toBeNull();
  });
  it('start inválido → 400; end < start → 400; > 36 meses → 400 (y no llama a ninguna RPC)', async () => {
    expect((await getDashboard(req('/api/crm/revenue/dashboard?start=2026-13-40'))).status).toBe(400);
    expect((await getDashboard(req('/api/crm/revenue/dashboard?start=2026-06-01&end=2026-01-01'))).status).toBe(400);
    const r3 = await getDashboard(req('/api/crm/revenue/dashboard?start=2020-01-01&end=2026-09-01'));
    expect(r3.status).toBe(400);
    expect((await r3.json()).error).toMatch(/36 meses/);
    expect(db.rpcCalls).toEqual([]);
  });
  it('un fallo de RPC es un 502 con el nombre de la función, nunca 200 con []', async () => {
    db.rpcErrors = { fn_revenue_metrics: { message: 'permission denied for function', code: '42501' } };
    const res = await getDashboard(req('/api/crm/revenue/dashboard'));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/fn_revenue_metrics/);
    expect(body.error).toMatch(/permission denied/);
  });
  it('can_edit_inputs se resuelve en servidor: admin true, empleado false', async () => {
    expect((await (await getDashboard(req('/api/crm/revenue/dashboard'))).json()).can_edit_inputs).toBe(true);
    session.roleId = 4;
    expect((await (await getDashboard(req('/api/crm/revenue/dashboard'))).json()).can_edit_inputs).toBe(false);
  });
  it('sin sesión → 401 del contexto', async () => {
    const { getServerOrgContext } = jest.requireMock('@/lib/utils/orgContext') as { getServerOrgContext: jest.Mock };
    getServerOrgContext.mockRejectedValueOnce(new FakeOrgContextError('No autenticado', 401));
    expect((await getDashboard(req('/api/crm/revenue/dashboard'))).status).toBe(401);
  });
});

describe('GET /api/crm/revenue/metrics y /cohorts', () => {
  it('metrics: rango explícito válido pasa tal cual; inválido → 400', async () => {
    const ok = await getMetrics(req('/api/crm/revenue/metrics?start=2026-01-01&end=2026-07-01'));
    expect(ok.status).toBe(200);
    expect(db.rpcCalls[0]).toEqual({ name: 'fn_revenue_metrics', args: { p_org_id: 120, p_start: '2026-01-01', p_end: '2026-07-01' } });
    expect((await ok.json()).data).toHaveLength(2);
    expect((await getMetrics(req('/api/crm/revenue/metrics?end=ayer'))).status).toBe(400);
  });
  it('cohorts: por defecto mira 24 meses atrás (dos rangos por defecto) y valida igual', async () => {
    const ok = await getCohorts(req('/api/crm/revenue/cohorts'));
    expect(ok.status).toBe(200);
    expect(db.rpcCalls[0]).toEqual({ name: 'fn_cohort_retention', args: { p_org_id: 120, p_start: '2024-10-01', p_end: '2026-10-01' } });
    expect((await getCohorts(req('/api/crm/revenue/cohorts?start=2026-09-01&end=2026-01-01'))).status).toBe(400);
  });
  it('metrics: error de RPC → 502 honesto', async () => {
    db.rpcErrors = { fn_revenue_metrics: { message: 'timeout' } };
    const res = await getMetrics(req('/api/crm/revenue/metrics'));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/fn_revenue_metrics.*timeout/);
  });
});

describe('GET /api/crm/revenue/funnel', () => {
  it('devuelve el embudo enriquecido y sin etapas de otra org', async () => {
    const body = await (await getFunnel()).json();
    expect(body.data.map((f: Row) => f.stage_id)).toEqual(['a', 'w', 'l']);
    expect(body.data[0]).toMatchObject({ pipeline_id: 'p1', is_won: false, is_lost: false });
  });
  it('error de RPC → 502', async () => {
    db.rpcErrors = { fn_pipeline_funnel: { message: 'boom' } };
    expect((await getFunnel()).status).toBe(502);
  });
});

describe('GET /api/crm/revenue/kpis', () => {
  it('mes y semana en curso se cortan en la zona de la org (instantes con offset), solo org 120', async () => {
    const body = await (await getKpis()).json();
    expect(body.data).toMatchObject({ pipeline_value: 500, open_deals: 1, revenue_this_month: 100, win_rate: 50, calls_this_week: 1, emails_this_week: 0 });
    const payRead = db.reads.find((r) => r.table === 'payments');
    expect(payRead?.filters['gte:payment_date']).toBe('2026-09-01T00:00:00.000-05:00');
    const callsRead = db.reads.find((r) => r.table === 'calls');
    expect(callsRead?.filters['gte:created_at']).toBe('2026-09-14T00:00:00.000-05:00');
  });
});

describe('/api/crm/revenue/inputs (gasto de adquisición y margen bruto en organization_settings)', () => {
  it('GET devuelve los insumos de la org (no los de la 121)', async () => {
    const body = await (await getInputs()).json();
    expect(body.data).toMatchObject({ acquisition_spend: 14000, gross_margin_pct: 50 });
  });
  it('GET sin fila → nulos con updated_at null (no inventa)', async () => {
    db.rows.organization_settings = [];
    const body = await (await getInputs()).json();
    expect(body.data).toEqual({ acquisition_spend: null, gross_margin_pct: null, updated_at: null });
  });
  it('PUT admin: upsert por (organization_id, key) con la org de la sesión', async () => {
    const res = await putInputs(req('/api/crm/revenue/inputs', 'PUT', { acquisition_spend: 20000, gross_margin_pct: 55 }));
    expect(res.status).toBe(200);
    expect(db.writes).toHaveLength(1);
    expect(db.writes[0]).toMatchObject({ table: 'organization_settings', op: 'upsert', onConflict: 'organization_id,key', row: { organization_id: 120, key: 'crm_revenue_math' } });
    expect(db.writes[0].row.settings).toEqual({ acquisition_spend: 20000, gross_margin_pct: 55 });
    expect((await res.json()).data).toMatchObject({ acquisition_spend: 20000, gross_margin_pct: 55 });
  });
  it('PUT con organization_id distinto en el body → 403 y nada escrito', async () => {
    const res = await putInputs(req('/api/crm/revenue/inputs', 'PUT', { organization_id: 121, acquisition_spend: 1, gross_margin_pct: 1 }));
    expect(res.status).toBe(403);
    expect(db.writes).toEqual([]);
  });
  it('PUT con rol empleado → 403 (resuelto en servidor)', async () => {
    session.roleId = 4;
    const res = await putInputs(req('/api/crm/revenue/inputs', 'PUT', { acquisition_spend: 1, gross_margin_pct: 1 }));
    expect(res.status).toBe(403);
    expect(db.writes).toEqual([]);
  });
  it('PUT valida: margen fuera de 0–100 → 400; gasto negativo → 400; texto → 400', async () => {
    expect((await putInputs(req('/api/crm/revenue/inputs', 'PUT', { acquisition_spend: 1, gross_margin_pct: 140 }))).status).toBe(400);
    expect((await putInputs(req('/api/crm/revenue/inputs', 'PUT', { acquisition_spend: -5, gross_margin_pct: 10 }))).status).toBe(400);
    expect((await putInputs(req('/api/crm/revenue/inputs', 'PUT', { acquisition_spend: 'mucho', gross_margin_pct: 10 }))).status).toBe(400);
    expect(db.writes).toEqual([]);
  });
  it('PUT con null borra el insumo (vuelve a «sin dato»)', async () => {
    const res = await putInputs(req('/api/crm/revenue/inputs', 'PUT', { acquisition_spend: null, gross_margin_pct: 40 }));
    expect(res.status).toBe(200);
    expect(db.writes[0].row.settings).toEqual({ acquisition_spend: null, gross_margin_pct: 40 });
  });
});
