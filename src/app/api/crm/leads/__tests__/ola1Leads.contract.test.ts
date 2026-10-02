/// <reference types="jest" />
/**
 * CRM ola 1 — leads como clientes (D2), «Calificar», descartar, asignar en
 * lote, y edición/borrado de actividades y notas solo de lo propio (D5).
 *
 * Mismo patrón de contrato que las rutas de oportunidades: organización de la
 * sesión, 403 ante una organización ajena (y nada escrito), permisos `crm.*`
 * resueltos en el servidor, 404 fuera de la organización, 400 cuerpo inválido.
 */

const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

import { fakeSupabase, makeDb, seed, ORG, OTRA, U, YO, OTRO_VENDEDOR, type Ola1Db } from '../../__tests__/ola1Fake';

let db: Ola1Db;
let permisos: Set<string>;

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: ORG, userId: YO, roleId: 4, roleName: 'Empleado', isSuperAdmin: false, supabase: fakeSupabase(db) })),
  hasOrgAdminOrPermission: jest.fn(async (_ctx: unknown, code: string) => permisos.has(code)),
}));

import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { GET as leadsGet } from '../route';
import { GET as heredadosGet } from '../heredados/route';
import { POST as qualifyPost } from '../[id]/qualify/route';
import { PATCH as discardPatch } from '../[id]/discard/route';
import { POST as assignPost } from '../assign/route';
import { PATCH as activityPatch, DELETE as activityDelete } from '../../activities/[id]/route';
import { PATCH as notePatch, DELETE as noteDelete } from '../../notes/[id]/route';

const EMPLEADO = ['crm.opportunities.view', 'crm.opportunities.create', 'crm.opportunities.edit', 'crm.leads.view', 'crm.leads.create', 'crm.leads.edit', 'crm.leads.convert'];
const MANAGER = [...EMPLEADO, 'crm.opportunities.edit_any', 'crm.opportunities.close', 'crm.activities.edit_any', 'crm.leads.assign'];

const req = (url: string, method = 'GET', body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as Record<string, unknown> });

