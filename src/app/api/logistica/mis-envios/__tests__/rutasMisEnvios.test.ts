/**
 * Rutas de Mis envíos (encargo 2026-11-25): «Ver la ruta de» del supervisor y el perfil de quien
 * no es domiciliario. El permiso se resuelve en el servidor (`fn_logistica_gestiona`) y la
 * organización sale SIEMPRE de la sesión, nunca de la URL.
 */
const ctx = { organizationId: 120, userId: 'u-1', userEmail: 'persona@correo.test', supabase: { from: jest.fn() } as Record<string, unknown> };
jest.mock('@/lib/utils/orgContext', () => ({
  withOrg: (handler: (c: unknown, r: Request) => Promise<Response>) => (req: Request) => handler(ctx, req),
}));
const puede = jest.fn();
jest.mock('@/lib/logistica/permisosDomiciliarios.server', () => ({ puedeGestionarDomiciliarios: () => puede() }));
jest.mock('@/lib/services/organizationTimezoneService', () => ({ getOrganizationTimezone: async () => 'America/Bogota' }));
const listarMisEnvios = jest.fn();
jest.mock('@/lib/services/logistica/misEnviosService', () => ({ listarMisEnvios: (...a: unknown[]) => listarMisEnvios(...a) }));
const listarDomiciliarios = jest.fn();
jest.mock('@/lib/services/logistica/domiciliariosService', () => ({ listarDomiciliarios: (...a: unknown[]) => listarDomiciliarios(...a) }));
const enviosDeDomiciliarios = jest.fn();
const listarPorDespachar = jest.fn();
jest.mock('@/lib/services/logistica/despachoService', () => ({
  ...jest.requireActual('@/lib/services/logistica/despachoService'),
  enviosDeDomiciliarios: (...a: unknown[]) => enviosDeDomiciliarios(...a),
  listarPorDespachar: (...a: unknown[]) => listarPorDespachar(...a),
}));
const pendientesPorCuadrar = jest.fn();
jest.mock('@/lib/services/logistica/cuadresDomiciliarioService', () => ({ pendientesPorCuadrar: (...a: unknown[]) => pendientesPorCuadrar(...a) }));
jest.mock('@/lib/navigation/navegacionServidor', () => ({
  seccionesVisiblesServidor: async () => [{ modulos: [{ paginas: [{ href: '/app/logistica/por-despachar', nombre: 'Por despachar' }, { href: '/app/pos', nombre: 'POS' }] }] }],
}));

import { GET as getRuta } from '../ruta/route';
import { GET as getPerfil } from '../perfil/route';

const DRIVER = '11111111-1111-4111-8111-111111111111';
const filtros: Array<[string, unknown]> = [];
let fila: Record<string, unknown> | null;

beforeEach(() => {
  jest.clearAllMocks();
  filtros.length = 0;
  fila = { id: DRIVER, organization_id: 120, full_name: 'Domiciliario Uno' };
  const q = {
    select: () => q,
    eq: (k: string, v: unknown) => {
      filtros.push([k, v]);
      return q;
    },
    in: () => q,
    maybeSingle: async () => ({ data: fila, error: null }),
  };
  (ctx.supabase.from as jest.Mock).mockImplementation(() => q);
});

const pedir = (url: string) => new Request(`http://localhost${url}`);

describe('GET /api/logistica/mis-envios/ruta', () => {
  test('sin permiso de gestionar Logística: 403 y no lee nada', async () => {
    puede.mockResolvedValue(false);
    const r = await getRuta(pedir(`/api/logistica/mis-envios/ruta?domiciliario=${DRIVER}`), {} as never);
    expect(r.status).toBe(403);
    expect(listarMisEnvios).not.toHaveBeenCalled();
    expect(ctx.supabase.from).not.toHaveBeenCalled();
  });

  test('id inválido: 400', async () => {
    puede.mockResolvedValue(true);
    const r = await getRuta(pedir('/api/logistica/mis-envios/ruta?domiciliario=1%20or%201=1'), {} as never);
    expect(r.status).toBe(400);
  });

  test('el domiciliario se busca en la organización DE LA SESIÓN; de otra organización = 404', async () => {
    puede.mockResolvedValue(true);
    fila = null;
    const r = await getRuta(pedir(`/api/logistica/mis-envios/ruta?domiciliario=${DRIVER}&organization_id=999`), {} as never);
    expect(r.status).toBe(404);
    expect(filtros).toContainEqual(['organization_id', 120]);
    expect(listarMisEnvios).not.toHaveBeenCalled();
  });

  test('con permiso: la ruta del domiciliario con la misma lectura de Mis envíos', async () => {
    puede.mockResolvedValue(true);
    listarMisEnvios.mockResolvedValue([{ id: 'e1' }]);
    const r = await getRuta(pedir(`/api/logistica/mis-envios/ruta?domiciliario=${DRIVER}`), {} as never);
    expect(r.status).toBe(200);
    const cuerpo = await r.json();
    expect(cuerpo.envios).toEqual([{ id: 'e1' }]);
    expect(listarMisEnvios).toHaveBeenCalledWith(ctx.supabase, 120, DRIVER, expect.any(String));
  });

  test('sin domiciliario: opciones del selector con su carga', async () => {
    puede.mockResolvedValue(true);
    listarDomiciliarios.mockResolvedValue([{ id: DRIVER, full_name: 'Domiciliario Uno', is_active: true, vehiculo: null }]);
    enviosDeDomiciliarios.mockResolvedValue([{ driver_id: DRIVER, status: 'out_for_delivery' }]);
    const r = await getRuta(pedir('/api/logistica/mis-envios/ruta'), {} as never);
    const cuerpo = await r.json();
    expect(cuerpo.opciones).toEqual([expect.objectContaining({ id: DRIVER, corto: 'Domiciliario U.', estado: 'en_ruta', paradas: 1 })]);
    expect(listarDomiciliarios).toHaveBeenCalledWith(ctx.supabase, 120);
  });
});

describe('GET /api/logistica/mis-envios/perfil', () => {
  test('sin permiso: atajos de su menú, su correo y sin cifras de despacho', async () => {
    puede.mockResolvedValue(false);
    const r = await getPerfil(pedir('/api/logistica/mis-envios/perfil'), {} as never);
    const cuerpo = await r.json();
    expect(cuerpo).toEqual({ gestiona: false, correo: 'persona@correo.test', userId: 'u-1', atajos: [{ href: '/app/logistica/por-despachar', nombre: 'Por despachar' }, { href: '/app/pos', nombre: 'POS' }], kpis: null });
    expect(listarPorDespachar).not.toHaveBeenCalled();
  });

  test('con permiso: cifras de despacho y solo los atajos de despacho', async () => {
    puede.mockResolvedValue(true);
    listarPorDespachar.mockResolvedValue({ filas: [], recortada: false });
    enviosDeDomiciliarios.mockResolvedValue([]);
    pendientesPorCuadrar.mockResolvedValue([{ driver_id: DRIVER, cod_collected_amount: 98000 }]);
    const r = await getPerfil(pedir('/api/logistica/mis-envios/perfil'), {} as never);
    const cuerpo = await r.json();
    expect(cuerpo.gestiona).toBe(true);
    expect(cuerpo.atajos).toEqual([{ href: '/app/logistica/por-despachar', nombre: 'Por despachar' }]);
    expect(cuerpo.kpis).toMatchObject({ porCuadrar: 98000, domiciliariosPorCuadrar: 1 });
    expect(listarPorDespachar).toHaveBeenCalledWith(ctx.supabase, { organizationId: 120 });
  });
});
