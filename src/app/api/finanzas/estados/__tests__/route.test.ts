/** @jest-environment node */
/**
 * Permisos en el servidor y organización de la sesión: ninguna ruta de estados
 * financieros toma la organización del cliente.
 */
const rpc = jest.fn();
const permitido = jest.fn();
const ctx = { organizationId: 7, userId: 'u', roleId: 3, isSuperAdmin: false, supabase: { rpc } };

jest.mock('@/lib/utils/orgContext', () => ({
  withOrg: (handler: (c: typeof ctx, req: Request) => unknown) => (req: Request) => handler(ctx, req),
  hasOrgAdminOrPermission: (...args: unknown[]) => permitido(...args),
}));
jest.mock('@/lib/services/organizationTimezoneService', () => ({ getOrganizationTimezone: async () => 'America/Bogota' }));

import { GET } from '../route';
import { GET as LIBRO } from '../libros/route';
import { PUT } from '../configuracion/route';
import { PUT as MARCAR } from '../cuentas-flujo/route';

const llamar = (ruta: string) => new Request(`http://x/api/finanzas/estados${ruta}`);
const pedir = (handler: unknown, req: Request) => (handler as (r: Request) => Promise<Response>)(req);

beforeEach(() => {
  rpc.mockReset();
  permitido.mockReset();
  permitido.mockResolvedValue(true);
  rpc.mockResolvedValue({ data: { ok: true }, error: null });
});

describe('GET /api/finanzas/estados', () => {
  const url = '?informe=flujo&desde=2026-01-01&hasta=2026-12-31&comparar=1';

  it('sin finance.view responde 403 y no consulta', async () => {
    permitido.mockResolvedValue(false);
    const r = await pedir(GET, llamar(url));
    expect(r.status).toBe(403);
    expect(permitido).toHaveBeenCalledWith(ctx, 'finance.view');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('usa la organización de la sesión aunque la URL traiga otra', async () => {
    const r = await pedir(GET, llamar(`${url}&organization_id=999`));
    expect(r.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith('fn_estado_flujos_efectivo', { p_organization_id: 7, p_desde: '2026-01-01', p_hasta: '2026-12-31' });
    expect(rpc).toHaveBeenCalledWith('fn_estado_flujos_efectivo', { p_organization_id: 7, p_desde: '2025-01-01', p_hasta: '2025-12-31' });
  });

  it('sin comparativo hace una sola consulta', async () => {
    await pedir(GET, llamar('?informe=patrimonio&desde=2026-01-01&hasta=2026-12-31'));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('fn_estado_cambios_patrimonio', expect.anything());
  });

  it('rechaza informe o periodo inválidos', async () => {
    expect((await pedir(GET, llamar('?informe=otro&desde=2026-01-01&hasta=2026-12-31'))).status).toBe(400);
    expect((await pedir(GET, llamar('?informe=flujo&desde=2026-12-31&hasta=2026-01-01'))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('el alcance de sucursal llega como 403 con su código', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'BRANCH_SCOPE_REQUIRED' } });
    const r = await pedir(GET, llamar(url));
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ codigo: 'alcance_sucursal' });
  });

  it('un fallo de la base no se disfraza de cifras en cero', async () => {
    const espia = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'x' } });
    expect((await pedir(GET, llamar(url))).status).toBe(500);
    espia.mockRestore();
  });
});

describe('GET /api/finanzas/estados/libros', () => {
  it('pagina las líneas hasta el final', async () => {
    const lote = Array.from({ length: 1000 }, (_, i) => ({ id: i + 1 }));
    rpc.mockResolvedValueOnce({ data: lote, error: null }).mockResolvedValueOnce({ data: [{ id: 1001 }], error: null });
    const r = await pedir(LIBRO, new Request('http://x/api/finanzas/estados/libros?libro=diario&desde=2026-01-01&hasta=2026-12-31'));
    const datos = await r.json() as { filas: unknown[]; truncado: boolean };
    expect(datos.filas).toHaveLength(1001);
    expect(datos.truncado).toBe(false);
    expect(rpc).toHaveBeenLastCalledWith('fn_libro_lineas', expect.objectContaining({ p_despues: 1000 }));
  });

  it('rechaza un libro desconocido', async () => {
    const r = await pedir(LIBRO, new Request('http://x/api/finanzas/estados/libros?libro=otro&desde=2026-01-01&hasta=2026-12-31'));
    expect(r.status).toBe(400);
  });
});

describe('escrituras', () => {
  const put = (ruta: string, cuerpo: unknown) => new Request(`http://x/api/finanzas/estados${ruta}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
  });

  it('guardar exige finance.approve', async () => {
    permitido.mockImplementation(async (_c: unknown, codigo: string) => codigo !== 'finance.approve');
    expect((await pedir(PUT, put('/configuracion', { version: 0 }))).status).toBe(403);
    expect((await pedir(MARCAR, put('/cuentas-flujo', { cuentas: [] }))).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('una organización distinta en el cuerpo se rechaza', async () => {
    const espia = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(pedir(PUT, put('/configuracion', { version: 0, organization_id: 999 }))).rejects.toThrow('Organización no permitida');
    expect(rpc).not.toHaveBeenCalled();
    espia.mockRestore();
  });

  it('una versión vieja responde 409', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '40001', message: 'version_obsoleta' } });
    const r = await pedir(PUT, put('/configuracion', { version: 1 }));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ codigo: 'version_obsoleta' });
  });

  it('marcar pide una lista de cuentas', async () => {
    expect((await pedir(MARCAR, put('/cuentas-flujo', { cuentas: 'x' }))).status).toBe(400);
  });
});
