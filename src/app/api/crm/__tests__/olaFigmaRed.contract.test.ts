/// <reference types="jest" />
/**
 * CRM «Figma a código» — contrato de las rutas de red y gestión: pronóstico
 * por categorías y ajustes, fusión de clientes, conteos por territorio,
 * simulación de asignación y prueba en seco retroactiva de automatizaciones.
 *
 * La organización sale de la sesión, una ajena da 403 sin escribir, los
 * permisos se resuelven en el servidor y la simulación nunca escribe.
 */

const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

import { fakeSupabase, makeDb, seed, ORG, OTRA, U, YO, OTRO_VENDEDOR, type Ola1Db } from './ola1Fake';

let db: Ola1Db;
let permisos: Set<string>;
let admin = false;

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: ORG, userId: YO, roleId: admin ? 2 : 4, roleName: 'x', isSuperAdmin: false, supabase: fakeSupabase(db) })),
  hasOrgAdminOrPermission: jest.fn(async (_ctx: unknown, code: string) => permisos.has(code)),
  isOrgAdminContext: jest.fn(() => admin),
  requireOrgAdmin: jest.fn(() => {
    if (!admin) throw new RealOrgContextError('Requiere rol de administrador de la organización', 403, 'ADMIN_REQUIRED');
  }),
}));
jest.mock('@/lib/services/organizationTimezoneService', () => ({ getOrganizationTimezone: jest.fn(async () => 'America/Bogota') }));
jest.mock('@/lib/services/monedaOrganizacion', () => ({ resolverContextoMoneda: jest.fn(async () => ({ code: 'COP', decimals: 0, locale: 'es-CO' })) }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn(() => fakeSupabase(db)) }));
// El motor de automatizaciones arrastra el SDK de webhooks (ESM): no se usa aquí.
jest.mock('svix', () => ({ Webhook: class {} }));

import { NextRequest } from 'next/server';
import { GET as forecastGet } from '../forecast/route';
import { POST as ajustePost } from '../forecast/adjustments/route';
import { PATCH as categoriaPatch } from '../opportunities/[id]/forecast-category/route';
import { POST as fusionPost } from '../customer-merges/route';
import { POST as deshacerPost } from '../customer-merges/[id]/undo/route';
import { GET as duplicadosGet } from '../customer-merges/duplicates/route';
import { POST as exclusionPost } from '../customer-merges/exclusions/route';
import { GET as conteosGet } from '../territories/counts/route';
import { POST as simularPost } from '../assignment/simulate/route';
import { POST as replayPost } from '../automation-rules/[id]/replay/route';

const req = (url: string, method = 'GET', body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as Record<string, unknown> });
const rpc = (fn: string) => db.rpcCalls.filter((c) => c.fn === fn);

