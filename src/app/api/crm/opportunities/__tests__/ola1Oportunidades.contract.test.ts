/// <reference types="jest" />
/**
 * CRM ola 1 — contrato de las rutas de oportunidades y pipelines
 * (docs/crm/PLAN-FIGMA-A-CODIGO.md §7.4.2, decisiones D2, D4 y D5).
 *
 * Para cada ruta: la organización sale de la sesión (401 sin sesión), una
 * organización ajena en el body o la query da 403 y no se escribe nada, el
 * permiso `crm.*` se resuelve en el SERVIDOR (403 sin él, nunca por nombre de
 * rol), 404 fuera de la organización y 400 ante un cuerpo inválido. Las RPC
 * se doblan devolviendo el SQLSTATE que lanza la base real.
 */

const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

import { fakeSupabase, makeDb, seed, ORG, OTRA, U, YO, type Ola1Db } from '../../__tests__/ola1Fake';

let db: Ola1Db;
let permisos: Set<string>;

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: ORG, userId: YO, roleId: 4, roleName: 'Empleado', isSuperAdmin: false, supabase: fakeSupabase(db) })),
  hasOrgAdminOrPermission: jest.fn(async (_ctx: unknown, code: string) => permisos.has(code)),
}));

const changeStageMock = jest.fn();
jest.mock('@/lib/services/crm/opportunityStageService', () => ({
  changeStage: (...args: unknown[]) => changeStageMock(...args),
}));
jest.mock('@/lib/services/crm/crmFinanceService', () => ({
  getOpportunityFinance360: jest.fn(async () => ({ invoices: [], payments: [] })),
  getCustomerFinance360: jest.fn(async () => ({})),
}));

import { NextRequest } from 'next/server';
import { getServerOrgContext, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { GET as listGet, POST as createPost } from '../route';
import { GET as oneGet, PATCH as onePatch, DELETE as oneDelete } from '../[id]/route';
import { PATCH as stagePatch } from '../[id]/stage/route';
import { POST as winPost } from '../[id]/win/route';
import { POST as losePost } from '../[id]/lose/route';
import { PUT as customerPut } from '../[id]/customer/route';
import { GET as meetingsGet } from '../[id]/meetings/route';
import { GET as historyGet } from '../[id]/stage-history/route';
import { GET as financeGet } from '../[id]/finance/route';
import { GET as pipelinesGet, POST as pipelinesPost } from '../../pipelines/route';
import { PATCH as pipelinePatch, DELETE as pipelineDelete } from '../../pipelines/[id]/route';
import { POST as importPost } from '../../pipeline-templates/[id]/import/route';

const EMPLEADO = ['crm.opportunities.view', 'crm.opportunities.create', 'crm.opportunities.edit', 'crm.leads.view', 'crm.leads.create', 'crm.leads.edit', 'crm.leads.convert'];
const MANAGER = [
  ...EMPLEADO,
  'crm.opportunities.edit_any', 'crm.opportunities.delete', 'crm.opportunities.close',
  'crm.stages.manage', 'crm.stages.override_gate', 'crm.pipelines.manage', 'crm.activities.edit_any', 'crm.leads.assign',
];

const req = (url: string, method = 'GET', body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as Record<string, unknown> });
const escrituras = () => db.writes.length + db.rpcCalls.length;

