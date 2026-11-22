// ============================================================================
// Reportes de ventas ampliados (Figma «14 Reportes», 2733:51399)
// ============================================================================
// Las RPC de la migración 20261122075104 devuelven jsonb; aquí se simula su
// respuesta con un cliente falso y se fija cómo la convierte cada reporte:
// filtros que llegan a la RPC, nombres («Sin asignar», «Varias»), franjas en
// a. m./p. m., columnas por método y por sede, y los avisos de la lectura.
// Organización y personas ficticias.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { CONTAR_POR_DEFECTO, MAX_METODOS, leerMetodos, opcionesDeParametros, parametrosRpcVentas } from '../filtrosVentas';
import { etiquetaFranja, fechaHoraLocal } from '../formatoVentas';
import { ventasReports } from '../modulos/ventasReports';
import { comisionesPorSede } from '../modulos/hrmReports';
import { armarDespachos, estadoDespacho, inventarioReports } from '../modulos/inventarioReports';
import type { DefinicionModulo, OpcionesReporte, PeriodoCierre, ReportData } from '../types';
import { listarOpcionesVentas } from '../opcionesVentas.server';
import { fakeTablas } from './fakeTablas';

jest.mock('@/lib/utils/timezone', () => ({
  getOrgDateRange: jest.fn(async () => ({
    start: '2026-11-01T05:00:00.000Z',
    end: '2026-12-01T04:59:59.999Z',
    timezone: 'America/Bogota',
  })),
}));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

const ORG = 900;
const PERIODO: PeriodoCierre = { tipo: 'mensual', fechaInicio: '2026-11-01', fechaFin: '2026-11-30', etiqueta: 'Noviembre 2026' };
const ANA = '11111111-1111-4111-8111-111111111111';
const BETO = '22222222-2222-4222-8222-222222222222';

const TABLAS = () => ({
  profiles: [
    { id: ANA, first_name: 'Ana', last_name: 'Ríos', email: 'ana@example.test' },
    { id: BETO, first_name: 'Beto', last_name: null, email: 'beto@example.test' },
  ],
  organization_members: [
    { organization_id: ORG, user_id: ANA, roles: { name: 'Cajero' } },
    { organization_id: ORG, user_id: BETO, roles: [{ name: 'Mesero' }] },
  ],
  branches: [
    { id: 1, name: 'Centro' },
    { id: 2, name: 'Norte' },
  ],
  payment_methods: [
    { code: 'cash', name: 'Efectivo' },
    { code: 'nequi', name: 'Nequi' },
  ],
});

function reporte(defs: DefinicionModulo[], id: string): DefinicionModulo {
  const def = defs.find((d) => d.id === id);
  if (!def) throw new Error(`no existe ${id}`);
  return def;
}

async function correr(
  defs: DefinicionModulo[],
  id: string,
  rpcs: Record<string, (args: Record<string, unknown>) => unknown>,
  opciones?: OpcionesReporte,
): Promise<{ data: ReportData; llamadas: Array<{ nombre: string; args: Record<string, unknown> }> }> {
  const db = fakeTablas(TABLAS(), rpcs);
  const data = await reporte(defs, id).fetch(ORG, PERIODO, null, db as unknown as SupabaseClient, opciones);
  return { data, llamadas: db.llamadas };
}

const vista = (d: ReportData, id: string) => {
  const v = d.vistas?.find((x) => x.id === id);
  if (!v) throw new Error(`sin vista ${id}`);
  return v;
};

// ── Filtros ──────────────────────────────────────────────────────────────