beforeEach(() => {
  db = makeDb(seed());
  permisos = new Set(EMPLEADO);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('GET /api/crm/leads — clientes en etapa lead (D2)', () => {
  it('por defecto solo leads con origen, sin descartar y de la organización de la sesión', async () => {
    const { status, body } = await json(await leadsGet(req('/api/crm/leads')));
    expect(status).toBe(200);
    const nombres = (body.data as Array<{ full_name: string }>).map((c) => c.full_name);
    expect(nombres.sort()).toEqual(['Lead ajeno', 'Lead uno']);
    expect(body.total).toBe(2);
  });

  it('filtros: origen=todos incluye las fichas sin origen; owner_id=ninguno; descartados ocultos', async () => {
    const todos = await json(await leadsGet(req('/api/crm/leads?origen=todos')));
    expect((todos.body.data as unknown[]).length).toBe(3);
    const sinDueno = await json(await leadsGet(req('/api/crm/leads?origen=todos&owner_id=ninguno')));
    expect((sinDueno.body.data as Array<{ full_name: string }>).map((c) => c.full_name)).toEqual(['Cliente sin origen']);
    db.t.customers.find((c) => c.id === U(11))!.lead_discarded_at = '2026-09-20T00:00:00Z';
    expect(((await json(await leadsGet(req('/api/crm/leads')))).body.data as unknown[]).length).toBe(1);
    expect(((await json(await leadsGet(req('/api/crm/leads?descartados=1')))).body.data as unknown[]).length).toBe(2);
  });

  it('403 sin crm.leads.view; 401 sin sesión; organización ajena en la query → 403', async () => {
    (getServerOrgContext as jest.Mock).mockRejectedValueOnce(new RealOrgContextError('No autenticado', 401));
    expect((await leadsGet(req('/api/crm/leads'))).status).toBe(401);
    permisos.delete('crm.leads.view');
    expect((await leadsGet(req('/api/crm/leads'))).status).toBe(403);
    expect((await heredadosGet(req('/api/crm/leads/heredados'))).status).toBe(403);
  });

  it('las oportunidades lead heredadas siguen en /heredados mientras la pantalla actual las use', async () => {
    const { status, body } = await json(await heredadosGet(req('/api/crm/leads/heredados')));
    expect(status).toBe(200);
    expect((body.data as Array<{ name: string }>).map((o) => o.name)).toEqual(['Lead heredado']);
  });
});

describe('POST /api/crm/leads/[id]/qualify — «Calificar» crea la oportunidad', () => {
  it('llama a crm_create_opportunity con origen lead, el cliente de la ruta y el prellenado de metadata.lead', async () => {
    db.rpc.crm_create_opportunity = { data: { id: U(5), record_type: 'deal', customer_id: U(10) } };
    const { status } = await json(await qualifyPost(req(`/api/crm/leads/${U(10)}/qualify`, 'POST', { name: 'Implementación', discovery_data: { decisor: 'Gerente' } }), params(U(10))));
    expect(status).toBe(201);
    expect(db.rpcCalls).toHaveLength(1);
    expect(db.rpcCalls[0]).toEqual({
      fn: 'crm_create_opportunity',
      args: {
        p_org: ORG,
        p_data: {
          name: 'Implementación', discovery_data: { decisor: 'Gerente' }, customer_id: U(10), origen: 'lead',
          amount: 900, currency: 'USD', deal_type: 'new', temperature: 'warm', salesperson_id: YO,
        },
      },
    });
  });

  it('el cuerpo manda sobre el prellenado y no puede cambiar el cliente ni el origen', async () => {
    db.rpc.crm_create_opportunity = { data: { id: U(5) } };
    await qualifyPost(req(`/api/crm/leads/${U(10)}/qualify`, 'POST', { name: 'X', amount: 50, customer_id: U(11), origen: 'general' }), params(U(10)));
    expect(db.rpcCalls[0].args.p_data).toMatchObject({ amount: 50, customer_id: U(10), origen: 'lead' });
  });

  it('lead de otra organización → 404; sin crm.opportunities.create → 403; sin nombre → 400; sin embudo → 409', async () => {
    db.rpc.crm_create_opportunity = { data: { id: U(5) } };
    expect((await qualifyPost(req(`/api/crm/leads/${U(91)}/qualify`, 'POST', { name: 'X' }), params(U(91)))).status).toBe(404);
    expect((await qualifyPost(req(`/api/crm/leads/${U(10)}/qualify`, 'POST', {}), params(U(10)))).status).toBe(400);
    db.rpc.crm_create_opportunity = { error: { code: 'P0001', message: 'sin_embudo_ventas' } };
    expect((await json(await qualifyPost(req(`/api/crm/leads/${U(10)}/qualify`, 'POST', { name: 'X' }), params(U(10))))).body.code).toBe('sin_embudo_ventas');
    permisos.delete('crm.opportunities.create');
    expect((await qualifyPost(req(`/api/crm/leads/${U(10)}/qualify`, 'POST', { name: 'X' }), params(U(10)))).status).toBe(403);
  });

  it('organización ajena en el body → 403 y la RPC no se llama', async () => {
    expect((await qualifyPost(req(`/api/crm/leads/${U(10)}/qualify`, 'POST', { name: 'X', organization_id: OTRA }), params(U(10)))).status).toBe(403);
    expect(db.rpcCalls).toEqual([]);
  });
});

describe('descartar y asignar responsable', () => {
  it('Empleado descarta SU lead con motivo (sin tocar lifecycle_stage) y lo reactiva', async () => {
    const { status } = await json(await discardPatch(req(`/api/crm/leads/${U(10)}/discard`, 'PATCH', { reason: 'No tiene presupuesto' }), params(U(10))));
    expect(status).toBe(200);
    const ficha = db.t.customers.find((c) => c.id === U(10))!;
    expect(ficha).toMatchObject({ lead_discard_reason: 'No tiene presupuesto', lead_discarded_by: YO, lifecycle_stage: 'lead' });
    expect(ficha.lead_discarded_at).toBeTruthy();
    await discardPatch(req(`/api/crm/leads/${U(10)}/discard`, 'PATCH', { descartar: false }), params(U(10)));
    expect(db.t.customers.find((c) => c.id === U(10))!.lead_discarded_at).toBeNull();
  });

  it('Empleado no descarta el lead de otro responsable (403); Manager (assign) sí; sin motivo → 400; cliente no lead → 409', async () => {
    expect((await discardPatch(req(`/api/crm/leads/${U(11)}/discard`, 'PATCH', { reason: 'duplicado' }), params(U(11)))).status).toBe(403);
    expect((await discardPatch(req(`/api/crm/leads/${U(10)}/discard`, 'PATCH', {}), params(U(10)))).status).toBe(400);
    permisos = new Set(MANAGER);
    expect((await discardPatch(req(`/api/crm/leads/${U(11)}/discard`, 'PATCH', { reason: 'duplicado' }), params(U(11)))).status).toBe(200);
    expect((await discardPatch(req(`/api/crm/leads/${U(13)}/discard`, 'PATCH', { reason: 'duplicado' }), params(U(13)))).status).toBe(409);
    expect((await discardPatch(req(`/api/crm/leads/${U(91)}/discard`, 'PATCH', { reason: 'duplicado' }), params(U(91)))).status).toBe(404);
  });

  it('asignar en lote exige crm.leads.assign, solo toca clientes de la organización y valida el responsable', async () => {
    const cuerpo = { customer_ids: [U(10), U(11), U(91)], owner_id: OTRO_VENDEDOR };
    expect((await assignPost(req('/api/crm/leads/assign', 'POST', cuerpo))).status).toBe(403);
    permisos = new Set(MANAGER);
    const { status, body } = await json(await assignPost(req('/api/crm/leads/assign', 'POST', cuerpo)));
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ actualizados: 2 });
    expect(db.t.customers.find((c) => c.id === U(91))!.owner_id).toBe(YO); // el señuelo de la 121 no se toca
    expect((await assignPost(req('/api/crm/leads/assign', 'POST', { customer_ids: [U(10)], owner_id: U(299) }))).status).toBe(400);
    expect((await assignPost(req('/api/crm/leads/assign', 'POST', { customer_ids: [], owner_id: null }))).status).toBe(400);
    expect((await assignPost(req('/api/crm/leads/assign', 'POST', { ...cuerpo, organization_id: OTRA }))).status).toBe(403);
  });
});

