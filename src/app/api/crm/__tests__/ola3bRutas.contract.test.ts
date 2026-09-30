/// <reference types="jest" />
/**
 * CRM ola 3B — contrato de las rutas que alimentan Pipeline, Oportunidades,
 * drawer y detalle (docs/crm/PLAN-FIGMA-A-CODIGO.md §4.2–§4.8, paso 1.4).
 *
 * Mismo doble de Supabase que la ola 1: la organización sale de la sesión,
 * los señuelos de la 121 nunca aparecen, una organización ajena en el body da
 * 403 sin escribir y los permisos se resuelven en el servidor.
 */

const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

import { fakeSupabase, makeDb, seed, ORG, OTRA, U, YO, OTRO_VENDEDOR, type Ola1Db, type Row } from './ola1Fake';

let db: Ola1Db;
let permisos: Set<string>;

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: ORG, userId: YO, roleId: 4, roleName: 'x', isSuperAdmin: false, supabase: fakeSupabase(db) })),
  hasOrgAdminOrPermission: jest.fn(async (_ctx: unknown, code: string) => permisos.has(code)),
}));
jest.mock('@/lib/services/monedaOrganizacion', () => ({ resolveOrgCurrency: jest.fn(async () => ({ code: 'COP', decimals: 0 })) }));

import { NextRequest } from 'next/server';
import { GET as listGet, POST as createPost } from '../opportunities/route';
import { GET as resumenGet } from '../opportunities/resumen/route';
import { GET as oneGet } from '../opportunities/[id]/route';
import { PUT as scorePut } from '../opportunities/[id]/score/route';
import { PATCH as seguimientoPatch } from '../opportunities/[id]/seguimiento/route';
import { GET as boardGet } from '../pipelines/[id]/board/route';
import { GET as motivosGet } from '../loss-reasons/route';
import { agregarResumen, textoBusqueda } from '@/lib/services/crm/oportunidadesLecturaService';

const EMPLEADO = ['crm.opportunities.view', 'crm.opportunities.create', 'crm.opportunities.edit'];
const req = (url: string, method = 'GET', body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as Record<string, unknown> });

function semilla(): Record<string, Row[]> {
  const s = seed();
  s.opportunities = [
    { id: U(1), organization_id: ORG, pipeline_id: U(40), stage_id: U(41), status: 'open', record_type: 'deal', customer_id: U(10), salesperson_id: YO, created_by: YO, name: 'Renovación licencias', amount: 12_500_000, currency: 'COP', temperature: 'hot', expected_close_date: '2026-10-30', created_at: '2026-09-01T10:00:00Z', etapa: { probability: 60 } },
    { id: U(2), organization_id: ORG, pipeline_id: U(40), stage_id: U(41), status: 'open', record_type: 'deal', customer_id: U(11), salesperson_id: OTRO_VENDEDOR, created_by: OTRO_VENDEDOR, name: 'Dotación sedes', amount: 3500, currency: 'USD', temperature: 'warm', expected_close_date: '2026-11-15', created_at: '2026-09-02T10:00:00Z', etapa: { probability: 60 } },
    { id: U(3), organization_id: ORG, pipeline_id: U(40), stage_id: U(43), status: 'won', record_type: 'deal', customer_id: U(10), salesperson_id: YO, created_by: YO, name: 'Mantenimiento', amount: 9_800_000, currency: 'COP', closed_at: '2026-09-18T15:00:00Z', created_at: '2026-08-01T10:00:00Z' },
    { id: U(4), organization_id: ORG, pipeline_id: U(40), stage_id: U(41), status: 'open', record_type: 'lead', customer_id: U(12), salesperson_id: null, created_by: null, name: 'Lead heredado', amount: 0, currency: null, created_at: '2026-07-01T10:00:00Z', etapa: { probability: 60 } },
    { id: U(90), organization_id: OTRA, pipeline_id: U(95), stage_id: U(96), status: 'open', record_type: 'deal', customer_id: U(91), salesperson_id: YO, created_by: YO, name: 'Señuelo', amount: 999, currency: 'COP' },
  ];
  s.pipelines = [
    { id: U(40), organization_id: ORG, name: 'Ventas', pipeline_type: 'sales', is_default: true },
    { id: U(95), organization_id: OTRA, name: 'Ajeno', pipeline_type: 'sales', is_default: true },
  ];
  s.exchange_rates = [
    { organization_id: ORG, base_currency: 'USD', target_currency: 'COP', rate: 4000, effective_date: '2026-09-20' },
    { organization_id: OTRA, base_currency: 'USD', target_currency: 'COP', rate: 1, effective_date: '2026-09-29' },
  ];
  s.loss_reasons = [
    { id: U(300), organization_id: null, code: 'price', label: 'Precio', is_active: true, sort_order: 1 },
    { id: U(301), organization_id: ORG, code: 'competitor', label: 'Competencia', is_active: true, sort_order: 2 },
    { id: U(309), organization_id: OTRA, code: 'otra', label: 'Señuelo', is_active: true, sort_order: 3 },
  ];
  s.scoring_configs = [
    { id: U(310), organization_id: ORG, updated_at: '2026-09-01', config: { indicators: [{ key: 'presupuesto', label: 'Presupuesto', weight: 100, options: [{ value: 'si', label: 'Sí', score: 3 }, { value: 'no', label: 'No', score: 0 }] }], bands: { cold: { min: 0, max: 33 }, warm: { min: 34, max: 66 }, hot: { min: 67, max: 100 } } } },
  ];
  s.opportunity_stage_history.push({ id: U(51), organization_id: ORG, opportunity_id: U(1), from_stage_id: U(41), to_stage_id: U(41), changed_at: '2026-09-20T10:00:00Z' });
  s.customers[0].full_name = 'Cliente Ejemplo S.A.S.';
  return s;
}

