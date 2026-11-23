/**
 * Widgets del inicio para Ventas, Logística y Transporte (Figma `03` › Inicio,
 * 2915:45356; aprobado el 2026-11-23). Reglas puras: estados (sin datos, al
 * día, por atender), badge de la fila, «Requiere atención», desgloses y que
 * cada enlace salga del menú de la persona. Cifras ficticias.
 */
import { porcentajes, ordenarAtencion, variacionPct, type AtencionWidget } from '../widgetsInicio';
import { armarVentas, type CrudoVentasWidget } from '../ventasWidgetInicio';
import { armarLogistica, type CrudoLogisticaInicio } from '../logisticaInicio';
import { armarTransporte, grupoViaje, type CrudoTransporteInicio, type ViajeInicio } from '../transporteInicio';
import { resumirModulo, tieneResumen } from '../resumenModulos';
import type { FilaVenta } from '@/lib/pos/ventas/listadoServidor';
import type { Cumplimiento } from '@/lib/transporte/despachos';

const todo = (p: string) => p;
const nada = () => null;

describe('porcentajes', () => {
  test('suman exactamente 100 (mayor resto)', () => {
    expect(porcentajes([1, 1, 1])).toEqual([34, 33, 33]);
    expect(porcentajes([30512000, 13204500, 2418000, 2186000]).reduce((s, v) => s + v, 0)).toBe(100);
  });
  test('sin total, ceros; los negativos no cuentan', () => {
    expect(porcentajes([0, 0])).toEqual([0, 0]);
    expect(porcentajes([-5, 10])).toEqual([0, 100]);
  });
  test('variación sin base de comparación es null', () => {
    expect(variacionPct(100, 0)).toBeNull();
    expect(variacionPct(108, 100)).toBeCloseTo(8);
  });
  test('«Requiere atención»: lo más grave arriba, estable', () => {
    const a = (id: string, tono: AtencionWidget['tono']): AtencionWidget => ({ id, tono, icono: 'reloj', titulo: { clave: 'x' }, accion: { clave: 'y' }, href: '/z' });
    expect(ordenarAtencion([a('1', 'informacion'), a('2', 'peligro'), a('3', 'advertencia'), a('4', 'peligro')]).map((x) => x.id)).toEqual(['2', '4', '3', '1']);
  });
});

// ─── Ventas ─────────────────────────────────────────────────────────────────

const VENTAS: CrudoVentasWidget = {
  moneda: 'COP',
  periodo: { ventas: 48320500, efectivas: 1312, ticket_promedio: 36830 },
  anterior: { ventas: 43000000, efectivas: 1200 },
  hoy: { ventas: 4862300, efectivas: 131 },
  semana: { ventas: 4502100, efectivas: 120 },
  por_canal: [
    { canal: 'pos', ventas: 30512000, efectivas: 800 },
    { canal: 'tienda_web', ventas: 13204500, efectivas: 300 },
    { canal: 'menu_qr', ventas: 2418000, efectivas: 120 },
    { canal: 'manual', ventas: 2186000, efectivas: 92 },
  ],
  por_sede: [
    { id: 1, nombre: 'Principal', ventas: 24160250 },
    { id: 2, nombre: 'Norte', ventas: 16912175 },
    { id: 3, nombre: 'Centro', ventas: 7248075 },
  ],
  sucursales: 3,
  pedidos: { pendientes: 7, por_expirar: 3, minutos: 30 },
  hay_ventas: true,
};

const fila = (id: string, canal: FilaVenta['canal']): FilaVenta => ({
  id,
  fecha: '2026-11-23T19:32:00Z',
  creada: '2026-11-23T19:32:00Z',
  total: 38900,
  saldo: 0,
  status: 'paid',
  payment_status: 'paid',
  estado: 'pagada',
  origen: 'pos',
  canal,
  numero: `F-${id}`,
  tipo_numero: 'factura',
  factura_id: null,
  cxc_id: null,
  web_order_id: null,
  cliente: null,
  cajero: { id: 'u', nombre: null },
  sucursal: { id: 1, nombre: 'Principal' },
  metodos: ['cash'],
  devuelto: 0,
  notas_credito: 0,
});