beforeEach(() => {
  db = makeDb(seed());
  permisos = new Set(EMPLEADO);
  changeStageMock.mockReset();
  changeStageMock.mockResolvedValue({ ok: true, opportunity: { id: U(1) }, stage: { id: U(43), name: 'Ganado', is_won: true, is_lost: false }, gate: null, overridden: false });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('POST /api/crm/opportunities', () => {
  const cuerpo = { name: 'Implementación POS', amount: 1200, customer_id: U(10), temperature: 'hot', products: [{ product_id: 7, quantity: 2, unit_price: 500 }] };

  it('201: llama a crm_create_opportunity con la organización de la sesión y el cuerpo sin organización', async () => {
    db.rpc.crm_create_opportunity = { data: { id: U(5), record_type: 'deal' } };
    const { status, body } = await json(await createPost(req('/api/crm/opportunities', 'POST', { ...cuerpo, organization_id: ORG })));
    expect(status).toBe(201);
    expect(body.data).toEqual({ id: U(5), record_type: 'deal' });
    expect(db.rpcCalls).toEqual([{ fn: 'crm_create_opportunity', args: { p_org: ORG, p_data: cuerpo } }]);
  });

  it('401 sin sesión y nada se escribe', async () => {
    (getServerOrgContext as jest.Mock).mockRejectedValueOnce(new RealOrgContextError('No autenticado', 401));
    expect((await createPost(req('/api/crm/opportunities', 'POST', cuerpo))).status).toBe(401);
    expect(escrituras()).toBe(0);
  });

  it('403 con una organización ajena en el body o en la query, y nada se escribe', async () => {
    expect((await createPost(req('/api/crm/opportunities', 'POST', { ...cuerpo, organization_id: OTRA }))).status).toBe(403);
    expect((await createPost(req(`/api/crm/opportunities?organization_id=${OTRA}`, 'POST', cuerpo))).status).toBe(403);
    expect(escrituras()).toBe(0);
  });

  it('403 sin crm.opportunities.create, resuelto en el servidor con el permiso (no con el rol)', async () => {
    permisos.delete('crm.opportunities.create');
    const { status, body } = await json(await createPost(req('/api/crm/opportunities', 'POST', cuerpo)));
    expect(status).toBe(403);
    expect(body.code).toBe('CRM_FORBIDDEN');
    expect(hasOrgAdminOrPermission).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORG, userId: YO }), 'crm.opportunities.create');
    expect(escrituras()).toBe(0);
  });

  it.each([
    ['sin nombre', { amount: 1 }],
    ['monto negativo', { name: 'X', amount: -1 }],
    ['record_type en el cuerpo (D2: siempre deal)', { name: 'X', record_type: 'lead' }],
    ['temperatura fuera de catálogo (D4)', { name: 'X', temperature: 'tibia' }],
    ['origen pos (D8: el POS no abre oportunidades)', { name: 'X', origen: 'pos' }],
  ])('400 %s y la RPC no se llama', async (_n, b) => {
    expect((await createPost(req('/api/crm/opportunities', 'POST', b))).status).toBe(400);
    expect(db.rpcCalls).toEqual([]);
  });

  it.each([
    [{ code: 'P0001', message: 'sin_embudo_ventas' }, 409],
    [{ code: 'P0002', message: 'cliente_no_encontrado' }, 404],
    [{ code: '42501', message: 'sin_permiso' }, 403],
    [{ code: '22023', message: 'etapa_terminal' }, 400],
  ])('traduce el error de la RPC %j a %i con su código', async (error, esperado) => {
    db.rpc.crm_create_opportunity = { error };
    const { status, body } = await json(await createPost(req('/api/crm/opportunities', 'POST', cuerpo)));
    expect(status).toBe(esperado);
    expect(body.code).toBe(error.message);
  });

  it('500 sin filtrar el texto de Postgres ante un error inesperado', async () => {
    db.rpc.crm_create_opportunity = { error: { code: 'XX000', message: 'relation "x" does not exist' } };
    const { status, body } = await json(await createPost(req('/api/crm/opportunities', 'POST', cuerpo)));
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toMatch(/relation/);
  });
});

