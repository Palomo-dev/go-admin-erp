/**
 * Saldos a favor — lógica del listado, de las acciones y de la hoja de detalle
 * (`src/lib/finanzas/saldosAFavor/listadoLogica.ts`) y de los métodos de los
 * diálogos (`metodosSaldo.ts`). Sin React ni Supabase.
 */
import {
  accionesSaldo,
  estadoDeStatus,
  filtrarSaldos,
  kpisSaldos,
  leerConsultaSaldos,
  montoPropuesto,
  ordenarMovimientos,
  ordenarSaldos,
  paginarSaldos,
  validarMonto,
  ConsultaSaldosInvalida,
  type FilaListadoSaldo,
  type MovimientoSaldo,
} from '@/lib/finanzas/saldosAFavor/listadoLogica';
import { metodoInicial, opcionesMetodoSaldo, requiereReferencia } from '@/components/finanzas/saldos-a-favor/metodosSaldo';
import { toPlainDate } from '@/lib/utils/dateCore';

const CLIENTE_A = '11111111-1111-4111-8111-111111111111';
const CLIENTE_B = '22222222-2222-4222-8222-222222222222';

function fila(p: Partial<FilaListadoSaldo> & { id: string }): FilaListadoSaldo {
  return {
    clienteId: CLIENTE_A,
    cliente: 'Cliente Uno',
    clienteDoc: '900123456',
    origen: 'pago',
    origenNumero: 'RC-000031',
    origenId: 'p-1',
    fecha: '2026-09-12T15:00:00Z',
    valor: 500,
    usado: 0,
    disponible: 500,
    vence: null,
    estado: 'disponible',
    anulable: true,
    sucursalId: 7,
    notas: null,
    ...p,
  };
}

const BOGOTA = 'America/Bogota';
const diaBogota = (iso: string) => toPlainDate(new Date(iso), BOGOTA);

describe('estadoDeStatus', () => {
  test('el estado vivo de la RPC pasa a los cuatro de la pantalla', () => {
    expect(estadoDeStatus('active')).toBe('disponible');
    expect(estadoDeStatus('expired')).toBe('vencido');
    expect(estadoDeStatus('cancelled')).toBe('anulado');
    expect(estadoDeStatus('used')).toBe('usado');
    expect(estadoDeStatus(null)).toBe('usado');
  });
});

describe('leerConsultaSaldos', () => {
  test('lee filtros, orden, página y KPI; ignora enumeraciones desconocidas', () => {
    const c = leerConsultaSaldos(
      new URLSearchParams(`q=%20gomez%20&estado=vencido&origen=raro&cliente=${CLIENTE_A}&con_saldo=1&orden=disponible.asc&pagina=2&tamano=10&sucursal=7&kpi_desde=2026-09-01&kpi_hasta=2026-09-30`),
    );
    expect(c.filtros).toEqual({ q: 'gomez', estado: 'vencido', origen: null, cliente: CLIENTE_A, conSaldo: true, desde: null, hasta: null });
    expect(c.orden).toEqual({ campo: 'disponible', direccion: 'asc' });
    expect(c).toMatchObject({ pagina: 2, tamano: 10, sucursal: 7, kpiDesde: '2026-09-01', kpiHasta: '2026-09-30' });
  });

  test('por defecto: fecha descendente, página 1, 25 por página; tamaño con tope 200', () => {
    const c = leerConsultaSaldos(new URLSearchParams('tamano=5000'));
    expect(c.orden).toEqual({ campo: 'fecha', direccion: 'desc' });
    expect(c.pagina).toBe(1);
    expect(c.tamano).toBe(200);
    expect(leerConsultaSaldos(new URLSearchParams('')).tamano).toBe(25);
  });

  test('cliente, día o sucursal mal formados → error (la ruta responde datos_invalidos)', () => {
    expect(() => leerConsultaSaldos(new URLSearchParams('cliente=abc'))).toThrow(ConsultaSaldosInvalida);
    expect(() => leerConsultaSaldos(new URLSearchParams('desde=2026-9-1'))).toThrow(ConsultaSaldosInvalida);
    expect(() => leerConsultaSaldos(new URLSearchParams('sucursal=7;drop'))).toThrow(ConsultaSaldosInvalida);
  });
});