beforeEach(() => {
  db = makeDb(semilla());
  permisos = new Set(EMPLEADO);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('GET /api/crm/opportunities — lista de la ola 3B', () => {
  it('solo la organización de la sesión; «Lead» en las heredadas (D2) y desde cuándo está en la etapa', async () => {
    const { status, body } = await json(await listGet(req('/api/crm/opportunities?limit=100')));
    expect(status).toBe(200);
    const filas = body.data as { id: string; es_lead: boolean; entro_etapa_en: string | null }[];
    expect(filas.map((f) => f.id)).not.toContain(U(90));
    expect(filas.find((f) => f.id === U(4))?.es_lead).toBe(true);
    expect(filas.find((f) => f.id === U(1))?.entro_etapa_en).toBe('2026-09-20T10:00:00Z');
    expect(body.total).toBe(4);
  });

  it('filtra en el servidor: estado, temperatura, cierre, sin responsable y búsqueda por nombre o cliente', async () => {
    const ids = async (q: string) => ((await json(await listGet(req(`/api/crm/opportunities?${q}`)))).body.data as { id: string }[]).map((f) => f.id).sort();
    expect(await ids('status=won')).toEqual([U(3)]);
    expect(await ids('temperature=hot')).toEqual([U(1)]);
    expect(await ids('close_from=2026-11-01&close_to=2026-11-30')).toEqual([U(2)]);
    expect(await ids('salesperson_id=none')).toEqual([U(4)]);
    expect(await ids('q=ejemplo')).toEqual([U(1), U(3)]);
    expect(await ids('q=dotaci')).toEqual([U(2)]);
  });

  it('ignora filtros inválidos (nunca confía en el cliente) y escapa comodines', async () => {
    expect((await json(await listGet(req('/api/crm/opportunities?status=todo&temperature=tibia&close_from=ayer')))).body.total).toBe(4);
    expect(textoBusqueda('50%_a,b(c)')).toBe('50\\%\\_a b c');
  });

  it('403 sin crm.opportunities.view', async () => {
    permisos.delete('crm.opportunities.view');
    expect((await listGet(req('/api/crm/opportunities'))).status).toBe(403);
  });

  it('POST acepta espacios del PMS (misma RPC, migración 20260930210000)', async () => {
    db.rpc.crm_create_opportunity = { data: { id: U(5) } };
    const cuerpo = { name: 'Evento', spaces: [{ space_id: U(700), nights: 2, unit_price: 100 }] };
    expect((await createPost(req('/api/crm/opportunities', 'POST', cuerpo))).status).toBe(201);
    expect(db.rpcCalls[0].args.p_data).toEqual(cuerpo);
  });
});

describe('GET /api/crm/opportunities/resumen', () => {
  it('conteos por estado, abiertas por moneda con ponderado, cierres del mes, 90 días y tasas de la organización', async () => {
    const { status, body } = await json(await resumenGet(req('/api/crm/opportunities/resumen?period_from=2026-10-01&period_to=2026-10-31&since=2026-07-01T05:00:00.000Z&today=2026-09-30')));
    expect(status).toBe(200);
    const d = body.data as { conteos: Record<string, number>; abiertas: { moneda: string; monto: number; ponderado: number; cantidad: number }[]; cierran_periodo: number; ganadas_90: number; tasas: { rate: number }[]; base: string };
    expect(d.conteos).toEqual({ open: 3, won: 1, lost: 0, total: 4 });
    expect(d.abiertas.find((g) => g.moneda === 'COP')).toEqual({ moneda: 'COP', monto: 12_500_000, cantidad: 2, ponderado: 7_500_000 });
    expect(d.abiertas.find((g) => g.moneda === 'USD')?.monto).toBe(3500);
    expect(d.cierran_periodo).toBe(1);
    expect(d.ganadas_90).toBe(1);
    expect(d.base).toBe('COP');
    expect(d.tasas.map((x) => x.rate)).toEqual([4000]);
  });

  it('agregarResumen: la columna suma TODAS las de su etapa; el ponderado solo abiertas', () => {
    const r = agregarResumen(
      [
        { status: 'open', stage_id: 's1', amount: 100, currency: null, expected_close_date: null, closed_at: null, etapa: { probability: 50 } },
        { status: 'won', stage_id: 's2', amount: 300, currency: 'USD', expected_close_date: null, closed_at: '2026-09-01T00:00:00Z' },
      ],
      'COP',
      null,
      '2026-07-01T00:00:00Z',
    );
    expect(r.por_etapa.s1).toEqual({ cantidad: 1, grupos: [{ moneda: 'COP', monto: 100, cantidad: 1 }] });
    expect(r.abiertas).toEqual([{ moneda: 'COP', monto: 100, cantidad: 1, ponderado: 50 }]);
    expect(r.cierran_periodo).toBeNull();
  });
});

describe('GET /api/crm/pipelines/[id]/board', () => {
  it('etapas en orden y resumen del pipeline; sin tarjetas (se piden por columna)', async () => {
    const { status, body } = await json(await boardGet(req(`/api/crm/pipelines/${U(40)}/board`), params(U(40))));
    expect(status).toBe(200);
    const d = body.data as { etapas: { id: string }[]; resumen: { por_etapa: Record<string, { cantidad: number }> } };
    expect(d.etapas.map((e) => e.id)).toEqual([U(41), U(43), U(42)]);
    expect(d.resumen.por_etapa[U(41)].cantidad).toBe(3);
    expect(d).not.toHaveProperty('oportunidades');
  });

  it('404 con el pipeline de otra organización; 400 id no uuid; 403 sin ver', async () => {
    expect((await boardGet(req(`/api/crm/pipelines/${U(95)}/board`), params(U(95)))).status).toBe(404);
    expect((await boardGet(req('/api/crm/pipelines/x/board'), params('x'))).status).toBe(400);
    permisos.delete('crm.opportunities.view');
    expect((await boardGet(req(`/api/crm/pipelines/${U(40)}/board`), params(U(40)))).status).toBe(403);
  });
});

describe('GET /api/crm/opportunities/[id] — detalle', () => {
  it('trae entro_etapa_en del último cambio de etapa y marca la heredada', async () => {
    const uno = await json(await oneGet(req(`/api/crm/opportunities/${U(1)}`), params(U(1))));
    expect((uno.body.data as { entro_etapa_en: string }).entro_etapa_en).toBe('2026-09-20T10:00:00Z');
    const lead = await json(await oneGet(req(`/api/crm/opportunities/${U(4)}`), params(U(4))));
    expect((lead.body.data as { es_lead: boolean }).es_lead).toBe(true);
  });
});

describe('PUT /api/crm/opportunities/[id]/score — calificación por el servidor', () => {
  it('calcula con la configuración de la organización y guarda score, temperatura y respuestas', async () => {
    const { status, body } = await json(await scorePut(req(`/api/crm/opportunities/${U(1)}/score`, 'PUT', { answers: [{ key: 'presupuesto', value: 'si' }] }), params(U(1))));
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ score_total: 100, temperature: 'hot' });
    const w = db.writes.find((x) => x.table === 'opportunities');
    expect(w?.payload).toMatchObject({ score_total: 100, temperature: 'hot' });
    expect(w?.filtros).toEqual(expect.arrayContaining([{ k: 'eq', col: 'organization_id', v: ORG }, { k: 'eq', col: 'id', v: U(1) }]));
  });

  it('el navegador no manda el score (400) y una ajena sin edit_any es 403 sin escribir', async () => {
    expect((await scorePut(req(`/api/crm/opportunities/${U(1)}/score`, 'PUT', { answers: [], score_total: 100 }), params(U(1)))).status).toBe(400);
    expect((await scorePut(req(`/api/crm/opportunities/${U(2)}/score`, 'PUT', { answers: [] }), params(U(2)))).status).toBe(403);
    expect(db.writes).toEqual([]);
  });
});