describe('filtrosVentas', () => {
  test('sin opciones: cajero, sin persona, sin métodos', () => {
    expect(parametrosRpcVentas()).toEqual({ p_contar_por: 'cajero', p_persona: null, p_metodos: null });
    expect(parametrosRpcVentas({ incluirTodasSucursales: true })).toEqual({ p_contar_por: CONTAR_POR_DEFECTO, p_persona: null, p_metodos: null });
  });

  test('vuelve a validar: lo inválido nunca viaja a la base', () => {
    const p = parametrosRpcVentas({ persona: 'no-es-uuid', metodos: ['cash', 'DROP TABLE', ''], contarPor: 'jefe' as never });
    expect(p).toEqual({ p_contar_por: 'cajero', p_persona: null, p_metodos: ['cash'] });
    expect(parametrosRpcVentas({ persona: ANA.toUpperCase(), metodos: [], contarPor: 'mesero' })).toEqual({ p_contar_por: 'mesero', p_persona: ANA, p_metodos: null });
  });

  test('máximo de métodos y sin repetidos', () => {
    const muchos = Array.from({ length: 20 }, (_, i) => `m${i}`);
    expect(leerMetodos(muchos.join(','))).toHaveLength(MAX_METODOS);
    expect(leerMetodos('cash, cash ,nequi')).toEqual(['cash', 'nequi']);
  });

  test('opciones del documento PDF', () => {
    expect(opcionesDeParametros({ persona: ANA, metodo: 'cash,nequi', contar: 'vendedor' })).toEqual({ persona: ANA, metodos: ['cash', 'nequi'], contarPor: 'vendedor' });
    expect(opcionesDeParametros({ persona: null, metodo: null, contar: 'otro' })).toEqual({ persona: null, metodos: null });
  });
});

describe('formatos', () => {
  test('etiquetaFranja en a. m./p. m. de Colombia', () => {
    expect(etiquetaFranja(20)).toBe('8:00 – 9:00 p. m.');
    expect(etiquetaFranja(8)).toBe('8:00 – 9:00 a. m.');
    expect(etiquetaFranja(11)).toBe('11:00 a. m. – 12:00 p. m.');
    expect(etiquetaFranja(12)).toBe('12:00 – 1:00 p. m.');
    expect(etiquetaFranja(23)).toBe('11:00 p. m. – 12:00 a. m.');
    expect(etiquetaFranja(0)).toBe('12:00 – 1:00 a. m.');
    expect(etiquetaFranja('7')).toBe('7:00 – 8:00 a. m.');
    expect(etiquetaFranja(24)).toBe('—');
    expect(etiquetaFranja(null)).toBe('—');
  });

  test('fechaHoraLocal no pasa por la zona del navegador', () => {
    expect(fechaHoraLocal('2026-11-22T20:05:09.123456')).toBe('22/11/2026 8:05 p. m.');
    expect(fechaHoraLocal('2026-11-23T00:40:00')).toBe('23/11/2026 12:40 a. m.');
    expect(fechaHoraLocal(null)).toBe('—');
    expect(fechaHoraLocal('ayer')).toBe('ayer');
  });
});

// ── Ventas por persona ───────────────────────────────────────────────────

const PERSONAS = {
  totales: { total: 1000, num_ventas: 10, descuentos: 50, propinas: 30 },
  por_persona: [
    { persona_id: BETO, sucursal_id: 2, sedes: 1, num_ventas: 3, total: 300, descuentos: 0, propinas: 30 },
    { persona_id: ANA, sucursal_id: 1, sedes: 2, num_ventas: 6, total: 600, descuentos: 50, propinas: 0 },
    { persona_id: null, sucursal_id: 1, sedes: 1, num_ventas: 1, total: 100, descuentos: 0, propinas: 0 },
  ],
  por_metodo: [
    { persona_id: ANA, metodo: 'cash', monto: 400, pagos: 4 },
    { persona_id: ANA, metodo: 'nequi', monto: 200, pagos: 2 },
    { persona_id: BETO, metodo: 'cash', monto: 300, pagos: 3 },
    { persona_id: null, metodo: 'wompi', monto: 100, pagos: 1 },
  ],
  por_dia: [
    { persona_id: ANA, fecha: '2026-11-02', total: 600, num_ventas: 6 },
    { persona_id: BETO, fecha: '2026-11-01', total: 300, num_ventas: 3 },
    { persona_id: null, fecha: '2026-11-02', total: 100, num_ventas: 1 },
  ],
  por_hora: [
    { persona_id: ANA, hora: 20, total: 600, num_ventas: 6 },
    { persona_id: BETO, hora: 8, total: 300, num_ventas: 3 },
    { persona_id: null, hora: 20, total: 100, num_ventas: 1 },
  ],
  devoluciones: 40,
};

