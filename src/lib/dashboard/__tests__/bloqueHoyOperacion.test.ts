/**
 * Bloque «Hoy» en el servidor: casillas de Logística y Transporte (Figma `03` › Inicio, pantalla
 * C 2919:46236; aprobado el 2026-11-23). Módulo activo + permiso por cargo resuelto en la base
 * (`fn_caja_puede`, `fn_logistica_ve_todo`): un domiciliario (no ve toda la operación) o alguien
 * sin `transporte.view` no recibe la casilla ni dispara la lectura. Las cifras salen de los
 * servicios del módulo con la organización del contexto.
 *
 * Organización ficticia 120; sin datos reales.
 */
jest.mock('@/lib/services/moduleManagementService', () => ({
  moduleManagementService: { getActiveModules: async () => [{ code: 'logistica' }, { code: 'transport' }] },
}));
// Casillas de otros módulos (apagados aquí): solo se evita cargar sus clientes.
jest.mock('@/lib/services/stockService', () => ({ listarStock: jest.fn() }));
jest.mock('@/lib/services/cartera/cuentasPorCobrar.server', () => ({ listadoCartera: jest.fn() }));
jest.mock('@/lib/services/organizationTimezoneService', () => ({
  getOrganizationTimezone: async () => 'America/Bogota',
}));
const bandeja = jest.fn();
jest.mock('@/lib/services/logistica/despachoService', () => ({
  listarPorDespachar: (...a: unknown[]) => bandeja(...a),
}));
const transporte = jest.fn();
jest.mock('../transporteInicio.server', () => ({
  leerTransporteInicio: (...a: unknown[]) => transporte(...a),
}));

import { datosHoy } from '../bloqueHoy.server';

let permisos: Record<string, boolean> = {};
let veTodo = true;

function rpc(fn: string, args: { p_code?: string }) {
  if (fn === 'fn_caja_puede') return Promise.resolve({ data: permisos[args.p_code ?? ''] === true, error: null });
  if (fn === 'fn_logistica_ve_todo') return Promise.resolve({ data: veTodo, error: null });
  return Promise.resolve({ data: null, error: null });
}
function cadena() {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'is', 'lt', 'gte', 'gt', 'order', 'limit']) q[m] = () => q;
  q.then = (ok: (x: unknown) => void) => ok({ count: 0, data: [], error: null });
  return q;
}
const ctx = { organizationId: 120, userId: 'u-1', supabase: { from: cadena, rpc } as never };
const ahora = new Date('2026-11-23T20:00:00Z');

beforeEach(() => {
  permisos = { 'logistica.view': true, 'transporte.view': true };
  veTodo = true;
  bandeja.mockReset().mockResolvedValue({
    filas: [
      { id: 'e1', numero: 'ENV-1', pedido: 'WO-000412', status: 'pending', modo: 'own', domiciliarioId: null, branchId: 7, promesa: '2026-11-23T19:42:00Z', fechaEsperada: null, creado: '2026-11-23T15:00:00Z', contraentrega: 0, codStatus: null },
      { id: 'e2', numero: 'ENV-2', pedido: null, status: 'pending', modo: 'own', domiciliarioId: null, branchId: 7, promesa: '2026-11-24T15:00:00Z', fechaEsperada: null, creado: '2026-11-23T15:00:00Z', contraentrega: 0, codStatus: null },
    ],
    recortada: false,
  });
  transporte.mockReset().mockResolvedValue({
    hayViajes: true,
    hayVehiculos: true,
    viajes: [
      { id: 't1', codigo: 'V-1123', salida: '2026-11-23T19:30:00Z', status: 'scheduled', despachadoEn: null, conExcepcion: false, ruta: null, placa: 'WNP104', puestos: 40, disponibles: 40, retraso: 0 },
      { id: 't2', codigo: 'M-0459', salida: '2026-11-23T20:00:00Z', status: 'scheduled', despachadoEn: null, conExcepcion: false, ruta: null, placa: null, puestos: 40, disponibles: 40, retraso: 0 },
    ],
    cumplimiento: new Map([
      ['t1', { tripId: 't1', bloqueos: [{ causa: 'soat', grupo: 'vehiculo', vence: '2026-11-20', excepcion: false }], avisos: [], admiteExcepcion: false, pidePin: true }],
      ['t2', { tripId: 't2', bloqueos: [{ causa: 'sin_vehiculo', grupo: 'asignacion', vence: null, excepcion: false }], avisos: [], admiteExcepcion: false, pidePin: true }],
    ]),
    vehiculos: null,
    documentos: { vencidos: 2, porVencer: 0, vigentes: 3, total: 5, sinFecha: 0, primero: null, vencidosEjemplo: [{ nombre: 'WNP104', tipo: 'soat' }] },
  });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

test('con permiso: atrasados con la regla de Por despachar, bloqueados y documentos vencidos', async () => {
  const d = await datosHoy(ctx, 7, ahora);
  expect(bandeja).toHaveBeenCalledWith(ctx.supabase, { organizationId: 120, branchId: 7 });
  expect(d.logistica).toEqual({ atrasados: 1, masAtrasado: { numero: 'WO-000412', minutos: 18 } });
  expect(transporte.mock.calls[0][1]).toMatchObject({ sucursal: 7, dia: '2026-11-23', conFotos: false });
  expect(d.transporte).toEqual({ bloqueados: 2, codigos: ['V-1123', 'M-0459'], documentosVencidos: 2, ejemplo: { nombre: 'WNP104', causa: 'soat' } });
});

test('un domiciliario (no ve toda la operación) no recibe la casilla de Logística ni se lee la bandeja', async () => {
  veTodo = false;
  const d = await datosHoy(ctx, null, ahora);
  expect(d.logistica).toBeNull();
  expect(bandeja).not.toHaveBeenCalled();
});

test('sin transporte.view (ni el código antiguo) no hay casilla de Transporte ni lectura', async () => {
  permisos = { 'logistica.view': true };
  const d = await datosHoy(ctx, null, ahora);
  expect(d.transporte).toBeNull();
  expect(transporte).not.toHaveBeenCalled();
});

test('el código antiguo transport.trips.view también abre Transporte (como fn_inicio_modulos_resumen)', async () => {
  permisos = { 'transport.trips.view': true };
  const d = await datosHoy(ctx, null, ahora);
  expect(d.transporte).not.toBeNull();
  expect(d.logistica).toBeNull();
});

test('si la lectura falla la casilla llega null y el bloque sigue', async () => {
  bandeja.mockRejectedValue(new Error('caída'));
  const d = await datosHoy(ctx, null, ahora);
  expect(d.logistica).toBeNull();
  expect(d.transporte).not.toBeNull();
});