const entradaVentas = (crudo: CrudoVentasWidget, extra: Partial<Parameters<typeof armarVentas>[0]> = {}) =>
  armarVentas({ crudo, ultimas: [fila('1', 'pos'), fila('2', 'tienda_web')], monedaBase: 'COP', periodoEsHoy: false, sucursal: null, cajas: { abiertas: 0, anteriores: 0 }, href: todo, ...extra });

describe('armarVentas', () => {
  test('con pedidos por atender: badge «7 por atender», cuatro cifras y desgloses', () => {
    const v = entradaVentas(VENTAS);
    expect(v.estado).toBe('atencion');
    expect(v.fila).toMatchObject({ tono: 'advertencia', badge: { clave: 'ventas.fila.porAtender', params: { n: 7 } } });
    expect(v.kpis.map((k) => k.id)).toEqual(['hoy', 'periodo', 'ticket', 'porAtender']);
    expect(v.kpis[0].delta).toBeCloseTo(8, 0);
    expect(v.kpis[3].href).toBe('/app/pos/pedidos-online');
    expect(v.porCanal?.tramos.map((t) => t.id)).toEqual(['pos', 'tienda_web', 'menu_qr', 'manual']);
    expect(v.porCanal?.tramos.reduce((s, t) => s + t.porcentaje, 0)).toBe(100);
    expect(v.porSede?.tramos).toHaveLength(3);
    expect(v.ultimas.map((u) => u.href)).toEqual(['/app/pos/ventas/1', '/app/pos/ventas/2']);
    expect(v.acciones.map((a) => a.id)).toEqual(['abrirPos', 'pedidoManual']);
  });

  test('con una sede elegida no hay «Ventas por sede» (Regla 3)', () => {
    expect(entradaVentas(VENTAS, { sucursal: 2 }).porSede).toBeNull();
  });

  test('al día: sin pedidos ni cajas viejas, badge «Al día»', () => {
    const v = entradaVentas({ ...VENTAS, pedidos: { pendientes: 0, por_expirar: 0 } });
    expect(v.estado).toBe('alDia');
    expect(v.fila).toMatchObject({ tono: 'exito', badge: { clave: 'comun.alDia' } });
  });

  test('las cajas de días anteriores se conservan como badge (lo que ya mostraba la fila)', () => {
    const v = entradaVentas({ ...VENTAS, pedidos: { pendientes: 0 } }, { cajas: { abiertas: 3, anteriores: 1 } });
    expect(v.fila.badge).toEqual({ clave: 'ventas.fila.cajasAntiguas', params: { n: 1 } });
    expect(v.cajas).toEqual({ abiertas: 3, anteriores: 1, href: '/app/pos/cajas' });
  });

  test('sin ninguna venta nunca: estado «Sin datos» con «Abrir POS» y «Nuevo pedido manual»', () => {
    const v = entradaVentas({ hay_ventas: false, periodo: { ventas: 0, efectivas: 0 } });
    expect(v.estado).toBe('sinDatos');
    expect(v.fila.badge).toEqual({ clave: 'comun.sinDatos' });
    expect(v.acciones.map((a) => a.id)).toEqual(['abrirPos', 'pedidoManual']);
  });

  test('las acciones y enlaces salen del menú de la persona', () => {
    const v = entradaVentas(VENTAS, { href: nada });
    expect(v.acciones).toEqual([]);
    expect(v.ultimas.every((u) => u.href === null)).toBe(true);
    expect(v.kpis.every((k) => !k.href)).toBe(true);
  });
});

// ─── Logística ──────────────────────────────────────────────────────────────

const LOGISTICA: CrudoLogisticaInicio = {
  hayEnvios: true,
  despacho: {
    porDespachar: 38,
    paraHoy: 31,
    paraManana: 7,
    atrasados: 5,
    contraentregaHoy: 1126400,
    enviosContraentregaHoy: 14,
    sinDomiciliario: 21,
    sinDomiciliarioHoy: 21,
    saleHoy: 31,
  },
  masAtrasado: { numero: 'WO-000412', minutos: 18 },
  seguimiento: { todo: 12, novedades: 4, sinMovimiento: 8, vencenHoy: 2, sinMovimientoTransportadora: 3 },
  cuadres: { porRecibir: 718100, domiciliariosPorRecibir: 2, cuadradosHoy: 3, recibidoHoy: 900000, conDiferenciaHoy: 1, faltanteHoy: -4000, abiertosAnteriores: 0 },
  abiertos: { porDespachar: 38, enCamino: 42, conNovedad: 4 },
  primerIntento: 0.914,
  metaPrimerIntento: 0.9,
};