describe('GET /api/crm/opportunities y /[id]', () => {
  it('lista solo la organización de la sesión, paginada, y marca las leads heredadas (D2)', async () => {
    const { status, body } = await json(await listGet(req('/api/crm/opportunities?limit=2&page=1')));
    expect(status).toBe(200);
    expect(body).toMatchObject({ page: 1, limit: 2, total: 4 });
    const todas = await json(await listGet(req('/api/crm/opportunities?limit=100')));
    const filas = todas.body.data as Array<Record<string, unknown>>;
    expect(filas.map((f) => f.name)).not.toContain('Señuelo');
    expect(filas.find((f) => f.name === 'Lead heredado')).toMatchObject({ es_lead: true });
  });

  it('403 sin crm.opportunities.view; 404 una oportunidad de otra organización; 400 id no uuid', async () => {
    expect((await oneGet(req(`/api/crm/opportunities/${U(90)}`), params(U(90)))).status).toBe(404);
    expect((await oneGet(req('/api/crm/opportunities/x'), params('x'))).status).toBe(400);
    permisos.delete('crm.opportunities.view');
    expect((await listGet(req('/api/crm/opportunities'))).status).toBe(403);
  });
});

describe('PATCH y DELETE /api/crm/opportunities/[id]', () => {
  it('PATCH pasa por crm_update_opportunity con el bloqueo optimista', async () => {
    db.rpc.crm_update_opportunity = { data: { id: U(1) } };
    const r = await onePatch(req(`/api/crm/opportunities/${U(1)}`, 'PATCH', { amount: 10, expected_updated_at: '2026-09-29T10:00:00Z' }), params(U(1)));
    expect(r.status).toBe(200);
    expect(db.rpcCalls[0]).toEqual({ fn: 'crm_update_opportunity', args: { p_org: ORG, p_id: U(1), p_data: { amount: 10 }, p_expected_updated_at: '2026-09-29T10:00:00Z' } });
  });

  it('PATCH de etapa, estado o cierre → 400 campo_no_editable (van por …/stage, …/win, …/lose)', async () => {
    const { status, body } = await json(await onePatch(req(`/api/crm/opportunities/${U(1)}`, 'PATCH', { stage_id: U(43), status: 'won' }), params(U(1))));
    expect(status).toBe(400);
    expect(body).toMatchObject({ code: 'campo_no_editable', campos: ['stage_id', 'status'] });
    expect(db.rpcCalls).toEqual([]);
  });

  it('PATCH: ajena sin edit_any (la base responde no_es_propia) → 403; conflicto → 409', async () => {
    db.rpc.crm_update_opportunity = { error: { code: '42501', message: 'no_es_propia' } };
    expect((await json(await onePatch(req(`/api/crm/opportunities/${U(2)}`, 'PATCH', { amount: 1 }), params(U(2))))).body.code).toBe('no_es_propia');
    db.rpc.crm_update_opportunity = { error: { code: '40001', message: 'conflicto' } };
    expect((await onePatch(req(`/api/crm/opportunities/${U(1)}`, 'PATCH', { amount: 1 }), params(U(1)))).status).toBe(409);
  });

  it('DELETE: Empleado (sin crm.opportunities.delete) → 403 sin llamar a la RPC; Manager con documentos → 409', async () => {
    expect((await oneDelete(req(`/api/crm/opportunities/${U(1)}`, 'DELETE'), params(U(1)))).status).toBe(403);
    expect(db.rpcCalls).toEqual([]);
    permisos = new Set(MANAGER);
    db.rpc.crm_delete_opportunity = { error: { code: 'P0001', message: 'con_documentos' } };
    const { status, body } = await json(await oneDelete(req(`/api/crm/opportunities/${U(1)}`, 'DELETE'), params(U(1))));
    expect(status).toBe(409);
    expect(body.code).toBe('con_documentos');
  });

  it('DELETE con organización ajena en la query → 403', async () => {
    permisos = new Set(MANAGER);
    expect((await oneDelete(req(`/api/crm/opportunities/${U(1)}?organization_id=${OTRA}`, 'DELETE'), params(U(1)))).status).toBe(403);
    expect(db.rpcCalls).toEqual([]);
  });
});