describe('filtrarSaldos', () => {
  const filas = [
    fila({ id: 'a', cliente: 'Laura Gómez', origenNumero: 'RC-000031' }),
    fila({ id: 'b', clienteId: CLIENTE_B, cliente: 'Distribuidora Ejemplo', origen: 'nota_credito', origenNumero: 'NC-0005', anulable: false }),
    fila({ id: 'c', estado: 'vencido', vence: '2026-09-15T05:00:00Z' }),
    fila({ id: 'd', estado: 'usado', disponible: 0, usado: 500 }),
    // 2026-10-01 03:00 UTC es todavía 30 de septiembre en Bogotá.
    fila({ id: 'e', fecha: '2026-10-01T03:00:00Z' }),
  ];

  test('busca sin tildes en cliente, documento y número de origen', () => {
    expect(filtrarSaldos(filas, { q: 'gomez' }, diaBogota).map((f) => f.id)).toEqual(['a']);
    expect(filtrarSaldos(filas, { q: 'nc-0005' }, diaBogota).map((f) => f.id)).toEqual(['b']);
  });

  test('estado, origen, cliente y «solo con saldo»', () => {
    expect(filtrarSaldos(filas, { estado: 'vencido' }, diaBogota).map((f) => f.id)).toEqual(['c']);
    expect(filtrarSaldos(filas, { origen: 'nota_credito' }, diaBogota).map((f) => f.id)).toEqual(['b']);
    expect(filtrarSaldos(filas, { cliente: CLIENTE_B }, diaBogota).map((f) => f.id)).toEqual(['b']);
    // Con saldo = disponible y aplicable: ni el vencido ni el usado.
    expect(filtrarSaldos(filas, { conSaldo: true }, diaBogota).map((f) => f.id)).toEqual(['a', 'b', 'e']);
  });

  test('el periodo se compara con el día de la organización, no el día UTC', () => {
    expect(filtrarSaldos(filas, { desde: '2026-09-30', hasta: '2026-09-30' }, diaBogota).map((f) => f.id)).toEqual(['e']);
    expect(filtrarSaldos(filas, { desde: '2026-10-01' }, diaBogota)).toHaveLength(0);
  });
});

describe('ordenarSaldos y paginarSaldos', () => {
  const filas = [
    fila({ id: 'a', cliente: 'Zoila', disponible: 100, fecha: '2026-09-01T10:00:00Z' }),
    fila({ id: 'b', cliente: 'Álvaro', disponible: 300, fecha: '2026-09-03T10:00:00Z', vence: '2026-12-31T05:00:00Z' }),
    fila({ id: 'c', cliente: 'Beatriz', disponible: 200, fecha: '2026-09-02T10:00:00Z' }),
  ];
  test('por fecha descendente (por defecto), por cliente sin tildes y por disponible', () => {
    expect(ordenarSaldos(filas, 'fecha', 'desc').map((f) => f.id)).toEqual(['b', 'c', 'a']);
    expect(ordenarSaldos(filas, 'cliente', 'asc').map((f) => f.id)).toEqual(['b', 'c', 'a']);
    expect(ordenarSaldos(filas, 'disponible', 'asc').map((f) => f.id)).toEqual(['a', 'c', 'b']);
  });
  test('sin vencimiento va al final en ascendente', () => {
    expect(ordenarSaldos(filas, 'vence', 'asc')[0].id).toBe('b');
  });
  test('pagina', () => {
    expect(paginarSaldos(['a', 'b', 'c', 'd', 'e'], 2, 2)).toEqual(['c', 'd']);
    expect(paginarSaldos(['a'], 3, 2)).toEqual([]);
  });
});

describe('kpisSaldos', () => {
  const filas = [
    fila({ id: 'a', disponible: 120, valor: 500, usado: 380 }),
    fila({ id: 'b', clienteId: CLIENTE_B, disponible: 1190, valor: 1190 }),
    fila({ id: 'c', estado: 'vencido', disponible: 95 }),
    fila({ id: 'd', estado: 'anulado', disponible: 0 }),
  ];
  const aplicaciones = [
    { creditoId: 'a', monto: 300, fecha: '2026-09-15T15:00:00Z', referencia: 'fv-1050' },
    { creditoId: 'a', monto: 80, fecha: '2026-09-22T15:00:00Z', referencia: 'fv-1057' },
    // Otro periodo (31 de agosto en Bogotá) y otra sucursal (saldo fuera de la lista): no cuentan.
    { creditoId: 'a', monto: 999, fecha: '2026-09-01T04:00:00Z', referencia: 'fv-1' },
    { creditoId: 'zz', monto: 999, fecha: '2026-09-10T15:00:00Z', referencia: 'fv-2' },
  ];
  const devoluciones = [{ creditoId: 'b', monto: -150, fecha: '2026-09-20T15:00:00Z', referencia: 'cash' }];

  test('disponible y vencido hoy; aplicado y devuelto en el periodo, solo de saldos de la lista', () => {
    const k = kpisSaldos(filas, aplicaciones, devoluciones, { desde: '2026-09-01', hasta: '2026-09-30' }, diaBogota);
    expect(k).toEqual({
      disponible: 1310,
      clientesConSaldo: 2,
      vencido: 95,
      saldosVencidos: 1,
      aplicado: 380,
      facturasAplicadas: 2,
      devuelto: 150,
      devoluciones: 1,
      devolucionesEfectivo: 1,
    });
  });
});

