/**
 * Cuadres › Domiciliarios: filas del listado, indicadores del día y el reparto de lo contado por
 * medio entre las líneas (efectivo a la caja, datáfono a 13802001, transferencia al banco: eso lo
 * hace la RPC; aquí solo qué monto y qué medio recibe cada línea).
 */
import {
  diferenciasContado,
  faltanteRecibir,
  filasCuadres,
  grupoDeMedio,
  kpisCuadres,
  metodoCajaDeReportado,
  repartirContado,
  resumenPorMedio,
  sumarPorGrupo,
  textoMotivo,
  type CuadreGuardado,
  type EnvioCobrado,
} from '../cuadresVista';

const BOG = 'America/Bogota';
const HOY = '2026-11-22';

describe('medios', () => {
  test('grupos de la tabla', () => {
    expect(grupoDeMedio('cash')).toBe('efectivo');
    expect(grupoDeMedio('card')).toBe('datafono');
    expect(grupoDeMedio('bold_card')).toBe('datafono');
    expect(grupoDeMedio('transfer')).toBe('transferencia');
    expect(grupoDeMedio('qr')).toBe('transferencia');
    expect(grupoDeMedio('breb_qr')).toBe('transferencia');
  });

  test('código de payment_methods con que entra cada línea (qr no existe: Bre-B)', () => {
    expect(metodoCajaDeReportado('cash')).toBe('cash');
    expect(metodoCajaDeReportado('card')).toBe('card');
    expect(metodoCajaDeReportado('transfer')).toBe('transfer');
    expect(metodoCajaDeReportado('qr')).toBe('breb_qr');
  });

  test('suma de expected_by_method por grupo', () => {
    expect(sumarPorGrupo({ cash: '212400', card: 64000, transfer: 20000, breb_qr: 16000.5 })).toEqual({ efectivo: 212400, datafono: 64000, transferencia: 36000.5 });
    expect(sumarPorGrupo(null)).toEqual({ efectivo: 0, datafono: 0, transferencia: 0 });
  });
});

describe('filas del listado', () => {
  const cobrados: EnvioCobrado[] = [
    { id: 's1', driver_id: 'd1', branch_id: 3, cod_amount: 128900, cod_collected_amount: 128900, cod_collected_method: 'cash', cod_collected_at: '2026-11-22T15:00:00Z' },
    { id: 's2', driver_id: 'd1', branch_id: 3, cod_amount: 104000, cod_collected_amount: 104000, cod_collected_method: 'card', cod_collected_at: '2026-11-22T14:00:00Z' },
    { id: 's3', driver_id: 'd1', branch_id: 4, cod_amount: 50000, cod_collected_amount: 50000, cod_collected_method: 'transfer', cod_collected_at: '2026-11-22T16:00:00Z' },
    { id: 's4', driver_id: 'd2', branch_id: 3, cod_amount: 30000, cod_collected_amount: 30000, cod_collected_method: 'cash', cod_collected_at: '2026-11-22T16:00:00Z' },
  ];
  const cuadres: CuadreGuardado[] = [
    {
      id: 'c1', branch_id: 3, driver_id: 'd3', status: 'closed', expected_total: 182000, received_total: 178000, difference: -4000,
      expected_by_method: { cash: 182000 }, received_by_method: { cash: 178000 }, difference_reason: 'Cambio de más',
      difference_responsible: 'courier', accounting_status: 'pending_accountant', opened_at: '2026-11-22T12:00:00Z', closed_at: '2026-11-22T13:00:00Z', lineas: 4,
    },
    {
      id: 'c2', branch_id: 3, driver_id: 'd2', status: 'open', expected_total: 30000, received_total: 0, difference: 0,
      expected_by_method: { cash: 30000 }, received_by_method: {}, opened_at: '2026-11-21T20:00:00Z', lineas: 1,
    },
  ];

  test('los cobros sin cuadre se agrupan por domiciliario y sede; los que ya están en un cuadre abierto no se repiten', () => {
    const filas = filasCuadres(cuadres, cobrados, new Set(['s4']));
    const pendientes = filas.filter((f) => f.estado === 'por_recibir');
    expect(pendientes).toHaveLength(2);
    const d1s3 = pendientes.find((f) => f.branchId === 3)!;
    expect(d1s3).toMatchObject({ driverId: 'd1', entregas: 2, esperado: 232900, porMedio: { efectivo: 128900, datafono: 104000, transferencia: 0 }, fecha: '2026-11-22T14:00:00Z' });
    expect(filas.find((f) => f.cuadreId === 'c1')).toMatchObject({ estado: 'con_diferencia', diferencia: -4000, pendienteContador: true, motivo: 'Cambio de más' });
    expect(filas.find((f) => f.cuadreId === 'c2')).toMatchObject({ estado: 'abierto', diferencia: 0 });
  });

  test('primero lo que espera dinero; después lo cerrado', () => {
    const filas = filasCuadres(cuadres, cobrados, new Set(['s4']));
    const estados = filas.map((f) => f.estado);
    expect(estados.indexOf('con_diferencia')).toBeGreaterThan(estados.lastIndexOf('por_recibir'));
    expect(estados.indexOf('con_diferencia')).toBeGreaterThan(estados.indexOf('abierto'));
  });

  test('indicadores del día', () => {
    const filas = filasCuadres(cuadres, cobrados, new Set(['s4']));
    const k = kpisCuadres(filas, cuadres, HOY, BOG);
    expect(k.porRecibir).toBe(232900 + 50000 + 30000);
    expect(k.domiciliariosPorRecibir).toBe(2);
    expect(k.cuadradosHoy).toBe(1);
    expect(k.recibidoHoy).toBe(178000);
    expect(k.conDiferenciaHoy).toBe(1);
    expect(k.faltanteHoy).toBe(-4000);
    // c2 se abrió el 21 a las 15:00 de Bogotá: es de un día anterior.
    expect(k.abiertosAnteriores).toBe(1);
  });
});