describe('PATCH …/stage, POST …/win y …/lose: permisos por oportunidad (D5)', () => {
  it('Empleado mueve SU oportunidad por opportunityStageService', async () => {
    const r = await stagePatch(req(`/api/crm/opportunities/${U(1)}/stage`, 'PATCH', { stage_id: U(41) }), params(U(1)));
    expect(r.status).toBe(200);
    expect(changeStageMock).toHaveBeenCalledWith(ORG, YO, expect.objectContaining({ opportunityId: U(1), stageId: U(41) }), expect.anything());
  });

  it('Empleado no mueve una oportunidad ajena (403 no_es_propia) ni la de otra organización (404)', async () => {
    const ajena = await json(await stagePatch(req(`/api/crm/opportunities/${U(2)}/stage`, 'PATCH', { stage_id: U(41) }), params(U(2))));
    expect(ajena.status).toBe(403);
    expect(ajena.body.code).toBe('no_es_propia');
    expect((await stagePatch(req(`/api/crm/opportunities/${U(90)}/stage`, 'PATCH', { stage_id: U(96) }), params(U(90)))).status).toBe(404);
    expect(changeStageMock).not.toHaveBeenCalled();
  });

  it('Empleado: cerrar (won_data), reabrir una ganada o saltar el gate exige close / override_gate → 403', async () => {
    expect((await stagePatch(req(`/api/crm/opportunities/${U(1)}/stage`, 'PATCH', { stage_id: U(43), won_data: { producto: 'POS' } }), params(U(1)))).status).toBe(403);
    expect((await stagePatch(req(`/api/crm/opportunities/${U(3)}/stage`, 'PATCH', { stage_id: U(41) }), params(U(3)))).status).toBe(403);
    expect((await stagePatch(req(`/api/crm/opportunities/${U(1)}/stage`, 'PATCH', { stage_id: U(41), override: true }), params(U(1)))).status).toBe(403);
    expect(changeStageMock).not.toHaveBeenCalled();
  });

  it('Manager (edit_any + close + override_gate) sí puede, también sobre una ajena', async () => {
    permisos = new Set(MANAGER);
    expect((await stagePatch(req(`/api/crm/opportunities/${U(2)}/stage`, 'PATCH', { stage_id: U(41), override: true, override_reason: 'excepción' }), params(U(2)))).status).toBe(200);
  });

  it('win: mueve a la etapa is_won del pipeline con won_data; sin close → 403', async () => {
    expect((await winPost(req(`/api/crm/opportunities/${U(1)}/win`, 'POST', { won_data: { producto: 'POS' } }), params(U(1)))).status).toBe(403);
    permisos.add('crm.opportunities.close');
    const r = await winPost(req(`/api/crm/opportunities/${U(1)}/win`, 'POST', { won_data: { producto: 'POS' } }), params(U(1)));
    expect(r.status).toBe(200);
    expect(changeStageMock).toHaveBeenCalledWith(ORG, YO, expect.objectContaining({ stageId: U(43), wonData: { producto: 'POS' } }), expect.anything());
  });

  it('win sin etapa ganadora en el pipeline → 409 sin_etapa_ganada; won_data vacío → 400', async () => {
    permisos.add('crm.opportunities.close');
    db.t.stages = db.t.stages.filter((s) => s.id !== U(43));
    const { status, body } = await json(await winPost(req(`/api/crm/opportunities/${U(1)}/win`, 'POST', { won_data: { a: 1 } }), params(U(1))));
    expect(status).toBe(409);
    expect(body.code).toBe('sin_etapa_ganada');
    expect((await winPost(req(`/api/crm/opportunities/${U(1)}/win`, 'POST', { won_data: {} }), params(U(1)))).status).toBe(400);
  });

  it('lose: SIEMPRE mueve a la etapa is_lost con el motivo; sin motivo → 400; etapa ajena al pipeline → 400', async () => {
    permisos.add('crm.opportunities.close');
    expect((await losePost(req(`/api/crm/opportunities/${U(1)}/lose`, 'POST', { loss_data: {} }), params(U(1)))).status).toBe(400);
    expect((await losePost(req(`/api/crm/opportunities/${U(1)}/lose`, 'POST', { loss_data: { lossReasonId: 'precio' }, stage_id: U(41) }), params(U(1)))).status).toBe(400);
    const r = await losePost(req(`/api/crm/opportunities/${U(1)}/lose`, 'POST', { loss_data: { lossReasonId: 'precio', lossReasonLabel: 'Precio' } }), params(U(1)));
    expect(r.status).toBe(200);
    expect(changeStageMock).toHaveBeenCalledWith(ORG, YO, expect.objectContaining({ stageId: U(42), lossData: { lossReasonId: 'precio', lossReasonLabel: 'Precio' } }), expect.anything());
  });

  it('el resultado del servicio se traduce igual en las tres rutas (gate → 409)', async () => {
    permisos.add('crm.opportunities.close');
    changeStageMock.mockResolvedValue({ ok: false, reason: 'gate', gate: { ok: false, missing: [{ key: 'x' }] }, stage: { id: U(42), name: 'Perdido' } });
    const { status, body } = await json(await losePost(req(`/api/crm/opportunities/${U(1)}/lose`, 'POST', { loss_data: { lossReasonLabel: 'Precio' } }), params(U(1))));
    expect(status).toBe(409);
    expect(body.reason).toBe('gate');
  });
});