describe('ventas-vendedor («Ventas por persona»)', () => {
  test('pasa persona, métodos y «contar por» a la RPC', async () => {
    const { llamadas } = await correr(ventasReports, 'ventas-vendedor', { fn_reporte_ventas_personas: () => PERSONAS }, { persona: ANA, metodos: ['cash'], contarPor: 'mesero' });
    expect(llamadas.find((l) => l.nombre === 'fn_reporte_ventas_personas')?.args).toEqual({
      p_organization_id: ORG,
      p_from: '2026-11-01T05:00:00.000Z',
      p_to: '2026-12-01T04:59:59.999Z',
      p_branch_id: null,
      p_contar_por: 'mesero',
      p_persona: ANA,
      p_metodos: ['cash'],
    });
  });

  test('resumen con rol, «Varias» sedes, «Sin asignar» y % de participación', async () => {
    const { data } = await correr(ventasReports, 'ventas-vendedor', { fn_reporte_ventas_personas: () => PERSONAS }, { contarPor: 'mesero' });
    expect(data.titulo).toBe('Ventas por persona');
    expect(data.vistaPrincipal).toBe('Resumen');
    expect(data.columnas[0].titulo).toBe('Mesero');
    expect(data.filas[0]).toMatchObject({ persona: 'Ana Ríos', rol: 'Cajero', sede: 'Varias', num_ventas: 6, total: 600, ticket_promedio: 100, participacion: 60 });
    expect(data.filas[1]).toMatchObject({ persona: 'Beto', rol: 'Mesero', sede: 'Norte' });
    expect(data.filas[2]).toMatchObject({ persona: 'Sin asignar', rol: '—', sede: 'Centro' });
    expect(data.kpis.map((k) => [k.titulo, k.valor])).toEqual([
      ['Total vendido', 1000],
      ['N.º de ventas', 10],
      ['Ticket promedio', 100],
      ['Descuentos dados', 50],
      ['Persona con más ventas', 'Ana Ríos'],
    ]);
    expect(data.lectura?.[0]).toMatchObject({ tono: 'info', texto: '1 venta no tiene mesero asignado; sale como «Sin asignar».' });
  });

  test('métodos de pago: una columna por método con su nombre y fila de totales', async () => {
    const { data } = await correr(ventasReports, 'ventas-vendedor', { fn_reporte_ventas_personas: () => PERSONAS });
    const v = vista(data, 'metodos');
    expect(v.columnas.map((c) => c.titulo)).toEqual(['Persona', 'Sede', 'Efectivo', 'Nequi', 'wompi', 'Total recibido']);
    expect(v.filas[0]).toMatchObject({ persona: 'Ana Ríos', sede: 'Varias', m_cash: 400, m_nequi: 200, total: 600 });
    expect(v.totales).toEqual({ m_cash: 700, m_nequi: 200, m_wompi: 100, total: 1000 });
  });

  test('por hora: franja local en a. m./p. m., una columna por persona y ordenado por hora', async () => {
    const { data } = await correr(ventasReports, 'ventas-vendedor', { fn_reporte_ventas_personas: () => PERSONAS });
    const v = vista(data, 'por-hora');
    expect(v.columnas.map((c) => c.titulo)).toEqual(['Franja', 'Ana Ríos', 'Beto', 'Sin asignar', 'Total']);
    expect(v.filas.map((f) => f.franja)).toEqual(['8:00 – 9:00 a. m.', '8:00 – 9:00 p. m.']);
    expect(v.filas[1]).toMatchObject({ p0: 600, p2: 100, total: 700 });
    expect(vista(data, 'por-dia').filas.map((f) => f.fecha)).toEqual(['2026-11-01', '2026-11-02', '2026-11-02']);
  });

  test('con la RPC vacía no revienta', async () => {
    const { data } = await correr(ventasReports, 'ventas-vendedor', {});
    expect(data.filas).toEqual([]);
    expect(data.vistas?.every((v) => Array.isArray(v.filas))).toBe(true);
    expect(data.kpis[4].valor).toBe('—');
  });
});

// ── Resumen general del punto de venta ───────────────────────────────────

