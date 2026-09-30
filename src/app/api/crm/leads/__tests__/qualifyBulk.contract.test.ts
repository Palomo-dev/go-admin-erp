/// <reference types="jest" />
/**
 * «Calificar en lote» — POST /api/crm/leads/qualify-bulk.
 *
 * Mismo doble de Supabase que la ola 1: la organización sale de la sesión, un
 * lead de la 121 sale en `fallidas` (nunca se crea), cada alta es la RPC de
 * `calificarLead` con el prellenado de cada lead, y un lead que falla no
 * detiene a los demás.
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
import { POST } from '../qualify-bulk/route';

const EMPLEADO = ['crm.opportunities.view', 'crm.opportunities.create', 'crm.leads.view'];

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/crm/leads/qualify-bulk', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as Record<string, unknown> });
type Resultado = { creadas: Array<{ customer_id: string; opportunity_id: string | null; nombre: string }>; fallidas: Array<{ customer_id: string; nombre: string | null; codigo: string }> };

/** RPC programada por llamada: devuelve un id por lead y falla para los ids indicados. */
function rpcPorLead(fallos: Record<string, { code: string; message: string }> = {}) {
  const f = fakeSupabase(db);
  return async (fn: string, args: Record<string, unknown>) => {
    const cliente = (args.p_data as { customer_id: string }).customer_id;
    db.rpc[fn] = fallos[cliente] ? { error: fallos[cliente] } : { data: { id: `opp-${cliente.slice(-2)}` } };
    return f.rpc(fn, args);
  };
}

beforeEach(() => {
  db = makeDb(seed());
  permisos = new Set(EMPLEADO);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

async function conRpc(fallos: Record<string, { code: string; message: string }>, body: unknown) {
  const { getServerOrgContext } = jest.requireMock<{ getServerOrgContext: jest.Mock }>('@/lib/utils/orgContext');
  getServerOrgContext.mockImplementationOnce(async () => ({ organizationId: ORG, userId: YO, roleId: 4, roleName: 'Empleado', isSuperAdmin: false, supabase: { ...fakeSupabase(db), rpc: rpcPorLead(fallos) } }));
  return json(await POST(req(body)));
}

describe('POST /api/crm/leads/qualify-bulk', () => {
  it('crea una oportunidad por lead, en orden, con el nombre del patrón y el prellenado de cada lead', async () => {
    const { status, body } = await conRpc({}, {
      customer_ids: [U(10), U(11), U(10)],
      patron_nombre: 'Uniformes · {cliente}',
      plantilla: { temperature: 'hot', discovery_data: { necesidad: 'Uniformes' } },
    });
    expect(status).toBe(200);
    const r = body.data as Resultado;
    expect(r.creadas).toEqual([
      { customer_id: U(10), opportunity_id: 'opp-10', nombre: 'Uniformes · Lead uno' },
      { customer_id: U(11), opportunity_id: 'opp-11', nombre: 'Uniformes · Lead ajeno' },
    ]);
    expect(r.fallidas).toEqual([]);
    expect(db.rpcCalls.map((c) => c.fn)).toEqual(['crm_create_opportunity', 'crm_create_opportunity']);
    // Sin responsable en la plantilla: cada lead conserva el suyo; el valor estimado sale de metadata.lead.
    expect(db.rpcCalls[0].args).toEqual({
      p_org: ORG,
      p_data: { temperature: 'hot', discovery_data: { necesidad: 'Uniformes' }, name: 'Uniformes · Lead uno', customer_id: U(10), origen: 'lead', amount: 900, currency: 'USD', deal_type: 'new', salesperson_id: YO },
    });
    expect(db.rpcCalls[1].args.p_data).toMatchObject({ customer_id: U(11), salesperson_id: OTRO_VENDEDOR, origen: 'lead' });
  });

  it('lead de otra organización → fallida no_encontrado sin nombre (nunca se crea); no-lead → no_es_lead; un fallo no detiene a los demás', async () => {
    const { status, body } = await conRpc({ [U(11)]: { code: '22023', message: 'monto_invalido' } }, {
      customer_ids: [U(91), U(13), U(11), U(10)],
      patron_nombre: '{cliente}',
    });
    expect(status).toBe(200);
    const r = body.data as Resultado;
    expect(r.creadas.map((c) => c.customer_id)).toEqual([U(10)]);
    expect(r.fallidas).toEqual([
      { customer_id: U(91), nombre: null, codigo: 'no_encontrado', mensaje: 'Lead no encontrado' },
      { customer_id: U(13), nombre: 'Cliente comprador', codigo: 'no_es_lead', mensaje: 'El cliente ya no está en etapa lead' },
      { customer_id: U(11), nombre: 'Lead ajeno', codigo: 'monto_invalido', mensaje: 'monto_invalido' },
    ]);
    expect(db.rpcCalls.every((c) => (c.args.p_data as { customer_id: string }).customer_id !== U(91))).toBe(true);
  });

  it('sin embudo de ventas: al primer fallo deja de llamar a la base y marca el resto con el mismo código', async () => {
    const sinEmbudo = { code: 'P0001', message: 'sin_embudo_ventas' };
    const { body } = await conRpc({ [U(10)]: sinEmbudo, [U(11)]: sinEmbudo }, { customer_ids: [U(10), U(11)], patron_nombre: 'X · {cliente}' });
    const r = body.data as Resultado;
    expect(r.creadas).toEqual([]);
    expect(r.fallidas.map((f) => f.codigo)).toEqual(['sin_embudo_ventas', 'sin_embudo_ventas']);
    expect(db.rpcCalls).toHaveLength(1);
  });

  it('sin crm.opportunities.create → 403 y nada se llama', async () => {
    permisos.delete('crm.opportunities.create');
    const { status } = await json(await POST(req({ customer_ids: [U(10)], patron_nombre: '{cliente}' })));
    expect(status).toBe(403);
    expect(db.rpcCalls).toEqual([]);
  });

  it('400: más de 100 ids, sin ids, patrón vacío, id no uuid, o cliente/origen/nombre en la plantilla', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => U(1000 + i));
    expect((await POST(req({ customer_ids: ids, patron_nombre: '{cliente}' }))).status).toBe(400);
    expect((await POST(req({ customer_ids: [], patron_nombre: '{cliente}' }))).status).toBe(400);
    expect((await POST(req({ customer_ids: [U(10)], patron_nombre: '   ' }))).status).toBe(400);
    expect((await POST(req({ customer_ids: ['1;drop'], patron_nombre: '{cliente}' }))).status).toBe(400);
    expect((await POST(req({ customer_ids: [U(10)], patron_nombre: '{cliente}', plantilla: { customer_id: U(11) } }))).status).toBe(400);
    expect((await POST(req({ customer_ids: [U(10)], patron_nombre: '{cliente}', plantilla: { origen: 'general' } }))).status).toBe(400);
    expect((await POST(req({ customer_ids: [U(10)], patron_nombre: '{cliente}', plantilla: { name: 'X' } }))).status).toBe(400);
    expect(db.rpcCalls).toEqual([]);
  });

  it('organización ajena en el body → 403 y la RPC no se llama', async () => {
    expect((await POST(req({ customer_ids: [U(10)], patron_nombre: '{cliente}', organization_id: OTRA }))).status).toBe(403);
    expect(db.rpcCalls).toEqual([]);
  });
});