describe('vincular cliente, reuniones, historial y resumen financiero', () => {
  it('PUT …/customer: edición con crm_update_opportunity; cliente ajeno → 404 de la base', async () => {
    db.rpc.crm_update_opportunity = { data: { id: U(1), customer_id: U(10) } };
    expect((await customerPut(req(`/api/crm/opportunities/${U(1)}/customer`, 'PUT', { customer_id: U(10) }), params(U(1)))).status).toBe(200);
    expect(db.rpcCalls[0].args).toMatchObject({ p_org: ORG, p_id: U(1), p_data: { customer_id: U(10) } });
    db.rpc.crm_update_opportunity = { error: { code: 'P0002', message: 'cliente_no_encontrado' } };
    expect((await customerPut(req(`/api/crm/opportunities/${U(1)}/customer`, 'PUT', { customer_id: U(91) }), params(U(1)))).status).toBe(404);
    expect((await customerPut(req(`/api/crm/opportunities/${U(1)}/customer`, 'PUT', { customer_id: 'x' }), params(U(1)))).status).toBe(400);
  });

  it('GET …/meetings lee calendar_events.opportunity_id solo de la organización (M3)', async () => {
    const { status, body } = await json(await meetingsGet(req(`/api/crm/opportunities/${U(1)}/meetings`), params(U(1))));
    expect(status).toBe(200);
    expect((body.data as Array<{ title: string }>).map((m) => m.title)).toEqual(['Demo']);
    expect((await meetingsGet(req(`/api/crm/opportunities/${U(90)}/meetings`), params(U(90)))).status).toBe(404);
  });

  it('GET …/stage-history devuelve el historial y desde cuándo está en la etapa', async () => {
    const { status, body } = await json(await historyGet(req(`/api/crm/opportunities/${U(1)}/stage-history`), params(U(1))));
    expect(status).toBe(200);
    expect(body.en_etapa_desde).toBe('2026-09-01T10:00:00Z');
  });

  it('GET …/finance exige ver oportunidades y que sea de la organización', async () => {
    expect((await financeGet(req(`/api/crm/opportunities/${U(1)}/finance`), params(U(1)))).status).toBe(200);
    expect((await financeGet(req(`/api/crm/opportunities/${U(90)}/finance`), params(U(90)))).status).toBe(404);
    permisos.delete('crm.opportunities.view');
    expect((await financeGet(req(`/api/crm/opportunities/${U(1)}/finance`), params(U(1)))).status).toBe(403);
  });
});