describe('ventas-periodo («Resumen general del punto de venta»)', () => {
  const RESUMEN = {
    por_sucursal: [
      { sucursal_id: 2, total: 300, num_ventas: 3 },
      { sucursal_id: 1, total: 700, num_ventas: 7 },
    ],
    por_dia: [],
    total_ventas: 1000,
    num_ventas: 10,
  };

  test('KPI sin sumar propinas, sede como vista principal y las cuatro pestañas', async () => {
    const { data, llamadas } = await correr(ventasReports, 'ventas-periodo', {
      fn_reporte_ventas_resumen: () => RESUMEN,
      fn_reporte_ventas_personas: () => PERSONAS,
    });
    expect(llamadas.map((l) => l.nombre).sort()).toEqual(['fn_reporte_ventas_personas', 'fn_reporte_ventas_resumen']);
    expect(data.titulo).toBe('Resumen general del punto de venta');
    expect(data.kpis.map((k) => [k.titulo, k.valor])).toEqual([
      ['Total vendido', 1000],
      ['N.º ventas', 10],
      ['Ticket promedio', 100],
      ['Descuentos', 50],
      ['Devoluciones', 40],
      ['Propinas', 30],
    ]);
    expect(data.vistaPrincipal).toBe('Por sede');
    expect(data.filas.map((f) => f.sucursal)).toEqual(['Centro', 'Norte']);
    expect(data.vistas?.map((v) => v.id)).toEqual(['por-persona', 'metodos', 'descuentos', 'por-dia']);
    expect(vista(data, 'por-persona').filas[0]).toMatchObject({ persona: 'Ana Ríos', neto: 550 });
    expect(vista(data, 'metodos').filas[0]).toMatchObject({ metodo: 'Efectivo', pagos: 7, monto: 700, participacion: 70 });
    expect(vista(data, 'descuentos').filas).toEqual([{ persona: 'Ana Ríos', descuentos: 50, participacion: 8.3 }]);
    expect(vista(data, 'por-dia').filas).toEqual([
      { fecha: '2026-11-01', num_ventas: 3, total: 300 },
      { fecha: '2026-11-02', num_ventas: 7, total: 700 },
    ]);
    expect(data.lectura?.some((l) => l.texto.includes('«Por sede»'))).toBe(false);
  });

  test('con persona o métodos, la lectura avisa que la pestaña por sede no los aplica', async () => {
    const { data } = await correr(
      ventasReports,
      'ventas-periodo',
      { fn_reporte_ventas_resumen: () => RESUMEN, fn_reporte_ventas_personas: () => PERSONAS },
      { metodos: ['nequi'] },
    );
    expect(data.lectura?.[0]).toMatchObject({ tono: 'info', texto: expect.stringContaining('«Por sede»') });
  });
});

// ── Ventas por hora y lo más vendido ─────────────────────────────────────

const MAS_VENDIDO = {
  totales: { unidades: 12, ingreso: 1200, productos: 3 },
  por_producto: [
    { producto_id: 5, producto: 'Tinto', sku: 'T-1', categoria: 'Bebidas', unidades: 8, ingreso: 800 },
    { producto_id: 6, producto: null, sku: null, categoria: null, unidades: 4, ingreso: 400 },
  ],
  por_hora: [
    { hora: 20, puesto: 1, producto_id: 5, producto: 'Tinto', categoria: 'Bebidas', unidades: 2, ingreso: 200, total_franja: 400 },
    { hora: 8, puesto: 1, producto_id: 6, producto: 'Pan', categoria: null, unidades: 4, ingreso: 400, total_franja: 400 },
  ],
  por_sede: [{ sucursal_id: 2, puesto: 1, producto_id: 5, producto: 'Tinto', categoria: 'Bebidas', unidades: 8, ingreso: 800, total_sede: 1000 }],
};