beforeEach(() => {
  db = makeDb(seed());
  permisos = new Set(['crm.opportunities.view', 'crm.customers.view']);
  admin = false;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

function snapshot() {
  return {
    period: '2026-Q4', start: '2026-10-01', end: '2027-01-01', date: '2026-10-06', timezone: 'America/Bogota', base: 'COP',
    users: [{ id: YO, first_name: 'Ana', last_name: 'Gómez' }, { id: OTRO_VENDEDOR, first_name: 'Mario', last_name: 'Torres' }],
    opportunities: [
      { id: U(1), name: 'Obra', salesperson_id: YO, amount: 10_000_000, currency: 'COP', status: 'open', expected_close_date: '2026-10-15', closed_at: null, updated_at: '2026-10-01T00:00:00Z', forecast_category: null, probability: 70, is_won: false, is_lost: false, stage_name: 'Negociación' },
      { id: U(2), name: 'Plan', salesperson_id: YO, amount: 4_000_000, currency: 'COP', status: 'open', expected_close_date: '2026-11-01', closed_at: null, updated_at: '2026-10-01T00:00:00Z', forecast_category: 'omitted', probability: 50, is_won: false, is_lost: false, stage_name: 'Propuesta' },
      { id: U(3), name: 'Cerrada', salesperson_id: OTRO_VENDEDOR, amount: 2_000_000, currency: 'COP', status: 'won', expected_close_date: '2026-10-02', closed_at: '2026-10-02T15:00:00Z', updated_at: '2026-10-02T00:00:00Z', forecast_category: null, probability: 100, is_won: true, is_lost: false, stage_name: 'Ganada' },
    ],
    targets: [{ id: U(9), user_id: YO, period: 'quarterly', target_amount: 20_000_000, target_currency: 'COP' }],
    teamQuotas: [], rates: [], adjustments: [], snapshotToken: 'tok', canViewAll: true, canAdjust: true, canEditAny: false, currentUser: YO,
  };
}

describe('GET /api/crm/forecast', () => {
  it('trimestre de HOY en la zona de la organización y totales por categoría', async () => {
    db.rpc.crm_forecast_snapshot = { data: snapshot() };
    const r = await json(await forecastGet(req('/api/crm/forecast')));
    expect(r.status).toBe(200);
    expect(rpc('crm_forecast_snapshot')[0].args).toMatchObject({ p_org: ORG, p_period: expect.stringMatching(/^\d{4}-Q[1-4]$/), p_user: null });
    const d = r.body.data as { summary: Record<string, { total: number }>; opportunities: { id: string; category: string }[] };
    // Compromiso: 10 M (70 %) + 2 M ganado; la omitida no suma.
    expect(d.summary.commit.total).toBe(12_000_000);
    expect(d.summary.bestCase.total).toBe(12_000_000);
    expect(d.summary.quota.total).toBe(20_000_000);
    expect(d.opportunities.map((o) => [o.id, o.category])).toEqual([[U(1), 'commit'], [U(2), 'omitted']]);
  });

  it('ver a otro vendedor sin crm.forecast.view_all → 403 sin consultar', async () => {
    const r = await forecastGet(req(`/api/crm/forecast?period=2026-Q4&user_id=${OTRO_VENDEDOR}`));
    expect(r.status).toBe(403);
    expect(rpc('crm_forecast_snapshot')).toHaveLength(0);
  });

  it('periodo mal formado → 400', async () => {
    expect((await forecastGet(req('/api/crm/forecast?period=2026-Q5'))).status).toBe(400);
  });
});

describe('PATCH /api/crm/opportunities/[id]/forecast-category', () => {
  it('exige editar oportunidades y pasa el bloqueo optimista a la RPC', async () => {
    const cuerpo = { category: 'commit', expected_updated_at: '2026-10-01T00:00:00Z' };
    expect((await categoriaPatch(req(`/api/crm/opportunities/${U(1)}/forecast-category`, 'PATCH', cuerpo), params(U(1)))).status).toBe(403);
    permisos.add('crm.opportunities.edit');
    db.rpc.crm_set_forecast_category = { data: { id: U(1), forecast_category: 'commit', updated_at: '2026-10-06T00:00:00Z', amount: 1 } };
    const r = await json(await categoriaPatch(req(`/api/crm/opportunities/${U(1)}/forecast-category`, 'PATCH', cuerpo), params(U(1))));
    expect(r.status).toBe(200);
    expect(rpc('crm_set_forecast_category')[0].args).toEqual({ p_org: ORG, p_id: U(1), p_category: 'commit', p_expected_updated_at: '2026-10-01T00:00:00Z' });
    expect(r.body.data).toEqual({ id: U(1), forecast_category: 'commit', updated_at: '2026-10-06T00:00:00Z' });
  });

  it('categoría inválida → 400; registro cambiado (P0001) → 409', async () => {
    permisos.add('crm.opportunities.edit');
    expect((await categoriaPatch(req(`/api/crm/opportunities/${U(1)}/forecast-category`, 'PATCH', { category: 'seguro', expected_updated_at: null }), params(U(1)))).status).toBe(400);
    db.rpc.crm_set_forecast_category = { error: { code: 'P0001', message: 'registro_modificado' } };
    expect((await categoriaPatch(req(`/api/crm/opportunities/${U(1)}/forecast-category`, 'PATCH', { category: 'commit', expected_updated_at: null }), params(U(1)))).status).toBe(409);
  });
});

describe('POST /api/crm/forecast/adjustments', () => {
  const ajuste = { period: '2026-Q4', user_id: YO, amount_after: 15_000_000, expected_before: 10_000_000, expected_adjustment_id: null, reason_code: 'verbal_agreement', reason_text: 'Acuerdo con el cliente' };

  it('sin crm.forecast.adjust → 403 y nada se escribe', async () => {
    const r = await ajustePost(req('/api/crm/forecast/adjustments', 'POST', ajuste));
    expect(r.status).toBe(403);
    expect(rpc('crm_record_forecast_adjustment')).toHaveLength(0);
  });

  it('con permiso: el servidor calcula el «antes» y la RPC de servicio recibe actor y token', async () => {
    permisos.add('crm.forecast.adjust');
    permisos.add('crm.forecast.view_all');
    db.rpc.crm_forecast_snapshot = { data: snapshot() };
    db.rpc.crm_record_forecast_adjustment = { data: { id: U(60), snapshot_token: 'tok', amount_after: 15_000_000 } };
    const r = await json(await ajustePost(req('/api/crm/forecast/adjustments', 'POST', ajuste)));
    expect(r.status).toBe(201);
    expect(rpc('crm_record_forecast_adjustment')[0].args).toMatchObject({ p_org: ORG, p_user: YO, p_actor: YO, p_before: 10_000_000, p_after: 15_000_000, p_snapshot: 'tok', p_currency: 'COP' });
    expect(r.body.data).not.toHaveProperty('snapshot_token');
  });

  it('si el compromiso cambió desde que se abrió el diálogo → 409 sin escribir', async () => {
    permisos.add('crm.forecast.adjust');
    permisos.add('crm.forecast.view_all');
    db.rpc.crm_forecast_snapshot = { data: snapshot() };
    const r = await json(await ajustePost(req('/api/crm/forecast/adjustments', 'POST', { ...ajuste, expected_before: 9_000_000 })));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('registro_modificado');
    expect(rpc('crm_record_forecast_adjustment')).toHaveLength(0);
  });

  it('organización ajena en el body → 403', async () => {
    permisos.add('crm.forecast.adjust');
    permisos.add('crm.forecast.view_all');
    expect((await ajustePost(req('/api/crm/forecast/adjustments', 'POST', { ...ajuste, organization_id: OTRA }))).status).toBe(403);
  });
});

describe('fusión de clientes', () => {
  it('fusionar exige crm.customers.merge y es UNA llamada a la RPC transaccional', async () => {
    const cuerpo = { primary_id: U(10), secondary_id: U(11), choices: { email: U(11) } };
    expect((await fusionPost(req('/api/crm/customer-merges', 'POST', cuerpo))).status).toBe(403);
    permisos.add('crm.customers.merge');
    db.rpc.crm_merge_customers = { data: { id: U(70), primary_customer_id: U(10), moved_counts: [] } };
    const r = await json(await fusionPost(req('/api/crm/customer-merges', 'POST', cuerpo)));
    expect(r.status).toBe(201);
    expect(rpc('crm_merge_customers')).toEqual([{ fn: 'crm_merge_customers', args: { p_org: ORG, p_primary: U(10), p_secondaries: [U(11)], p_choices: { email: U(11) } } }]);
    expect(db.writes).toHaveLength(0);
  });

  it('elección de un campo hacia un tercero → 400; factura emitida (P0001) → 409', async () => {
    permisos.add('crm.customers.merge');
    expect((await fusionPost(req('/api/crm/customer-merges', 'POST', { primary_id: U(10), secondary_id: U(11), choices: { email: U(12) } }))).status).toBe(400);
    db.rpc.crm_merge_customers = { error: { code: 'P0001', message: 'factura_emitida' } };
    const r = await json(await fusionPost(req('/api/crm/customer-merges', 'POST', { primary_id: U(10), secondary_id: U(11) })));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('factura_emitida');
  });

  it('deshacer y «no son el mismo» van por sus RPC con la organización de la sesión', async () => {
    permisos.add('crm.customers.merge');
    db.rpc.crm_unmerge_customer = { data: { id: U(70), undone: true } };
    db.rpc.crm_exclude_customer_pair = { data: null };
    expect((await deshacerPost(req(`/api/crm/customer-merges/${U(70)}/undo`, 'POST', {}), params(U(70)))).status).toBe(200);
    expect(rpc('crm_unmerge_customer')[0].args).toEqual({ p_org: ORG, p_merge: U(70) });
    expect((await exclusionPost(req('/api/crm/customer-merges/exclusions', 'POST', { a: U(10), b: U(11) }))).status).toBe(201);
    expect(rpc('crm_exclude_customer_pair')[0].args).toEqual({ p_org: ORG, p_a: U(10), p_b: U(11) });
  });

  it('duplicados: sin las parejas excluidas de la organización', async () => {
    const c = (id: string) => ({ id, full_name: id, first_name: null, last_name: null, email: null, phone: null, company_name: null, trade_name: null, identification_type: null, identification_number: null, address: null, city: null, created_at: '2026-01-01', conversations_count: 0, opportunities_count: 0 });
    db.rpc.crm_find_duplicates = { data: [{ identity_type: 'email', identity_value: 'a@x.co', customers: [c(U(10)), c(U(11))] }, { identity_type: 'phone', identity_value: '3105550142', customers: [c(U(12)), c(U(13))] }] };
    db.t.customer_merge_exclusions = [
      { organization_id: ORG, customer_a: U(11), customer_b: U(10) },
      { organization_id: OTRA, customer_a: U(12), customer_b: U(13) },
    ];
    const r = await json(await duplicadosGet(req('/api/crm/customer-merges/duplicates')));
    expect(r.status).toBe(200);
    const d = r.body.data as { grupos: { identity_value: string }[]; puedeFusionar: boolean };
    expect(d.grupos.map((g) => g.identity_value)).toEqual(['3105550142']);
    expect(d.puedeFusionar).toBe(false);
  });
});

describe('territorios y simulación de asignación', () => {
  it('conteos con el motor de la asignación, solo clientes de la organización', async () => {
    db.t.territories = [
      { id: U(20), organization_id: ORG, name: 'Antioquia', is_active: true, criteria: { rules: [{ field_key: 'customers.city', operator: 'eq', value: 'Medellín', is_required: true }] } },
      { id: U(21), organization_id: ORG, name: 'Sin reglas', is_active: true, criteria: {} },
      { id: U(22), organization_id: ORG, name: 'Grandes', is_active: true, criteria: { rules: [{ field_key: 'opportunities.amount', operator: 'gte', value: 1000, is_required: true }] } },
      { id: U(29), organization_id: OTRA, name: 'Ajeno', is_active: true, criteria: { rules: [{ field_key: 'customers.city', operator: 'eq', value: 'Medellín', is_required: true }] } },
    ];
    db.t.customers = [
      { id: U(30), organization_id: ORG, city: 'Medellín', status: 'active' },
      { id: U(31), organization_id: ORG, city: 'Cali', status: 'active' },
      { id: U(39), organization_id: OTRA, city: 'Medellín', status: 'active' },
    ];
    const r = await json(await conteosGet(req('/api/crm/territories/counts')));
    expect(r.status).toBe(200);
    const d = r.body.data as { territorios: { id: string; clientes: number; sinReglas: boolean }[]; sinTerritorio: number; evaluados: number };
    expect(d.territorios).toEqual([
      expect.objectContaining({ id: U(20), clientes: 1, sinReglas: false }),
      expect.objectContaining({ id: U(22), clientes: 0, reglasDeOportunidad: true }),
      expect.objectContaining({ id: U(21), clientes: 0, sinReglas: true }),
    ]);
    expect(d.evaluados).toBe(2);
    expect(d.sinTerritorio).toBe(1);
  });

  it('simular: exige crm.leads.assign y NO escribe nada', async () => {
    const cuerpo = { strategy: 'round_robin', team_id: U(50), customer: { city: 'Medellín' } };
    expect((await simularPost(req('/api/crm/assignment/simulate', 'POST', cuerpo))).status).toBe(403);
    permisos.add('crm.leads.assign');
    db.t.sales_team_members = [{ organization_id: ORG, sales_team_id: U(50), user_id: YO, is_active: true, created_at: '2026-01-01' }];
    db.t.organization_members = [{ organization_id: ORG, user_id: YO, is_active: true }];
    db.t.profiles = [{ id: YO, first_name: 'Ana', last_name: 'Gómez' }];
    const r = await json(await simularPost(req('/api/crm/assignment/simulate', 'POST', cuerpo)));
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ userId: YO, nombre: 'Ana Gómez', strategy: 'round_robin' });
    expect(db.writes).toHaveLength(0);
  });

  it('simular sin cliente → 400; organización ajena → 403', async () => {
    permisos.add('crm.leads.assign');
    expect((await simularPost(req('/api/crm/assignment/simulate', 'POST', { strategy: 'round_robin' }))).status).toBe(400);
    expect((await simularPost(req('/api/crm/assignment/simulate', 'POST', { organization_id: OTRA, customer: {} }))).status).toBe(403);
  });
});

