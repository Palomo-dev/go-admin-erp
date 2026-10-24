import { GET } from '../route';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { configuracionPredeterminada } from '@/lib/finanzas/informes/configuracion';
import { cargarFuenteInformes, type FuenteInformes } from '@/lib/services/finanzas/informesFuente.server';
import { cargarStockInformes } from '@/lib/services/finanzas/informesStock.server';
import { cargarFuenteTributaria } from '@/lib/services/finanzas/tributariosFuente.server';

/** Se prueba el handler real; la resolución de sesión de withOrg tiene su propia suite. */
const mockRpc = jest.fn();
const mockContexto = { organizationId: 7, userId: 'usuario-sesion', supabase: { rpc: mockRpc } } as unknown as ServerOrgContext;
jest.mock('@/lib/utils/orgContext', () => {
  const { readOrgBody } = jest.requireActual('@/lib/security/organizationBody');
  return {
    readOrgBody,
    withOrg: (handler: (ctx: ServerOrgContext, request: Request) => Promise<Response>) => async (request: Request) => {
      try { return await handler(mockContexto, request); }
      catch (error) {
        const fallo = error as { message: string; statusCode?: number; code?: string };
        return Response.json({ error: fallo.message, code: fallo.code }, { status: fallo.statusCode ?? 500 });
      }
    },
  };
});
jest.mock('@/lib/services/finanzas/informesFuente.server', () => ({ cargarFuenteInformes: jest.fn() }));
jest.mock('@/lib/services/finanzas/informesStock.server', () => ({ cargarStockInformes: jest.fn() }));
jest.mock('@/lib/services/finanzas/tributariosFuente.server', () => ({ cargarFuenteTributaria: jest.fn() }));

function fuente(grupo: 2 | 3 = 2): FuenteInformes {
  const configuracion = configuracionPredeterminada('Entidad de prueba', '900000000');
  configuracion.grupo_niif = grupo;
  configuracion.presenta_cambios_patrimonio = grupo === 2;
  return {
    configuracion, organizacion: { nombre: 'Entidad de prueba', nit: '900000000' },
    cuentas: [{ account_code: '1105', name: 'Caja' }, { account_code: '3105', name: 'Capital' }],
    movimientos: [
      { id: 1, entry_id: 1, entry_date: '2025-01-01', account_code: '1105', debit: 100, credit: 0, posted: true, branch_id: 8, description: null, concepto_exogena: null },
      { id: 2, entry_id: 1, entry_date: '2025-01-01', account_code: '3105', debit: 0, credit: 100, posted: true, branch_id: 8, description: null, concepto_exogena: null },
    ],
    centros: [{ id: '00000000-0000-4000-8000-000000000001', code: 'C1', name: 'Centro de prueba', branch_id: 8 }],
    productos: [], advertencias: ['Aviso verificable de la fuente'], monedaBase: 'COP', timezone: 'America/Bogota', stock: [],
    stockCompleto: true, motivoStockIncompleto: null, advertenciasStock: [],
    actividad: { ventas: [], originalesVentas: [], compras: [], lineasVenta: [], lineasCompra: [] },
  };
}
const consultar = (request: Request) => GET(request, { params: Promise.resolve({}) });
const consulta = (extra = '') => new Request(`http://localhost/api/finanzas/informes?desde=2026-01-01&hasta=2026-12-31${extra}`);
beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockResolvedValue({ data: true, error: null });
  jest.mocked(cargarFuenteInformes).mockResolvedValue(fuente());
  jest.mocked(cargarStockInformes).mockResolvedValue({ movimientos: [], advertencias: [], stockCompleto: true, motivoStockIncompleto: null });
  jest.mocked(cargarFuenteTributaria).mockResolvedValue({ lineasIva: [], retenciones: [], nomina: [], pendientesFuente: [] });
});

