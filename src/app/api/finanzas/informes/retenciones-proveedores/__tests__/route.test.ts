import { GET } from '../route';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { resolveOrgCurrency } from '@/lib/services/monedaOrganizacion';

const mockRpc = jest.fn();
let mockBranchFound = true;
const mockConsulta = {
  select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), or: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn(async () => ({ data: mockBranchFound ? { id: 8 } : null, error: null })),
  range: jest.fn(async () => ({ data: [{ id: '00000000-0000-4000-8000-000000000001', code: 'C1', name: 'Centro de prueba' }], error: null })),
};
const mockFrom = jest.fn(() => mockConsulta);
const mockContexto = { organizationId: 7, userId: 'usuario-sesion', organizationName: 'Entidad de prueba', supabase: { rpc: mockRpc, from: mockFrom } } as unknown as ServerOrgContext;
jest.mock('@/lib/utils/orgContext', () => ({
  ...jest.requireActual('@/lib/utils/orgContextError'),
  readOrgBody: jest.requireActual('@/lib/security/organizationBody').readOrgBody,
  withOrg: (handler: (ctx: ServerOrgContext, request: Request) => Promise<Response>) => async (request: Request) => {
    try { return await handler(mockContexto, request); }
    catch (error) { const e = error as { statusCode?: number; code?: string; message: string }; return Response.json({ error: e.message, code: e.code }, { status: e.statusCode ?? 500 }); }
  },
}));
jest.mock('@/lib/services/monedaOrganizacion', () => ({ resolveOrgCurrency: jest.fn(), monedaDelPais: jest.requireActual('@/lib/services/monedaOrganizacion').monedaDelPais }));
const consultar = (extra = '') => GET(new Request(`http://localhost/api/finanzas/informes/retenciones-proveedores?desde=2024-02-29&hasta=2024-03-15${extra}`), { params: Promise.resolve({}) });
beforeEach(() => {
  jest.clearAllMocks(); mockBranchFound = true;
  jest.mocked(resolveOrgCurrency).mockResolvedValue({ code: 'COP', decimals: 2, source: 'base', symbol: '$' });
  mockRpc.mockImplementation(async (nombre: string) => nombre === 'fn_certificado_retenciones_proveedor' ? { data: { conceptos: [{ clase: 'retefuente', concepto: 'Compras', cuenta: '236540', tarifa: '2.5', base: '1000', valor: '25' }] }, error: null } : { data: true, error: null });
});

test('sin proveedor solo carga opciones, sin recalcular estados ni generar un certificado', async () => {
  const r = await consultar('&branch_id=8');
  expect(r.status).toBe(200);
  expect((await r.json()).centros).toHaveLength(1);
  expect(mockRpc).not.toHaveBeenCalledWith('fn_certificado_retenciones_proveedor', expect.anything());
});
test('usa la RPC canónica en ambos periodos con organización de sesión, filtro exacto y sin emitir', async () => {
  const cc = '00000000-0000-4000-8000-000000000001';
  const r = await consultar(`&supplier_id=5&branch_id=8&cost_center_id=${cc}`);
  expect(r.status).toBe(200);
  expect(r.headers.get('cache-control')).toBe('private, no-store');
  const llamadas = mockRpc.mock.calls.filter(([nombre]) => nombre === 'fn_certificado_retenciones_proveedor');
  expect(llamadas).toEqual([
    ['fn_certificado_retenciones_proveedor', { p_organization_id: 7, p_supplier_id: 5, p_desde: '2024-02-29', p_hasta: '2024-03-15', p_filtros: { contabilizados: true, branch_id: 8, cost_center_id: cc } }],
    ['fn_certificado_retenciones_proveedor', { p_organization_id: 7, p_supplier_id: 5, p_desde: '2023-02-28', p_hasta: '2023-03-15', p_filtros: { contabilizados: true, branch_id: 8, cost_center_id: cc } }],
  ]);
  expect((await r.json()).documento.tablas[0].filas[0]).toMatchObject({ base: 1000, valor: 25 });
});
test('rechaza organización ajena repetida antes de leer datos', async () => {
  const aviso = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  try { expect((await consultar('&organization_id=99&organization_id=7')).status).toBe(403); expect(mockFrom).not.toHaveBeenCalled(); }
  finally { aviso.mockRestore(); }
});
test('rechaza permisos, sucursal ajena y proveedor ajeno sin sustituirlos por ceros', async () => {
  mockRpc.mockResolvedValue({ data: false, error: null });
  expect((await consultar('&supplier_id=5')).status).toBe(403);
  expect(mockFrom).not.toHaveBeenCalled();
  mockRpc.mockResolvedValue({ data: true, error: null }); mockBranchFound = false;
  expect((await consultar('&supplier_id=5&branch_id=99')).status).toBe(404);
  mockRpc.mockImplementation(async (nombre: string) => nombre === 'fn_certificado_retenciones_proveedor' ? { data: null, error: { code: 'P0002' } } : { data: true, error: null });
  expect((await consultar('&supplier_id=99')).status).toBe(404);
});
test('no presenta moneda extranjera como pesos ni llama al cálculo con datos no verificables', async () => {
  jest.mocked(resolveOrgCurrency).mockResolvedValue({ code: 'USD', decimals: 2, source: 'base', symbol: '$' });
  expect((await consultar('&supplier_id=5')).status).toBe(422);
  expect(mockRpc).not.toHaveBeenCalledWith('fn_certificado_retenciones_proveedor', expect.anything());
});
test('una base faltante del origen no se convierte en una base de cero', async () => {
  mockRpc.mockImplementation(async (nombre: string) => nombre === 'fn_certificado_retenciones_proveedor' ? { data: { conceptos: [{ clase: 'retefuente', concepto: 'Compras', cuenta: '2365', base: null, valor: 25, tarifa: 2.5 }] }, error: null } : { data: true, error: null });
  const respuesta = await consultar('&supplier_id=5');
  expect(respuesta.status).toBe(500);
  expect((await respuesta.json()).error).toContain('importe no verificable');
});