describe('armarLogistica', () => {
  test('con atrasados: badge rojo, cinco renglones en orden de gravedad', () => {
    const l = armarLogistica({ crudo: LOGISTICA, moneda: 'COP', href: todo });
    expect(l.fila).toMatchObject({ tono: 'peligro', badge: { clave: 'logistica.fila.atrasados', params: { n: 5 } } });
    expect(l.atencion.map((a) => a.id)).toEqual(['atrasados', 'novedades', 'sinMovimiento', 'conDiferencia', 'porRecibir']);
    expect(l.atencion.find((a) => a.id === 'conDiferencia')?.importe).toEqual({ tipo: 'moneda', valor: 4000, moneda: 'COP' });
    expect(l.atencion.find((a) => a.id === 'atrasados')?.href).toBe('/app/logistica/por-despachar');
    expect(l.abiertos?.total).toEqual({ tipo: 'numero', valor: 84 });
    expect(l.primerIntento).toEqual({ tasa: 0.914, meta: 0.9 });
  });

  test('al día: nada que atender', () => {
    const l = armarLogistica({
      crudo: {
        ...LOGISTICA,
        despacho: { ...LOGISTICA.despacho!, atrasados: 0 },
        seguimiento: { todo: 0, novedades: 0, sinMovimiento: 0, vencenHoy: 0, sinMovimientoTransportadora: 0 },
        cuadres: { ...LOGISTICA.cuadres!, conDiferenciaHoy: 0, faltanteHoy: 0, porRecibir: 0 },
      },
      moneda: 'COP',
      href: todo,
    });
    expect(l.estado).toBe('alDia');
    expect(l.fila.badge).toEqual({ clave: 'comun.alDia' });
  });

  test('si una fuente falló nunca dice «Al día»', () => {
    const l = armarLogistica({ crudo: { ...LOGISTICA, despacho: { ...LOGISTICA.despacho!, atrasados: 0 }, seguimiento: null, cuadres: null }, moneda: 'COP', href: todo });
    expect(l.parcial).toBe(true);
    expect(l.fila.badge).toBeNull();
  });

  test('sin envíos nunca: «Sin datos» con zonas y domiciliario', () => {
    const l = armarLogistica({ crudo: { ...LOGISTICA, hayEnvios: false }, moneda: 'COP', href: todo });
    expect(l.estado).toBe('sinDatos');
    expect(l.acciones.map((a) => a.href)).toEqual(['/app/logistica/zonas', '/app/logistica/domiciliarios']);
  });

  test('sin la página en el menú, el renglón no aparece (no podría resolverlo)', () => {
    const l = armarLogistica({ crudo: LOGISTICA, moneda: 'COP', href: (p) => (p.endsWith('/cuadres') ? null : p) });
    expect(l.atencion.map((a) => a.id)).not.toContain('porRecibir');
    expect(l.atencion.map((a) => a.id)).not.toContain('conDiferencia');
  });
});

// ─── Transporte ─────────────────────────────────────────────────────────────

const viaje = (id: string, status: string, extra: Partial<ViajeInicio> = {}): ViajeInicio => ({
  id,
  codigo: `V-${id}`,
  salida: `2026-11-23T${10 + Number(id)}:30:00Z`,
  status,
  despachadoEn: ['in_transit', 'completed', 'arrived'].includes(status) ? '2026-11-23T10:00:00Z' : null,
  conExcepcion: false,
  ruta: 'Ruta A',
  placa: 'WNP104',
  puestos: 40,
  disponibles: 10,
  retraso: 0,
  ...extra,
});

const bloqueo: Cumplimiento = {
  tripId: '4',
  bloqueos: [{ causa: 'soat', grupo: 'vehiculo', vence: '2026-11-20', excepcion: false }],
  avisos: [],
  admiteExcepcion: false,
  pidePin: true,
};

