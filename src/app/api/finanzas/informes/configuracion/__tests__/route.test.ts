import { GET, PATCH } from '../route';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { configuracionPredeterminada } from '@/lib/finanzas/informes/configuracion';
import { cargarConfiguracionInformes, guardarConfiguracionInformes } from '@/lib/services/finanzas/configuracionInformes.server';

const mockRpc = jest.fn();
const mockContexto = { organizationId: 7, userId: 'usuario-sesion', supabase: { rpc: mockRpc } } as unknown as ServerOrgContext;
jest.mock('@/lib/utils/orgContext', () => {
  const { readOrgBody } = jest.requireActual('@/lib/security/organizationBody');
  return { readOrgBody, withOrg: (handler: (ctx: ServerOrgContext, request: Request) => Promise<Response>) => async (request: Request) => {
    try { return await handler(mockContexto, request); }
    catch (error) { const e = error as { message: string; statusCode?: number; code?: string }; return Response.json({ error: e.message, code: e.code }, { status: e.statusCode ?? 500 }); }
  } };
});
jest.mock('@/lib/services/finanzas/configuracionInformes.server', () => ({ cargarConfiguracionInformes: jest.fn(), guardarConfiguracionInformes: jest.fn() }));
const consultar = (request: Request) => GET(request, { params: Promise.resolve({}) });
const guardar = (request: Request) => PATCH(request, { params: Promise.resolve({}) });
const config = () => configuracionPredeterminada('Entidad de prueba', '900000000');
const peticion = (body: unknown, query = '') => new Request(`http://localhost/api/finanzas/informes/configuracion${query}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
beforeEach(() => { jest.clearAllMocks(); mockRpc.mockResolvedValue({ data: true, error: null }); jest.mocked(cargarConfiguracionInformes).mockResolvedValue(config()); jest.mocked(guardarConfiguracionInformes).mockResolvedValue(undefined); });

test('PATCH403 rechaza body de otra organización antes de guardar', async () => {
  const aviso = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  try { expect((await guardar(peticion({ ...config(), organization_id: 99 }))).status).toBe(403); expect(guardarConfiguracionInformes).not.toHaveBeenCalled(); }
  finally { aviso.mockRestore(); }
});
test('PATCH403 exige permiso finance.approve del servidor', async () => {
  mockRpc.mockResolvedValue({ data: false, error: null });
  expect((await guardar(peticion(config()))).status).toBe(403);
  expect(mockRpc).toHaveBeenCalledWith('check_user_permission', { p_user_id: 'usuario-sesion', p_organization_id: 7, p_permission_code: 'finance.approve' });
  expect(guardarConfiguracionInformes).not.toHaveBeenCalled();
});
test('PATCH400 rechaza configuración inválida sin llamar la RPC transaccional', async () => {
  expect((await guardar(peticion({ grupo_niif: 1 }))).status).toBe(400);
  expect(guardarConfiguracionInformes).not.toHaveBeenCalled();
});
test('PATCH403 no escribe si conserva aprobación pero perdió el permiso de lectura', async () => {
  mockRpc.mockImplementation((_nombre: string, argumentos: { p_permission_code: string }) => Promise.resolve({ data: argumentos.p_permission_code === 'finance.approve', error: null }));
  expect((await guardar(peticion(config()))).status).toBe(403);
  expect(guardarConfiguracionInformes).not.toHaveBeenCalled();
  expect(cargarConfiguracionInformes).not.toHaveBeenCalled();
});
test('PATCH conserva sesión y devuelve la configuración recargada después del guardado', async () => {
  const body = config(); body.version = 3;
  const respuesta = await guardar(peticion(body));
  expect(respuesta.status).toBe(200);
  expect(guardarConfiguracionInformes).toHaveBeenCalledWith(mockContexto.supabase, 7, body);
  expect(cargarConfiguracionInformes).toHaveBeenCalledWith(mockContexto.supabase, 7);
  expect(respuesta.headers.get('cache-control')).toBe('private, no-store');
});
test('PATCH409 conserva el conflicto de versión sin fingir guardado exitoso', async () => {
  jest.mocked(guardarConfiguracionInformes).mockRejectedValue(new OrgContextError('La configuración cambió.', 409, 'CONFIGURATION_CONFLICT'));
  const respuesta = await guardar(peticion(config()));
  expect(respuesta.status).toBe(409);
  expect(cargarConfiguracionInformes).not.toHaveBeenCalled();
});
test('GET403 no pierde la organización ajena repetida en la query', async () => {
  const aviso = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  try { expect((await consultar(new Request('http://localhost/api/finanzas/informes/configuracion?organization_id=99&organization_id=7'))).status).toBe(403); expect(cargarConfiguracionInformes).not.toHaveBeenCalled(); }
  finally { aviso.mockRestore(); }
});