describe('POST /api/crm/automation-rules/[id]/replay', () => {
  it('solo admin, sin parámetros, y nunca escribe ejecuciones', async () => {
    db.t.automation_rules = [
      { id: U(40), organization_id: ORG, name: 'Bienvenida', is_active: false, trigger_type: 'event', event: 'opportunity.created', trigger_config: {}, conditions: null, actions: [{ type: 'create_task' }], run_once_per_opportunity: true, cooldown_hours: 0, pipeline_id: null, stage_id: null },
    ];
    db.t.crm_events = [
      { id: U(41), organization_id: ORG, event_type: 'opportunity.created', entity_type: 'opportunity', entity_id: U(1), payload: {}, created_at: new Date(Date.now() - 86_400_000).toISOString() },
      { id: U(42), organization_id: ORG, event_type: 'opportunity.created', entity_type: 'opportunity', entity_id: U(1), payload: {}, created_at: new Date(Date.now() - 3_600_000).toISOString() },
      { id: U(49), organization_id: OTRA, event_type: 'opportunity.created', entity_type: 'opportunity', entity_id: U(90), payload: {}, created_at: new Date().toISOString() },
    ];
    db.t.automation_runs = [];
    expect((await replayPost(req(`/api/crm/automation-rules/${U(40)}/replay`, 'POST', {}), params(U(40)))).status).toBe(403);
    admin = true;
    expect((await replayPost(req(`/api/crm/automation-rules/${U(40)}/replay`, 'POST', { ejecutar: true }), params(U(40)))).status).toBe(400);
    const r = await json(await replayPost(req(`/api/crm/automation-rules/${U(40)}/replay`, 'POST', {}), params(U(40))));
    expect(r.status).toBe(200);
    const d = r.body.data as { evaluados: number; aplicaria: number; omitidos: number; motivos: Record<string, number>; regla_activa: boolean };
    // La primera se aplicaría; la segunda la corta `run_once_per_opportunity` (simulada).
    expect(d).toMatchObject({ evaluados: 2, aplicaria: 1, omitidos: 1, regla_activa: false });
    expect(d.motivos).toEqual({ run_once_per_opportunity: 1 });
    expect(db.writes).toHaveLength(0);
  });

  it('regla de otra organización → 404', async () => {
    admin = true;
    db.t.automation_rules = [{ id: U(48), organization_id: OTRA, trigger_type: 'event', actions: [] }];
    expect((await replayPost(req(`/api/crm/automation-rules/${U(48)}/replay`, 'POST', {}), params(U(48)))).status).toBe(404);
  });
});