describe('ventas-hora', () => {
  test('ordenado por hora, hora pico, por sede y lo más vendido por hora', async () => {
    const { data, llamadas } = await correr(ventasReports, 'ventas-hora', {
      fn_reporte_ventas_por_hora: () => ({
        por_hora: [
          { hora: 20, total: 700, num_ventas: 7 },
          { hora: 8, total: 300, num_ventas: 3 },
        ],
        por_hora_sede: [
          { hora: 8, sucursal_id: 2, total: 300, num_ventas: 3 },
          { hora: 20, sucursal_id: 1, total: 500, num_ventas: 5 },
          { hora: 20, sucursal_id: 2, total: 200, num_ventas: 2 },
        ],
        zona: 'America/Bogota',
      }),
      fn_reporte_mas_vendido: () => MAS_VENDIDO,
    });
    // Lo más vendido sin persona ni métodos: «Ventas por hora» no declara esos filtros.
    expect(llamadas.find((l) => l.nombre === 'fn_reporte_mas_vendido')?.args).toMatchObject({ p_contar_por: 'cajero', p_persona: null, p_metodos: null });
    expect(data.filas.map((f) => f.rango)).toEqual(['8:00 – 9:00 a. m.', '8:00 – 9:00 p. m.']);
    expect(data.kpis[0]).toEqual({ titulo: 'Hora pico', valor: '8:00 – 9:00 p. m.' });
    expect(data.vistaPrincipal).toBe('Total');
    const sede = vista(data, 'por-sede');
    expect(sede.columnas.map((c) => c.titulo)).toEqual(['Franja', 'Norte', 'Centro', 'Total']);
    expect(sede.filas[1]).toMatchObject({ franja: '8:00 – 9:00 p. m.', s_1: 500, s_2: 200, total: 700 });
    expect(sede.totales).toEqual({ s_1: 500, s_2: 500, total: 1000 });
    const mas = vista(data, 'mas-vendido-hora');
    expect(mas.titulo).toBe('Lo más vendido por hora');
    expect(mas.filas[0]).toMatchObject({ franja: '8:00 – 9:00 a. m.', puesto: 1, producto: 'Pan', categoria: 'Sin categoría', participacion: 100 });
    expect(mas.filas[1]).toMatchObject({ producto: 'Tinto', participacion: 50 });
  });
});

describe('mas-vendido («Lo más vendido»)', () => {
  test('producto estrella, % del ingreso, por hora y por sede', async () => {
    const { data, llamadas } = await correr(ventasReports, 'mas-vendido', { fn_reporte_mas_vendido: () => MAS_VENDIDO }, { contarPor: 'vendedor', persona: BETO });
    expect(llamadas[0].args).toMatchObject({ p_contar_por: 'vendedor', p_persona: BETO, p_metodos: null });
    expect(data.kpis.map((k) => k.valor)).toEqual(['Tinto', 12, 1200]);
    expect(data.vistaPrincipal).toBe('Por producto');
    expect(data.filas[0]).toMatchObject({ producto: 'Tinto', participacion: 66.7 });
    expect(data.filas[1]).toMatchObject({ producto: 'Producto #6', sku: '—', categoria: 'Sin categoría' });
    expect(data.vistas?.map((v) => v.id)).toEqual(['por-hora', 'por-sede']);
    expect(vista(data, 'por-sede').filas[0]).toMatchObject({ sede: 'Norte', participacion: 80 });
    expect(data.lectura?.[0].texto).toContain('2 productos');
  });
});

// ── Ítems vendidos y descuentos ──────────────────────────────────────────

const LINEA = {
  fecha: '2026-11-22T20:05:09.5',
  venta_id: 'v-1',
  factura: 'FE-10',
  producto_id: 5,
  producto: 'Tinto',
  sku: 'T-1',
  cantidad: 2,
  precio: 100,
  descuento: 20,
  impuesto: 0,
  total: 180,
  persona_id: ANA,
  sucursal_id: 1,
};

describe('items-vendidos', () => {
  test('línea por línea con hora local, totales de todas y aviso si se corta', async () => {
    const { data, llamadas } = await correr(
      ventasReports,
      'items-vendidos',
      { fn_reporte_items_vendidos: () => ({ totales: { lineas: 2500, cantidad: 3000, descuento: 20, impuesto: 0, total: 9000 }, lineas: [LINEA], por_persona: [], limite: 2000 }) },
      { contarPor: 'vendedor' },
    );
    expect(llamadas[0].args).toMatchObject({ p_solo_descuento: false, p_limite: 2000, p_contar_por: 'vendedor' });
    expect(data.filas[0]).toMatchObject({ fecha: '22/11/2026 8:05 p. m.', factura: 'FE-10', persona: 'Ana Ríos', sede: 'Centro', total: 180 });
    expect(data.columnas.find((c) => c.key === 'persona')?.titulo).toBe('Vendedor');
    expect(data.totales).toEqual({ cantidad: 3000, descuento: 20, impuesto: 0, total: 9000 });
    expect(data.kpis.map((k) => k.valor)).toEqual([2500, 3000, 20, 9000]);
    expect(data.lectura?.[0]).toMatchObject({ tono: 'aviso', texto: expect.stringContaining('últimas 1') });
  });

  test('sin corte no hay aviso', async () => {
    const { data } = await correr(ventasReports, 'items-vendidos', { fn_reporte_items_vendidos: () => ({ totales: { lineas: 1 }, lineas: [LINEA], limite: 2000 }) });
    expect(data.lectura).toBeUndefined();
  });
});

