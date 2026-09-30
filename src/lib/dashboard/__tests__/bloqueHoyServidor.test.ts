/**
 * Cifras del bloque «Hoy» en el servidor: cada casilla depende de su módulo,
 * todas las consultas van con la organización del contexto, y un fallo
 * parcial deja esa casilla en `null` sin tumbar el bloque.
 *
 * Organización ficticia 120; sin datos reales.
 */
let modulos: string[] | null = ['finance', 'inventory', 'pos'];
let carteraFalla = false;

jest.mock('@/lib/services/moduleManagementService', () => ({
  moduleManagementService: {
    getActiveModules: async () => {
      if (modulos === null) throw new Error('caída');
      return modulos.map((code) => ({ code }));
    },
  },
}));
jest.mock('@/lib/services/cartera/cuentasPorCobrar.server', () => ({
  listadoCartera: async (_ctx: unknown, consulta: { filtros: Record<string, unknown> }) => {
    consultasCartera.push(consulta.filtros);
    if (carteraFalla) throw new Error('sin_permiso');
    return { total: 1, filas: [{ dias: 42 }], resumen: { vencida: 3480000, cuentas_vencidas: 7, monedas: ['COP'] } };
  },
}));
jest.mock('@/lib/services/stockService', () => ({
  listarStock: async (org: number, filtros: { sucursales?: number[] }) => {
    consultasStock.push({ org, sucursales: filtros.sucursales });
    return { kpis: { bajo_minimo: 3, agotados: 1 } };
  },
}));
jest.mock('@/lib/services/organizationTimezoneService', () => ({
  getOrganizationTimezone: async () => 'America/Bogota',
}));

import { datosHoy } from '../bloqueHoy.server';

const consultasCartera: Record<string, unknown>[] = [];
const consultasStock: Array<{ org: number; sucursales?: number[] }> = [];
const filtrosPorTabla: Record<string, Array<[string, string, unknown]>> = {};

function cadena(tabla: string) {
  const filtros: Array<[string, string, unknown]> = (filtrosPorTabla[tabla] ??= []);
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'limit']) q[m] = () => q;
  for (const m of ['eq', 'in', 'is', 'lt', 'gte', 'gt']) {
    q[m] = (col: string, val?: unknown) => {
      filtros.push([m, col, val]);
      return q;
    };
  }
  const resultado =
    tabla === 'tasks'
      ? { count: 2, data: null, error: null }
      : tabla === 'cash_sessions'
        ? { count: 1, data: [{ opened_at: '2026-09-26T13:00:00Z' }], error: null }
        : tabla === 'stock_levels'
          ? { count: 2, data: [{ qty_reserved: 3 }, { qty_reserved: '4' }], error: null }
          : { count: 5, data: [{ id: 'x' }], error: null };
  q.then = (ok: (x: unknown) => void) => ok(resultado);
  return q;
}

const llamadasRpc: Array<{ fn: string; args: Record<string, unknown> }> = [];
function rpc(fn: string, args: Record<string, unknown>) {
  llamadasRpc.push({ fn, args });
  return Promise.resolve({ data: { pendientes: 5, por_expirar: 2, expiran_hoy: 3, minutos: 30, hay_pedidos: true }, error: null });
}

const ctx = { organizationId: 120, userId: 'u-1', supabase: { from: cadena, rpc } as never };

beforeEach(() => {
  modulos = ['finance', 'inventory', 'pos'];
  carteraFalla = false;
  consultasCartera.length = 0;
  consultasStock.length = 0;
  llamadasRpc.length = 0;
  for (const k of Object.keys(filtrosPorTabla)) delete filtrosPorTabla[k];
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

test('con los tres módulos: todas las casillas, con la sucursal pedida y la organización del contexto', async () => {
  const d = await datosHoy(ctx, 7, new Date('2026-09-29T15:00:00Z'));
  expect(d.porCobrar).toEqual({ vencido: 3480000, cuentas: 7, diasMasVieja: 42, monedas: ['COP'] });
  expect(d.stock).toEqual({ bajoMinimo: 3, agotados: 1 });
  expect(d.pedidosWeb).toEqual({ pendientes: 5, porExpirar: 2, minutos: 30 });
  expect(d.cajasAnteriores).toEqual({ cantidad: 1, diasMasVieja: 3 });
  // Reservas de stock sin mover (lo que mostraba el panel de observabilidad):
  // solo en las sucursales pedidas, con control de stock y más de 24 h quietas.
  expect(d.reservasStock).toEqual({ huerfanas: 2, unidades: 7 });
  expect(filtrosPorTabla.stock_levels).toEqual(
    expect.arrayContaining([
      ['in', 'branch_id', [7]],
      ['gt', 'qty_reserved', 0],
      ['is', 'lot_id', null],
      ['eq', 'products.track_stock', true],
      ['lt', 'updated_at', '2026-09-28T15:00:00.000Z'],
    ]),
  );
  expect(d.tareas).toEqual({ abiertas: 2, vencenHoy: 2, vencidas: 2 });
  expect(d.unaSucursal).toBe(true);
  expect(consultasCartera[0]).toMatchObject({ sucursal: 7 });
  expect(consultasStock[0]).toEqual({ org: 120, sucursales: [7] });
  // Pedidos web: la función única del inicio, con la organización del
  // contexto, la sucursal pedida y la ventana de 30 min.
  expect(llamadasRpc).toEqual([
    { fn: 'fn_inicio_pedidos_web_pendientes', args: { p_organization_id: 120, p_branch_id: 7, p_minutos: 30 } },
  ]);
  for (const tabla of ['tasks', 'cash_sessions']) {
    expect(filtrosPorTabla[tabla]).toContainEqual(['eq', 'organization_id', 120]);
  }
  expect(filtrosPorTabla.tasks).toContainEqual(['eq', 'assigned_to', 'u-1']);
  expect(filtrosPorTabla.cash_sessions).toContainEqual(['eq', 'branch_id', 7]);
});

test('módulo apagado: su casilla llega null y no se consulta', async () => {
  modulos = ['finance'];
  const d = await datosHoy(ctx, null);
  expect(d.porCobrar).not.toBeNull();
  expect(d.stock).toBeNull();
  expect(d.pedidosWeb).toBeNull();
  expect(d.cajasAnteriores).toBeNull();
  expect(consultasStock).toHaveLength(0);
  expect(llamadasRpc).toHaveLength(0);
});

test('sin la lista de módulos solo quedan las tareas propias (no se adivina)', async () => {
  modulos = null;
  const d = await datosHoy(ctx, null);
  expect(d).toMatchObject({ porCobrar: null, stock: null, pedidosWeb: null, cajasAnteriores: null });
  expect(d.tareas).not.toBeNull();
});

test('un fallo parcial (cartera sin permiso) no tumba el resto', async () => {
  carteraFalla = true;
  const d = await datosHoy(ctx, null);
  expect(d.porCobrar).toBeNull();
  expect(d.stock).not.toBeNull();
  expect(d.unaSucursal).toBe(false);
});