describe('PATCH /api/crm/opportunities/[id]/seguimiento', () => {
  it('lo editable va por crm_update_opportunity; canal y resultado se escriben en el servidor con la organización', async () => {
    db.rpc.crm_update_opportunity = { data: { id: U(1), next_action: 'Llamar' } };
    const { status } = await json(await seguimientoPatch(req(`/api/crm/opportunities/${U(1)}/seguimiento`, 'PATCH', { next_action: 'Llamar', temperature: 'warm', contact_channel: 'whatsapp', contact_result: 'reached' }), params(U(1))));
    expect(status).toBe(200);
    expect(db.rpcCalls).toEqual([{ fn: 'crm_update_opportunity', args: { p_org: ORG, p_id: U(1), p_data: { next_action: 'Llamar', temperature: 'warm' }, p_expected_updated_at: null } }]);
    const w = db.writes.find((x) => x.table === 'opportunities');
    expect(w?.payload).toEqual({ contact_channel: 'whatsapp', contact_result: 'reached' });
    expect(w?.filtros).toEqual(expect.arrayContaining([{ k: 'eq', col: 'organization_id', v: ORG }]));
  });

  it('400 con un canal fuera de catálogo; 403 con organización ajena en el body; 403 sobre una ajena', async () => {
    expect((await seguimientoPatch(req(`/api/crm/opportunities/${U(1)}/seguimiento`, 'PATCH', { contact_channel: 'paloma' }), params(U(1)))).status).toBe(400);
    expect((await seguimientoPatch(req(`/api/crm/opportunities/${U(1)}/seguimiento`, 'PATCH', { next_action: 'x', organization_id: OTRA }), params(U(1)))).status).toBe(403);
    expect((await seguimientoPatch(req(`/api/crm/opportunities/${U(2)}/seguimiento`, 'PATCH', { next_action: 'x' }), params(U(2)))).status).toBe(403);
    expect(db.writes.length + db.rpcCalls.length).toBe(0);
  });
});

describe('GET /api/crm/loss-reasons', () => {
  it('globales + de la organización, nunca los de otra', async () => {
    const { body } = await json(await motivosGet(req('/api/crm/loss-reasons')));
    expect((body.data as { label: string }[]).map((m) => m.label)).toEqual(['Precio', 'Competencia']);
  });
});