describe('devoluciones-descuentos', () => {
  test('conserva la vista de siempre y suma productos con descuento y por persona', async () => {
    const { data, llamadas } = await correr(
      ventasReports,
      'devoluciones-descuentos',
      {
        fn_reporte_items_vendidos: () => ({
          totales: { lineas: 1, cantidad: 2, descuento: 20, impuesto: 0, total: 180 },
          lineas: [LINEA],
          por_persona: [{ persona_id: ANA, lineas: 1, descuento: 20, total: 180 }],
          limite: 2000,
        }),
      },
      { persona: ANA },
    );
    expect(llamadas[0].args).toMatchObject({ p_solo_descuento: true, p_persona: ANA, p_limite: 2000 });
    expect(data.vistaPrincipal).toBe('Movimientos');
    expect(data.columnas.map((c) => c.key)).toEqual(['tipo', 'fecha', 'sucursal', 'motivo', 'monto', 'estado']);
    expect(data.vistas?.map((v) => v.id)).toEqual(['productos-descuento', 'descuentos-persona']);
    expect(vista(data, 'productos-descuento').filas[0]).toMatchObject({ producto: 'Tinto', pct_descuento: 10, persona: 'Ana Ríos', sede: 'Centro' });
    expect(vista(data, 'descuentos-persona').filas[0]).toMatchObject({ persona: 'Ana Ríos', rol: 'Cajero', pct_descuento: 10 });
    expect(data.lectura?.[0].texto).toContain('«Movimientos»');
  });
});

// ── Opciones de los filtros (GET /api/reportes/opciones-ventas) ──────────

describe('listarOpcionesVentas', () => {
  test('miembros activos de la organización con su rol y métodos activos con su nombre', async () => {
    const db = fakeTablas({
      ...TABLAS(),
      organization_members: [
        { organization_id: ORG, user_id: BETO, is_active: true, roles: [{ name: 'Mesero' }] },
        { organization_id: ORG, user_id: ANA, is_active: true, roles: { name: 'Cajero' } },
        { organization_id: ORG, user_id: 'inactivo', is_active: false, roles: null },
        { organization_id: ORG + 1, user_id: 'ajeno', is_active: true, roles: null },
      ],
      organization_payment_methods: [
        { organization_id: ORG, payment_method_code: 'nequi', is_active: true },
        { organization_id: ORG, payment_method_code: 'cash', is_active: true },
        { organization_id: ORG, payment_method_code: 'card', is_active: false },
        { organization_id: ORG + 1, payment_method_code: 'wompi', is_active: true },
      ],
    });
    const r = await listarOpcionesVentas({ organizationId: ORG, supabase: db as unknown as SupabaseClient });
    expect(r.personas).toEqual([
      { id: ANA, nombre: 'Ana Ríos', rol: 'Cajero' },
      { id: BETO, nombre: 'Beto', rol: 'Mesero' },
    ]);
    expect(r.metodos).toEqual([
      { codigo: 'cash', nombre: 'Efectivo' },
      { codigo: 'nequi', nombre: 'Nequi' },
    ]);
  });

  test('sin métodos configurados ofrece los del catálogo general', async () => {
    const db = fakeTablas({ ...TABLAS(), organization_members: [] });
    const r = await listarOpcionesVentas({ organizationId: ORG, supabase: db as unknown as SupabaseClient });
    expect(r).toEqual({ personas: [], metodos: [{ codigo: 'cash', nombre: 'Efectivo' }, { codigo: 'nequi', nombre: 'Nequi' }] });
  });
});

// ── Comisiones por sede y despachos ──────────────────────────────────────