test('GET403 sin permiso financiero no lee datos ni permite el nombre del rol como autorización', async () => {
  mockRpc.mockResolvedValue({ data: false, error: null });
  const respuesta = await consultar(consulta());
  expect(respuesta.status).toBe(403);
  expect(cargarFuenteInformes).not.toHaveBeenCalled();
});
test('GET403 ante organización ajena conserva la identidad de sesión y no llega al cargador', async () => {
  const aviso = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    const respuesta = await consultar(consulta('&organization_id=99'));
    expect(respuesta.status).toBe(403);
    expect((await respuesta.json()).code).toBe('FOREIGN_ORGANIZATION');
    expect(cargarFuenteInformes).not.toHaveBeenCalled();
    expect(aviso).toHaveBeenCalled();
  } finally { aviso.mockRestore(); }
});
test('GET403 conserva las organizaciones repetidas de la query para no omitir una declaración ajena', async () => {
  const aviso = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    const respuesta = await consultar(consulta('&organization_id=99&organization_id=7'));
    expect(respuesta.status).toBe(403);
    expect(cargarFuenteInformes).not.toHaveBeenCalled();
  } finally { aviso.mockRestore(); }
});
test('GET400 para fecha inexistente o identificador inválido no carga un informe de ceros', async () => {
  for (const query of ['desde=2026-02-30&hasta=2026-12-31', 'desde=2026-01-01&hasta=2026-12-31&branch_id=-8']) {
    const respuesta = await consultar(new Request(`http://localhost/api/finanzas/informes?${query}`));
    expect(respuesta.status).toBe(400);
  }
  expect(cargarFuenteInformes).not.toHaveBeenCalled();
});
test('GET usa organización/cliente de sesión, conserva filtros y devuelve paquete grupo2 completo sin caché compartida', async () => {
  const centro = '00000000-0000-4000-8000-000000000001';
  const respuesta = await consultar(consulta(`&organization_id=7&branch_id=8&cost_center_id=${centro}&nivel=auxiliar`));
  expect(respuesta.status).toBe(200);
  expect(cargarFuenteInformes).toHaveBeenCalledWith(mockContexto.supabase, 7, { desde: '2026-01-01', hasta: '2026-12-31', branchId: 8, costCenterId: centro });
  expect(respuesta.headers.get('cache-control')).toBe('private, no-store');
  const body = await respuesta.json();
  expect(Object.keys(body.documentos)).toEqual(expect.arrayContaining(['situacion-financiera', 'resultados-integral', 'cambios-patrimonio', 'flujo-indirecto', 'notas-estados', 'certificacion', 'mayor-consolidado', 'auxiliar-cuenta', 'auxiliar-centro', 'inventarios-balances', 'kardex-sede', 'indicadores', 'punto-equilibrio', 'formulario-300', 'formulario-350', 'ica-municipal', 'reteica', 'exogena', 'certificado-220', 'conciliacion-fiscal', 'informe-gestion', 'registro-accionistas', 'pila']));
  expect(cargarFuenteTributaria).toHaveBeenCalledTimes(2);
  expect(cargarFuenteTributaria).toHaveBeenCalledWith(mockContexto.supabase, 7, expect.objectContaining({ monedaBase: 'COP' }), expect.any(Array), undefined);
  expect(cargarStockInformes).not.toHaveBeenCalled();
  expect(body.documentos['formulario-300'].tablas.some((tabla: { titulo: string }) => tabla.titulo.includes('mismo periodo del año anterior'))).toBe(true);
  expect(body.documentos.certificacion.avisos).toEqual(expect.arrayContaining(['Aviso verificable de la fuente']));
});
test('GET grupo3 no publica flujo, ORI ni patrimonio no elegido y mantiene notas/certificación', async () => {
  jest.mocked(cargarFuenteInformes).mockResolvedValue(fuente(3));
  const respuesta = await consultar(consulta());
  expect(respuesta.status).toBe(200);
  const body = await respuesta.json();
  expect(body.grupoNiif).toBe(3);
  expect(body.documentos['flujo-indirecto']).toBeUndefined();
  expect(body.documentos['cambios-patrimonio']).toBeUndefined();
  expect(body.documentos['resultados-integral'].tablas[0].filas.some((fila: { codigo: string }) => fila.codigo === 'ori')).toBe(false);
  expect(body.documentos['notas-estados']).toBeDefined();
  expect(body.documentos.certificacion).toBeDefined();
});

test('GET conserva estados de una base extranjera y no presenta sus cifras como pesos tributarios', async () => {
  const datos = fuente(); datos.monedaBase = 'USD';
  jest.mocked(cargarFuenteInformes).mockResolvedValue(datos);
  const respuesta = await consultar(consulta());
  expect(respuesta.status).toBe(200);
  const body = await respuesta.json();
  expect(body.documentos['situacion-financiera'].tablas.length).toBeGreaterThan(0);
  expect(body.documentos['formulario-300'].tablas).toEqual([]);
  expect(body.documentos['formulario-300'].avisos.join(' ')).toContain('moneda base USD difiere');
});
test('GET con centro no compara inventario total contra libro parcial y conserva aviso explícito', async () => {
  const parcial = fuente();
  parcial.stockCompleto = false;
  parcial.motivoStockIncompleto = 'centro_costo';
  parcial.advertenciasStock = ['El inventario no tiene centro de costo asignado por movimiento.'];
  jest.mocked(cargarFuenteInformes).mockResolvedValue(parcial);
  jest.mocked(cargarStockInformes).mockResolvedValue({ movimientos: [], stockCompleto: false, motivoStockIncompleto: 'centro_costo', advertencias: ['El inventario no tiene centro de costo asignado por movimiento.'] });
  const respuesta = await consultar(consulta('&cost_center_id=00000000-0000-4000-8000-000000000001'));
  expect(respuesta.status).toBe(200);
  const body = await respuesta.json();
  expect(body.documentos['kardex-sede'].tablas).toEqual([]);
  expect(body.documentos['kardex-sede'].avisos.join(' ')).toContain('centro de costo');
  expect(body.documentos['inventarios-balances'].tablas.every((tabla: { titulo: string }) => !tabla.titulo.includes('Conciliación de inventario'))).toBe(true);
});

test('GET con historia de stock no verificable conserva los estados y omite kárdex/conciliación sin inventar centro', async () => {
  const parcial = fuente();
  parcial.stockCompleto = false;
  parcial.motivoStockIncompleto = 'datos_no_verificables';
  parcial.advertenciasStock = ['Hay movimientos sin costo histórico verificable.'];
  jest.mocked(cargarFuenteInformes).mockResolvedValue(parcial);
  const respuesta = await consultar(consulta());
  expect(respuesta.status).toBe(200);
  const body = await respuesta.json();
  expect(body.documentos['situacion-financiera']).toBeDefined();
  expect(body.documentos['resultados-integral']).toBeDefined();
  expect(body.documentos['kardex-sede'].tablas).toEqual([]);
  expect(body.documentos['kardex-sede'].avisos).toEqual(['Hay movimientos sin costo histórico verificable.', 'Aviso verificable de la fuente']);
  expect(body.documentos['inventarios-balances'].tablas).toHaveLength(2);
  expect(body.documentos['punto-equilibrio'].avisos.join(' ')).toContain('costo histórico');
});