describe('pipelines (M6)', () => {
  it('POST desde la plantilla de ventas: una sola RPC con sus 9 etapas en orden; Empleado → 403', async () => {
    expect((await pipelinesPost(req('/api/crm/pipelines', 'POST', { template: 'sales' }))).status).toBe(403);
    expect(db.rpcCalls).toEqual([]);
    permisos = new Set(MANAGER);
    db.rpc.crm_create_pipeline_with_stages = { data: { pipeline: { id: U(40) }, stages: [] } };
    expect((await pipelinesPost(req('/api/crm/pipelines', 'POST', { template: 'sales', is_default: true }))).status).toBe(201);
    const datos = db.rpcCalls[0].args.p_data as { name: string; pipeline_type: string; is_default: boolean; stages: Array<{ name: string; is_won?: boolean; is_lost?: boolean }> };
    expect(db.rpcCalls[0].args.p_org).toBe(ORG);
    expect(datos).toMatchObject({ name: 'Ventas', pipeline_type: 'sales', is_default: true });
    expect(datos.stages).toHaveLength(9);
    expect(datos.stages.filter((s) => s.is_won)).toHaveLength(1);
    expect(datos.stages.filter((s) => s.is_lost)).toHaveLength(1);
  });

  it('POST: plantilla desconocida → 404; «en blanco» sin etapas → 400; validación de la base → 400; nombre repetido → 409', async () => {
    permisos = new Set(MANAGER);
    expect((await pipelinesPost(req('/api/crm/pipelines', 'POST', { template: 'nope' }))).status).toBe(404);
    expect((await pipelinesPost(req('/api/crm/pipelines', 'POST', { template: 'blank', name: 'Vacío' }))).status).toBe(400);
    db.rpc.crm_create_pipeline_with_stages = { error: { code: '22023', message: 'sin_etapa_ganada' } };
    const r = await json(await pipelinesPost(req('/api/crm/pipelines', 'POST', { name: 'Propio', stages: [{ name: 'A' }, { name: 'P', is_lost: true }] })));
    expect(r).toMatchObject({ status: 400, body: { code: 'sin_etapa_ganada' } });
    db.rpc.crm_create_pipeline_with_stages = { error: { code: '23505', message: 'nombre_duplicado' } };
    expect((await pipelinesPost(req('/api/crm/pipelines', 'POST', { template: 'sales' }))).status).toBe(409);
  });

  it('importar plantilla usa la misma RPC y exige crm.pipelines.manage', async () => {
    expect((await importPost(req('/api/crm/pipeline-templates/sales/import', 'POST', {}), params('sales'))).status).toBe(403);
    permisos = new Set(MANAGER);
    db.rpc.crm_create_pipeline_with_stages = { data: { pipeline: { id: U(40), name: 'Mi embudo', is_default: false }, stages: new Array(9).fill({}) } };
    const { status, body } = await json(await importPost(req('/api/crm/pipeline-templates/sales/import', 'POST', { pipelineName: 'Mi embudo' }), params('sales')));
    expect(status).toBe(201);
    expect(body.data).toMatchObject({ pipelineId: U(40), stagesCreated: 9, templateId: 'sales' });
    expect(db.writes).toEqual([]); // nada de escrituras sueltas: todo en la RPC
  });

  it('PATCH por defecto y DELETE con guarda; organización ajena en el body → 403', async () => {
    permisos = new Set(MANAGER);
    db.rpc.crm_set_default_pipeline = { data: { id: U(40), is_default: true } };
    expect((await pipelinePatch(req(`/api/crm/pipelines/${U(40)}`, 'PATCH', { is_default: true }), params(U(40)))).status).toBe(200);
    expect((await pipelinePatch(req(`/api/crm/pipelines/${U(40)}`, 'PATCH', { is_default: true, organization_id: OTRA }), params(U(40)))).status).toBe(403);
    db.rpc.crm_delete_pipeline = { error: { code: 'P0001', message: 'pipeline_con_oportunidades' } };
    expect((await json(await pipelineDelete(req(`/api/crm/pipelines/${U(40)}`, 'DELETE'), params(U(40))))).body.code).toBe('pipeline_con_oportunidades');
  });

  it('GET lista con ver oportunidades', async () => {
    expect((await pipelinesGet(req('/api/crm/pipelines'))).status).toBe(200);
  });
});