describe('recibir dinero: reparto de lo contado', () => {
  const lineas = [
    { id: 'l1', esperado: 128900, reportado: 128900, recibido: null, status: 'pending' as const, metodo_reportado: 'cash' },
    { id: 'l2', esperado: 60000, reportado: 60000, recibido: null, status: 'pending' as const, metodo_reportado: 'cash' },
    { id: 'l3', esperado: 104000, reportado: 104000, recibido: null, status: 'pending' as const, metodo_reportado: 'card' },
  ];

  test('resumen por medio', () => {
    const r = resumenPorMedio(lineas);
    expect(r.find((x) => x.grupo === 'efectivo')).toMatchObject({ envios: 2, esperado: 188900, reportado: 188900, yaRecibido: 0 });
    expect(r.find((x) => x.grupo === 'transferencia')).toMatchObject({ envios: 0, esperado: 0 });
  });

  test('cuadra: cada línea recibe lo esperado', () => {
    const r = repartirContado(lineas, { efectivo: 188900, datafono: 104000 });
    expect(r).toEqual({
      ok: true,
      recibos: [
        { lineaId: 'l1', monto: 128900, faltante: false },
        { lineaId: 'l2', monto: 60000, faltante: false },
        { lineaId: 'l3', monto: 104000, faltante: false },
      ],
    });
  });

  test('faltante: queda en la última línea del medio', () => {
    const r = repartirContado(lineas, { efectivo: 184900, datafono: 104000 });
    expect(r.ok && r.recibos.slice(0, 2)).toEqual([
      { lineaId: 'l1', monto: 128900, faltante: false },
      { lineaId: 'l2', monto: 56000, faltante: true },
    ]);
  });

  test('sobrante: la base no lo admite en una línea', () => {
    expect(repartirContado(lineas, { efectivo: 190900, datafono: 104000 })).toEqual({ ok: false, error: 'SOBRANTE', grupo: 'efectivo', sobrante: 2000 });
  });

  test('monto vacío en un medio con envíos', () => {
    expect(repartirContado(lineas, { efectivo: 188900 })).toEqual({ ok: false, error: 'MONTO_INVALIDO', grupo: 'datafono' });
  });

  test('reintento tras un fallo a mitad: lo ya recibido se descuenta', () => {
    const tras = [{ ...lineas[0], status: 'received' as const, recibido: 128900 }, lineas[1], lineas[2]];
    const r = repartirContado(tras, { efectivo: 188900, datafono: 104000 });
    expect(r.ok && r.recibos.map((x) => x.lineaId)).toEqual(['l2', 'l3']);
    expect(r.ok && r.recibos[0]).toEqual({ lineaId: 'l2', monto: 60000, faltante: false });
  });

  test('diferencias por medio y total', () => {
    const d = diferenciasContado(resumenPorMedio(lineas), { efectivo: 184900, datafono: 104000 });
    expect(d).toEqual({ porGrupo: { efectivo: -4000, datafono: 0, transferencia: 0 }, total: -4000 });
  });

  test('qué falta para recibir: caja abierta; con diferencia, motivo (nota si es «otro») y responsable', () => {
    const base = { diferencia: -4000, motivo: 'cambio_de_mas' as const, nota: '', responsable: 'courier' as const, cajaAbierta: true, lineas: 2 };
    expect(faltanteRecibir(base)).toBeNull();
    expect(faltanteRecibir({ ...base, cajaAbierta: false })).toBe('sin_caja');
    expect(faltanteRecibir({ ...base, lineas: 0 })).toBe('sin_lineas');
    expect(faltanteRecibir({ ...base, motivo: null })).toBe('motivo');
    expect(faltanteRecibir({ ...base, motivo: 'otro' })).toBe('nota');
    expect(faltanteRecibir({ ...base, responsable: null })).toBe('responsable');
    expect(faltanteRecibir({ ...base, diferencia: 0, motivo: null, responsable: null })).toBeNull();
  });

  test('texto del motivo', () => {
    expect(textoMotivo('Cambio entregado de más', ' dio 54.000 ')).toBe('Cambio entregado de más: dio 54.000');
    expect(textoMotivo('Error de conteo', '')).toBe('Error de conteo');
  });
});
