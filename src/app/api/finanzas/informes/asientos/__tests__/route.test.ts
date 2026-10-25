import { OrgContextError } from '@/lib/utils/orgContextError';

const mockDb = {};
jest.mock('@/lib/utils/orgContext', () => ({
  withOrg: (handler: (ctx: unknown, request: Request) => Promise<Response>) => async (request: Request) => {
    try { return await handler({ organizationId: 7, userId: 'usuario-prueba', supabase: mockDb }, request); }
    catch (error) { const fallo = error as { message: string; statusCode?: number }; return Response.json({ error: fallo.message }, { status: fallo.statusCode ?? 500 }); }
  },
  readOrgBody: jest.requireActual('@/lib/security/organizationBody').readOrgBody,
}));
jest.mock('@/lib/finanzas/informes/acceso.server', () => ({ exigirLecturaInformes: jest.fn() }));
jest.mock('@/lib/services/organizationTimezoneService', () => ({ getOrganizationTimezone: jest.fn().mockResolvedValue('America/Bogota') }));
jest.mock('@/lib/services/finanzas/informesFuente.server', () => ({ cargarAsientosSeleccionablesInformes: jest.fn() }));

import { GET } from '../route';
import { exigirLecturaInformes } from '@/lib/finanzas/informes/acceso.server';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { cargarAsientosSeleccionablesInformes } from '@/lib/services/finanzas/informesFuente.server';
const pedir = (query: string) => GET(new Request(`http://localhost/api/finanzas/informes/asientos?${query}`), { params: Promise.resolve({}) });

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(exigirLecturaInformes).mockResolvedValue(undefined);
  jest.mocked(cargarAsientosSeleccionablesInformes).mockResolvedValue([{ id: 12, fecha: '2026-03-01', comprobante: 'NC-000012', memo: 'Corrección documentada' }]);
});

test('devuelve solo metadatos con organización de sesión, zona canónica y sin caché', async () => {
  const respuesta = await pedir('desde=2026-01-01&hasta=2026-12-31');
  expect(respuesta.status).toBe(200);
  expect(await respuesta.json()).toEqual({ asientos: [{ id: 12, fecha: '2026-03-01', comprobante: 'NC-000012', memo: 'Corrección documentada' }] });
  expect(getOrganizationTimezone).toHaveBeenCalledWith(7, mockDb);
  expect(cargarAsientosSeleccionablesInformes).toHaveBeenCalledWith(mockDb, 7, expect.objectContaining({ desde: '2026-01-01', hasta: '2026-12-31' }), 'America/Bogota');
  expect(respuesta.headers.get('Cache-Control')).toContain('no-store');
});

test('fecha inválida devuelve400 sin consultar metadatos', async () => {
  const respuesta = await pedir('desde=2026-02-30&hasta=2026-12-31');
  expect(respuesta.status).toBe(400);
  expect(cargarAsientosSeleccionablesInformes).not.toHaveBeenCalled();
});

test('rechaza otra organización y evita consultar o resolver permisos para ella', async () => {
  const aviso = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    const respuesta = await pedir('desde=2026-01-01&hasta=2026-12-31&organization_id=99');
    expect(respuesta.status).toBe(403);
    expect(exigirLecturaInformes).not.toHaveBeenCalled();
    expect(cargarAsientosSeleccionablesInformes).not.toHaveBeenCalled();
  } finally { aviso.mockRestore(); }
});

test('conserva todos los valores de organización repetidos para rechazar una declaración ajena', async () => {
  const aviso = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    const respuesta = await pedir('desde=2026-01-01&hasta=2026-12-31&organization_id=99&organization_id=7');
    expect(respuesta.status).toBe(403);
    expect(aviso).toHaveBeenCalled();
    expect(exigirLecturaInformes).not.toHaveBeenCalled();
    expect(cargarAsientosSeleccionablesInformes).not.toHaveBeenCalled();
  } finally { aviso.mockRestore(); }
});

test('sin permiso de lectura devuelve403 antes de leer metadatos', async () => {
  jest.mocked(exigirLecturaInformes).mockRejectedValue(new OrgContextError('Sin permiso', 403));
  const respuesta = await pedir('desde=2026-01-01&hasta=2026-12-31');
  expect(respuesta.status).toBe(403);
  expect(cargarAsientosSeleccionablesInformes).not.toHaveBeenCalled();
});