describe('comisionesPorSede', () => {
  test('fila de sede en negrita con su subtotal y sus personas debajo; sin sede al final', () => {
    const filas = comisionesPorSede(
      [
        { payee_id: 'u-1', payee_name: 'Ana', base_amount: 1000, commission_amount: 100, status: 'accrued', currency: 'COP', branch_id: 1 },
        { payee_id: 'u-2', payee_name: 'Beto', base_amount: 500, commission_amount: 50, status: 'paid', currency: 'COP', branch_id: 1 },
        { payee_id: 'u-1', payee_name: 'Ana', base_amount: 3000, commission_amount: 300, status: 'accrued', currency: 'COP', branch_id: 2 },
        { payee_id: 'u-3', payee_name: 'Caro', base_amount: 10, commission_amount: 1, status: 'accrued', currency: 'COP', branch_id: null },
      ],
      (id) => (id === 1 ? 'Centro' : 'Norte'),
    );
    expect(filas.map((f) => [f.sede, f.persona, f.nivel, f.comision])).toEqual([
      ['Norte', '1 persona', 'subtotal', 300],
      ['Norte', 'Ana', 'linea', 300],
      ['Centro', '2 personas', 'subtotal', 150],
      ['Centro', 'Ana', 'linea', 100],
      ['Centro', 'Beto', 'linea', 50],
      ['Sin sede', '1 persona', 'subtotal', 1],
      ['Sin sede', 'Caro', 'linea', 1],
    ]);
    expect(filas[2]).toMatchObject({ pagado: 50, pendiente: 100, total: 1500, ventas: 2 });
  });
});

describe('despacho-mercancias', () => {
  const DESPACHOS = {
    totales: { despachos: 3, items: 7, entregados: 1, cancelados: 0, pendientes: 2 },
    despachos: [
      { tipo: 'envio', id: 'e1', numero: 'ENV-1', fecha: '2026-11-20T15:00:00+00:00', origen_id: 1, destino_sucursal_id: null, destino: 'Cliente Uno', ciudad: 'Cali', responsable_id: ANA, estado: 'in_transit', entregado: null, items: 3 },
      { tipo: 'traslado', id: '9', numero: 'TR-9', fecha: '2026-11-21T15:00:00+00:00', origen_id: 1, destino_sucursal_id: 2, destino: null, ciudad: null, responsable_id: null, estado: 'received', entregado: '2026-11-22T10:00:00+00:00', items: 4 },
    ],
    por_responsable: [{ responsable_id: ANA, despachos: 2, items: 5, entregados: 1 }],
    items: [{ producto_id: 5, producto: 'Tinto', sku: 'T-1', cantidad: 7, despachos: 2 }],
  };

  test('estados en español', () => {
    expect(['pending', 'dispatched', 'in_transit', 'delivered', 'received', 'cancelled', 'raro'].map(estadoDespacho)).toEqual([
      'Preparando',
      'En camino',
      'En camino',
      'Entregado',
      'Recibido',
      'Cancelado',
      'raro',
    ]);
  });

  test('tipo, origen y destino con nombre, responsable y aviso si se corta la tabla', async () => {
    const { data, llamadas } = await correr(inventarioReports, 'despacho-mercancias', { fn_reporte_despachos: () => DESPACHOS });
    expect(Object.keys(llamadas[0].args).sort()).toEqual(['p_branch_id', 'p_from', 'p_organization_id', 'p_to']);
    expect(data.kpis.map((k) => k.valor)).toEqual([3, 7, 1, 2]);
    expect(data.filas[0]).toMatchObject({ tipo: 'Envío', origen: 'Centro', destino: 'Cliente Uno · Cali', responsable: 'Ana Ríos', estado: 'En camino' });
    expect(data.filas[1]).toMatchObject({ tipo: 'Traslado', destino: 'Norte', responsable: 'Sin registrar', estado: 'Recibido' });
    expect(data.vistas?.map((v) => v.id)).toEqual(['items', 'por-responsable']);
    expect(vista(data, 'por-responsable').filas[0]).toMatchObject({ responsable: 'Ana Ríos', pct_entregados: 50 });
    expect(data.lectura?.[0].tono).toBe('aviso');
  });

  test('armarDespachos con la RPC vacía', () => {
    const a = armarDespachos({}, { sede: () => '—', persona: () => '—' });
    expect(a.filas).toEqual([]);
    expect(a.kpis.every((k) => k.valor === 0)).toBe(true);
  });
});