describe('accionesSaldo', () => {
  const todos = { crear: true, anular: true };
  test('anticipo sin usar: aplicar, devolver y anular', () => {
    expect(accionesSaldo(fila({ id: 'a' }), todos)).toEqual({ aplicar: true, devolver: true, anular: true, motivoNoAnulable: null });
  });
  test('anticipo ya usado: no se anula (se devuelve lo que queda)', () => {
    const a = accionesSaldo(fila({ id: 'a', anulable: false, usado: 380, disponible: 120 }), todos);
    expect(a).toMatchObject({ aplicar: true, devolver: true, anular: false, motivoNoAnulable: 'usado' });
  });
  test('saldo de una nota crédito: no se anula, se devuelve', () => {
    expect(accionesSaldo(fila({ id: 'b', origen: 'nota_credito', anulable: false }), todos).motivoNoAnulable).toBe('no_es_anticipo');
  });
  test('vencido: no se aplica, sí se devuelve; usado: nada', () => {
    expect(accionesSaldo(fila({ id: 'c', estado: 'vencido', anulable: false, origen: 'nota_credito' }), todos)).toMatchObject({ aplicar: false, devolver: true });
    expect(accionesSaldo(fila({ id: 'd', estado: 'usado', disponible: 0, anulable: false }), todos)).toMatchObject({ aplicar: false, devolver: false, anular: false });
  });
  test('los permisos del servidor mandan: sin crear no aplica; sin anular no devuelve ni anula', () => {
    expect(accionesSaldo(fila({ id: 'a' }), { crear: false, anular: true }).aplicar).toBe(false);
    expect(accionesSaldo(fila({ id: 'a' }), { crear: true, anular: false })).toEqual({ aplicar: true, devolver: false, anular: false, motivoNoAnulable: 'sin_permiso' });
  });
  test('anulado: nada que hacer', () => {
    expect(accionesSaldo(fila({ id: 'x', estado: 'anulado', disponible: 0, anulable: false }), todos)).toEqual({
      aplicar: false,
      devolver: false,
      anular: false,
      motivoNoAnulable: 'anulado',
    });
  });
});

describe('montos', () => {
  test('al elegir factura se propone lo que alcance', () => {
    expect(montoPropuesto(120, 300)).toBe(120);
    expect(montoPropuesto(1190, 300)).toBe(300);
  });
  test('validación en pantalla', () => {
    expect(validarMonto(null, 100)).toBe('vacio');
    expect(validarMonto(0, 100)).toBe('vacio');
    expect(validarMonto(101, 100)).toBe('excede_disponible');
    expect(validarMonto(90, 100, 80)).toBe('excede_factura');
    expect(validarMonto(80, 100, 80)).toBeNull();
  });
});

describe('ordenarMovimientos', () => {
  test('origen primero; luego aplicaciones y devoluciones por fecha; la anulación al final', () => {
    const m = (tipo: MovimientoSaldo['tipo'], id: string, fecha: string): MovimientoSaldo => ({ tipo, id, numero: null, documentoId: null, monto: 1, fecha });
    const r = ordenarMovimientos([
      m('anulacion', 'x', '2026-09-01T00:00:00Z'),
      m('devolucion', 'd', '2026-09-20T00:00:00Z'),
      m('aplicacion', 'a2', '2026-09-22T00:00:00Z'),
      m('origen', 'o', '2026-09-12T00:00:00Z'),
      m('aplicacion', 'a1', '2026-09-15T00:00:00Z'),
    ]);
    expect(r.map((x) => x.id)).toEqual(['o', 'a1', 'd', 'a2', 'x']);
  });
});

describe('métodos de los diálogos', () => {
  const contexto = {
    metodos: [
      { code: 'cash', name: 'Efectivo', requires_reference: false },
      { code: 'credit', name: 'Crédito', requires_reference: false },
      { code: 'transfer', name: 'Transferencia', requires_reference: true },
    ],
    cuentasBancarias: [],
    caja: { abierta: false, id: null },
    hoy: '2026-09-28',
    facturas: [],
  };
  test('sin «crédito»; efectivo deshabilitado con motivo si no hay caja; el inicial es el primero usable', () => {
    const o = opcionesMetodoSaldo(contexto, 'Sin caja');
    expect(o.map((x) => x.codigo)).toEqual(['cash', 'transfer']);
    expect(o[0]).toMatchObject({ deshabilitado: true, motivo: 'Sin caja' });
    expect(metodoInicial(o)).toBe('transfer');
    expect(metodoInicial(opcionesMetodoSaldo({ ...contexto, caja: { abierta: true, id: 3 } }, 'x'))).toBe('cash');
    expect(opcionesMetodoSaldo(null, 'x')).toEqual([]);
  });
  test('referencia obligatoria según el método de la organización', () => {
    expect(requiereReferencia(contexto, 'transfer')).toBe(true);
    expect(requiereReferencia(contexto, 'cash')).toBe(false);
    expect(requiereReferencia(null, 'transfer')).toBe(false);
  });
});