const TRANSPORTE: CrudoTransporteInicio = {
  hayViajes: true,
  hayVehiculos: true,
  viajes: [viaje('1', 'completed'), viaje('2', 'in_transit'), viaje('3', 'scheduled'), viaje('4', 'scheduled'), viaje('5', 'cancelled')],
  cumplimiento: new Map([['4', bloqueo]]),
  vehiculos: { total: 15, disponibles: 9, enUso: 4, mantenimiento: 2, placasMantenimiento: ['WNP105', 'TKL203'] },
  documentos: { vencidos: 2, porVencer: 5, vigentes: 20, total: 27, sinFecha: 0, primero: '2026-11-30', vencidosEjemplo: [{ nombre: 'WNP104', tipo: 'soat' }] },
};

describe('armarTransporte', () => {
  test('grupos del día con la regla de Despachos de hoy', () => {
    expect(grupoViaje({ status: 'completed' }, 'despachado')).toBe('completados');
    expect(grupoViaje({ status: 'in_transit' }, 'despachado')).toBe('enRuta');
    expect(grupoViaje({ status: 'scheduled' }, 'bloqueado')).toBe('bloqueados');
    expect(grupoViaje({ status: 'cancelled' }, 'cancelado')).toBe('cancelados');
  });

  test('con un despacho bloqueado: badge rojo, renglón con su causa y desglose sin cancelados', () => {
    const tr = armarTransporte({ crudo: TRANSPORTE, href: todo });
    expect(tr.fila).toMatchObject({ tono: 'peligro', badge: { clave: 'transporte.fila.bloqueados', params: { n: 1 } } });
    const b = tr.atencion.find((a) => a.id === 'bloqueado-4');
    expect(b?.detalle?.params).toMatchObject({ causa: 'soat', placa: 'WNP104' });
    expect(b?.href).toBe('/app/transporte/viajes');
    expect(tr.atencion.map((a) => a.id)).toEqual(['bloqueado-4', 'documentosVencidos', 'mantenimiento']);
    expect(tr.porEstado?.total).toEqual({ tipo: 'numero', valor: 4 });
    expect(tr.kpis.find((k) => k.id === 'viajesHoy')?.cifra).toEqual({ tipo: 'numero', valor: 4 });
    // Ocupación de los dos ya salidos: 60 de 80 puestos.
    expect(tr.kpis.find((k) => k.id === 'ocupacion')?.cifra).toEqual({ tipo: 'texto', texto: { clave: 'transporte.detalles.porcentaje', params: { p: 75 } } });
  });

  test('sin viajes salidos la ocupación es «—»', () => {
    const tr = armarTransporte({ crudo: { ...TRANSPORTE, viajes: [viaje('3', 'scheduled')], cumplimiento: new Map() }, href: todo });
    expect(tr.kpis.find((k) => k.id === 'ocupacion')?.sinCifra).toBe(true);
  });

  test('al día', () => {
    const tr = armarTransporte({
      crudo: { ...TRANSPORTE, viajes: [viaje('1', 'completed')], cumplimiento: new Map(), vehiculos: { ...TRANSPORTE.vehiculos!, mantenimiento: 0, placasMantenimiento: [] }, documentos: { ...TRANSPORTE.documentos!, vencidos: 0, vencidosEjemplo: [] } },
      href: todo,
    });
    expect(tr.estado).toBe('alDia');
    expect(tr.fila.badge).toEqual({ clave: 'comun.alDia' });
  });

  test('sin viajes ni vehículos nunca: «Sin datos» con «Programar viaje»', () => {
    const tr = armarTransporte({ crudo: { ...TRANSPORTE, hayViajes: false, hayVehiculos: false, viajes: [] }, href: todo });
    expect(tr.estado).toBe('sinDatos');
    expect(tr.acciones.map((a) => a.id)).toEqual(['programar', 'vehiculo']);
  });
});

describe('resumen de módulos', () => {
  test('Logística tiene regla: la fila aparece cuando la base la devuelve', () => {
    expect(tieneResumen('logistica')).toBe(true);
    expect(resumirModulo({ codigo: 'logistica' }, 'COP')).toMatchObject({ codigo: 'logistica', error: false, kpis: [] });
  });
});