describe('actividades y notas: editar y borrar solo lo propio salvo crm.activities.edit_any', () => {
  it('lo propio: 200, filtrado por la organización de la sesión', async () => {
    expect((await activityPatch(req(`/api/crm/activities/${U(60)}`, 'PATCH', { notes: 'corregida' }), params(U(60)))).status).toBe(200);
    const upd = db.writes.find((w) => w.table === 'activities' && w.op === 'update')!;
    expect(upd.filtros).toEqual(expect.arrayContaining([{ k: 'eq', col: 'organization_id', v: ORG }]));
    expect((await noteDelete(req(`/api/crm/notes/${U(70)}`, 'DELETE'), params(U(70)))).status).toBe(200);
  });

  it('lo ajeno: 403 sin edit_any y nada escrito; con edit_any 200', async () => {
    expect((await json(await activityDelete(req(`/api/crm/activities/${U(61)}`, 'DELETE'), params(U(61))))).body.code).toBe('no_es_propia');
    expect((await notePatch(req(`/api/crm/notes/${U(71)}`, 'PATCH', { body: 'x' }), params(U(71)))).status).toBe(403);
    expect(db.writes).toEqual([]);
    permisos = new Set(MANAGER);
    expect((await activityDelete(req(`/api/crm/activities/${U(61)}`, 'DELETE'), params(U(61)))).status).toBe(200);
  });

  it('reunión vinculada: no admite edición ni borrado genérico, incluso con edit_any', async () => {
    db.t.activities.push({ id: U(63), organization_id: ORG, user_id: YO, activity_type: 'meeting', notes: 'Reunión de prueba', metadata: { event_id: U(64) } });
    for (const permisosActor of [EMPLEADO, MANAGER]) {
      permisos = new Set(permisosActor);
      const edit = await json(await activityPatch(req(`/api/crm/activities/${U(63)}`, 'PATCH', { outcome: 'done', notes: 'Distinta' }), params(U(63))));
      expect(edit.status).toBe(409);
      expect(edit.body.code).toBe('reunion_administrada');
      expect((await activityDelete(req(`/api/crm/activities/${U(63)}`, 'DELETE'), params(U(63)))).status).toBe(409);
    }
    expect(db.writes).toEqual([]);
    expect(db.t.activities.find(a => a.id === U(63))!.notes).toBe('Reunión de prueba');
  });
  it('reunión ajena sigue denegada por autoría; la actividad manual sin calendario admite corrección', async () => {
    db.t.activities.push({ id: U(63), organization_id: ORG, user_id: OTRO_VENDEDOR, activity_type: 'meeting', metadata: { event_id: U(64) } });
    expect((await activityPatch(req(`/api/crm/activities/${U(63)}`, 'PATCH', { notes: 'Distinta' }), params(U(63)))).status).toBe(403);
    db.t.activities.push({ id: U(65), organization_id: ORG, user_id: YO, activity_type: 'meeting', outcome: 'held', metadata: {} });
    expect((await activityPatch(req(`/api/crm/activities/${U(65)}`, 'PATCH', { notes: 'Corrección manual' }), params(U(65)))).status).toBe(200);
  });
  it.each([
    { activity_type: 'call', call_id: U(64), metadata: {} },
    { activity_type: 'ai_call', call_id: null, metadata: { call_id: U(64) } },
  ])('llamada vinculada $activity_type se modifica en su ficha, incluso con edit_any', async vinculo => {
    db.t.activities.push({ id: U(63), organization_id: ORG, user_id: YO, notes: 'Resultado original', ...vinculo });
    for (const permisosActor of [EMPLEADO, MANAGER]) {
      permisos = new Set(permisosActor);
      const edit = await json(await activityPatch(req(`/api/crm/activities/${U(63)}`, 'PATCH', { outcome: 'answered', notes: 'Distinta' }), params(U(63))));
      expect(edit.status).toBe(409);
      expect(edit.body.code).toBe('llamada_administrada');
      expect((await activityDelete(req(`/api/crm/activities/${U(63)}`, 'DELETE'), params(U(63)))).status).toBe(409);
    }
    expect(db.writes).toEqual([]);
    expect(db.t.activities.find(a => a.id === U(63))!.notes).toBe('Resultado original');
  });
  it('una llamada manual sin registro de telefonía conserva la edición de su actividad', async () => {
    db.t.activities.push({ id: U(65), organization_id: ORG, user_id: YO, activity_type: 'call', call_id: null, metadata: {} });
    expect((await activityPatch(req(`/api/crm/activities/${U(65)}`, 'PATCH', { notes: 'Corrección manual' }), params(U(65)))).status).toBe(200);
  });
  it('actividad de sistema → 409; de otra organización → 404; cuerpo vacío o con campos extra → 400; fecha futura → 400', async () => {
    expect((await activityPatch(req(`/api/crm/activities/${U(62)}`, 'PATCH', { notes: 'x' }), params(U(62)))).status).toBe(409);
    expect((await activityDelete(req(`/api/crm/activities/${U(69)}`, 'DELETE'), params(U(69)))).status).toBe(404);
    expect((await activityPatch(req(`/api/crm/activities/${U(60)}`, 'PATCH', {}), params(U(60)))).status).toBe(400);
    expect((await activityPatch(req(`/api/crm/activities/${U(60)}`, 'PATCH', { user_id: OTRO_VENDEDOR }), params(U(60)))).status).toBe(400);
    expect((await activityPatch(req(`/api/crm/activities/${U(60)}`, 'PATCH', { occurred_at: '2999-01-01T00:00:00Z' }), params(U(60)))).status).toBe(400);
  });

  it('organización ajena en la query → 403', async () => {
    expect((await activityDelete(req(`/api/crm/activities/${U(60)}?organization_id=${OTRA}`, 'DELETE'), params(U(60)))).status).toBe(403);
    expect(db.writes).toEqual([]);
  });
});
