const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
const rpc = jest.fn();
let autenticada = true;
const from = jest.fn(() => { throw new Error('No debe escribir fuera de la RPC'); });
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError,
  getServerOrgContext: jest.fn(async () => {
    if (!autenticada) throw new RealOrgContextError('No hay sesión activa', 401, 'UNAUTHENTICATED');
    return { organizationId: 120, userId: 'actor-de-sesion', supabase: { rpc, from } };
  }),
}));
import { NextRequest } from 'next/server';
import { POST as actividadPost } from '../activities/route';
import { POST as tareaPost } from '../tasks/route';
const ID = '11111111-1111-4111-8111-111111111111';
const actividad = { activity_type: 'call', related_type: 'customer', related_id: ID, metadata: { client_key: 'reintento' }, follow_up: { title: 'Seguimiento' } };
const tarea = { title: 'Seguimiento', related_to_type: 'customer', related_to_id: ID, client_key: 'reintento' };
const req = (body: unknown) => new NextRequest('http://localhost/api/crm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
beforeEach(() => { jest.clearAllMocks(); autenticada = true; rpc.mockResolvedValue({ data: { activity: { id: ID }, id: ID }, error: null }); });

describe.each([['actividad', actividadPost, actividad, 'fn_crm_registrar_actividad'], ['tarea', tareaPost, tarea, 'fn_crm_crear_tarea']] as const)('%s atómica', (_nombre, post, body, fn) => {
  test('sin sesión conserva 401 UNAUTHENTICATED y no escribe', async () => {
    autenticada = false;
    const r = await post(req(body));
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(rpc).not.toHaveBeenCalled();
  });
  test.each(['organization_id', 'organizationId', 'org_id', 'orgId'])('organización ajena por %s → 403 antes de RPC', async key => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const r = await post(req({ ...body, [key]: 121 }));
      expect(r.status).toBe(403);
      expect(rpc).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
    } finally { warn.mockRestore(); }
  });
  test('organización coincidente se ignora; no transmite actor como autoridad', async () => {
    const r = await post(req({ ...body, organization_id: 120 }));
    expect(r.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith(fn, { p_org: 120, p_payload: body });
    expect(from).not.toHaveBeenCalled();
  });
  test.each([['42501', 403], ['P0002', 404], ['40001', 409], ['22023', 400]])('error %s se clasifica como %s sin confirmar registro', async (code, status) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: 'datos_invalidos' } });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const r = await post(req(body));
      expect(r.status).toBe(status);
      expect(await r.json()).toMatchObject({ success: false });
    } finally { warn.mockRestore(); }
  });
  test('no filtra errores internos de Postgres', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'Detalle privado del SQL' } });
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const r = await post(req(body));
      expect(r.status).toBe(500);
      expect(JSON.stringify(await r.json())).not.toContain('Detalle privado');
    } finally { log.mockRestore(); }
  });
});

test('llamada existente devuelve 409 con la fila canónica y ningún seguimiento extra', async () => {
  rpc.mockResolvedValue({ data: { activity: { id: ID }, duplicate: true }, error: null });
  const r = await actividadPost(req(actividad));
  expect(r.status).toBe(409);
  expect(await r.json()).toMatchObject({ data: { id: ID } });
  expect(rpc).toHaveBeenCalledTimes(1);
});
test('metadata administrada y autor enviados por navegador → 400', async () => {
  expect((await actividadPost(req({ ...actividad, metadata: { event_id: ID } }))).status).toBe(400);
  expect((await actividadPost(req({ ...actividad, user_id: ID }))).status).toBe(400);
  expect((await tareaPost(req({ ...tarea, created_by: ID }))).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
