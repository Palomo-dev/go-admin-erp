/**
 * Fotos diarias de la operación y lo que cuelga de ellas (Figma `03` › Inicio, 2917:45049
 * «Atrasados 5 +2» y 2917:45560 «Ocupación 78 % +5 pp» con mini-gráfica; pantalla C del bloque
 * «Hoy», 2919:46236; aprobado el 2026-11-23):
 *  - la comparación es contra la foto del cierre de AYER y sin ella no hay delta;
 *  - las cifras abren su pantalla con el filtro en la URL;
 *  - las casillas de Logística y Transporte del bloque «Hoy» solo avisan;
 *  - el filtro de Cuadres usa la misma regla que su indicador;
 *  - el cron fotografía una vez al día por organización, en su última hora local.
 *
 * Organización ficticia 120; cifras inventadas.
 */
import { comparar, horaLocal, leerFotos, tocaFoto, valoresLogistica, valoresTransporte, type FotoDia } from '../fotosOperacion';
import { armarLogistica, type CrudoLogisticaInicio } from '../logisticaInicio';
import { armarTransporte, bloqueadosPorSalida, resumenViajesHoy, type CrudoTransporteInicio, type ViajeInicio } from '../transporteInicio';
import { casillasHoy, type DatosHoy } from '../bloqueHoy';
import { hrefConFiltro } from '../widgetsInicio';
import { filtrarCuadres, kpisCuadres, leerFiltroCuadres, type CuadreGuardado, type FilaCuadre } from '@/lib/logistica/cuadresVista';
import type { Cumplimiento } from '@/lib/transporte/despachos';

const todo = (p: string) => p;
const HOY = '2026-11-23';

describe('comparar', () => {
  const fotos: FotoDia[] = [
    { fecha: '2026-11-22', metrica: 'logistica.atrasados', valor: 3 },
    { fecha: '2026-11-20', metrica: 'logistica.atrasados', valor: 7 },
    { fecha: '2026-11-01', metrica: 'logistica.atrasados', valor: 99 },
    { fecha: '2026-11-22', metrica: 'transporte.ocupacion_pct', valor: 73 },
  ];

  test('delta contra la foto de ayer y serie de los últimos días más la cifra de ahora', () => {
    expect(comparar(fotos, 'logistica.atrasados', HOY, 5)).toEqual({ delta: 2, serie: [7, 3, 5] });
    expect(comparar(fotos, 'transporte.ocupacion_pct', HOY, 78)).toEqual({ delta: 5, serie: [73, 78] });
  });

  test('sin foto de ayer no hay delta (nunca se inventa); con una sola cifra no hay serie', () => {
    expect(comparar([{ fecha: '2026-11-20', metrica: 'logistica.atrasados', valor: 4 }], 'logistica.atrasados', HOY, 5)).toEqual({ delta: null, serie: [4, 5] });
    expect(comparar([], 'logistica.atrasados', HOY, 5)).toEqual({ delta: null, serie: [] });
    expect(comparar(null, 'logistica.atrasados', HOY, 5)).toEqual({ delta: null, serie: [] });
    expect(comparar(fotos, 'transporte.ocupacion_pct', HOY, null)).toEqual({ delta: null, serie: [] });
  });

  test('leerFotos descarta filas raras y acepta numeric como texto', () => {
    expect(
      leerFotos([
        { fecha: '2026-11-22', metrica: 'logistica.atrasados', valor: '3' },
        { fecha: '22/11/2026', metrica: 'logistica.atrasados', valor: 3 },
        { fecha: '2026-11-22', metrica: 'otra.cosa', valor: 3 },
        { fecha: '2026-11-22', metrica: 'transporte.viajes', valor: 'x' },
        null,
      ]),
    ).toEqual([{ fecha: '2026-11-22', metrica: 'logistica.atrasados', valor: 3 }]);
    expect(leerFotos(null)).toEqual([]);
  });

  test('la foto toca en la última hora del día de la organización', () => {
    // 04:50 UTC = 23:50 en Bogotá (UTC−5) y 05:50 en Madrid (UTC+1).
    const ahora = new Date('2026-11-24T04:50:00Z');
    expect(horaLocal(ahora, 'America/Bogota')).toBe(23);
    expect(tocaFoto(ahora, 'America/Bogota')).toBe(true);
    expect(tocaFoto(ahora, 'Europe/Madrid')).toBe(false);
  });

  test('qué se guarda de cada módulo', () => {
    expect(valoresLogistica({ atrasados: 5, porDespachar: 38, sinDomiciliario: 21 })).toEqual([
      ['logistica.atrasados', 5],
      ['logistica.por_despachar', 38],
      ['logistica.sin_domiciliario', 21],
    ]);
    // Sin viajes salidos no hay ocupación que guardar.
    expect(valoresTransporte({ total: 3, pctOcupacion: null, bloqueados: 1 }).map(([m]) => m)).toEqual(['transporte.viajes', 'transporte.bloqueados']);
  });

  test('hrefConFiltro', () => {
    expect(hrefConFiltro('/app/logistica/por-despachar', { atrasados: '1' })).toBe('/app/logistica/por-despachar?atrasados=1');
    expect(hrefConFiltro('/x?a=1', { b: '2' })).toBe('/x?a=1&b=2');
    expect(hrefConFiltro(null, { b: '2' })).toBeNull();
  });
});

// ─── Logística ──────────────────────────────────────────────────────────────

const LOGISTICA: CrudoLogisticaInicio = {
  hayEnvios: true,
  despacho: { porDespachar: 38, paraHoy: 31, paraManana: 7, atrasados: 5, contraentregaHoy: 1126400, enviosContraentregaHoy: 14, sinDomiciliario: 21, sinDomiciliarioHoy: 21, saleHoy: 31 },
  masAtrasado: { numero: 'WO-000412', minutos: 18 },
  seguimiento: { todo: 12, novedades: 4, sinMovimiento: 8, vencenHoy: 2, sinMovimientoTransportadora: 3 },
  cuadres: { porRecibir: 718100, domiciliariosPorRecibir: 2, cuadradosHoy: 3, recibidoHoy: 0, conDiferenciaHoy: 1, faltanteHoy: -4000, abiertosAnteriores: 0 },
  abiertos: { porDespachar: 38, enCamino: 42, conNovedad: 4 },
  primerIntento: 0.914,
  metaPrimerIntento: 0.9,
};

describe('Logística: comparación y enlaces filtrados', () => {
  test('«Atrasados 5 +2 vs. cierre de ayer»: subir es malo', () => {
    const l = armarLogistica({ crudo: { ...LOGISTICA, hoy: HOY, fotos: [{ fecha: '2026-11-22', metrica: 'logistica.atrasados', valor: 3 }] }, moneda: 'COP', href: todo });
    expect(l.kpis.find((k) => k.id === 'atrasados')).toMatchObject({
      delta: 2,
      unidadDelta: 'absoluto',
      deltaMejor: 'baja',
      comparadoCon: { clave: 'comun.vsCierreAyer' },
      href: '/app/logistica/por-despachar?atrasados=1',
    });
  });

  test('sin foto de ayer, sin delta', () => {
    const l = armarLogistica({ crudo: { ...LOGISTICA, hoy: HOY, fotos: [] }, moneda: 'COP', href: todo });
    const k = l.kpis.find((x) => x.id === 'atrasados');
    expect(k?.delta).toBeUndefined();
    expect(k?.comparadoCon).toBeUndefined();
  });

  test('cada cifra y cada renglón abre su pantalla con el filtro que esa pantalla lee', () => {
    const l = armarLogistica({ crudo: LOGISTICA, moneda: 'COP', href: todo });
    const kpi = (id: string) => l.kpis.find((k) => k.id === id)?.href;
    const fila = (id: string) => l.atencion.find((a) => a.id === id)?.href;
    expect(kpi('porDespachar')).toBe('/app/logistica/por-despachar');
    expect(kpi('sinDomiciliario')).toBe('/app/logistica/por-despachar?estado=por_asignar');
    expect(kpi('contraentrega')).toBe('/app/logistica/por-despachar?pago=contraentrega');
    expect(fila('novedades')).toBe('/app/logistica/seguimiento?chip=novedades');
    expect(fila('sinMovimiento')).toBe('/app/logistica/seguimiento?chip=sin_movimiento');
    expect(fila('conDiferencia')).toBe('/app/logistica/cuadres?filtro=con_diferencia_hoy');
    expect(fila('porRecibir')).toBe('/app/logistica/cuadres?filtro=por_recibir');
  });
});

// ─── Transporte ─────────────────────────────────────────────────────────────

const viaje = (id: string, status: string, extra: Partial<ViajeInicio> = {}): ViajeInicio => ({
  id,
  codigo: `V-${id}`,
  salida: `2026-11-23T1${id}:30:00Z`,
  status,
  despachadoEn: ['in_transit', 'completed'].includes(status) ? '2026-11-23T10:00:00Z' : null,
  conExcepcion: false,
  ruta: 'Ruta A',
  placa: 'WNP104',
  puestos: 40,
  disponibles: 10,
  retraso: 0,
  ...extra,
});
const bloqueo = (tripId: string): Cumplimiento => ({
  tripId,
  bloqueos: [{ causa: 'soat', grupo: 'vehiculo', vence: '2026-11-20', excepcion: false }],
  avisos: [],
  admiteExcepcion: false,
  pidePin: true,
});

const TRANSPORTE: CrudoTransporteInicio = {
  hayViajes: true,
  hayVehiculos: true,
  viajes: [viaje('1', 'completed'), viaje('2', 'in_transit', { retraso: 10 }), viaje('5', 'scheduled'), viaje('4', 'scheduled'), viaje('3', 'cancelled')],
  cumplimiento: new Map([
    ['4', bloqueo('4')],
    ['5', bloqueo('5')],
  ]),
  vehiculos: { total: 15, disponibles: 9, enUso: 4, mantenimiento: 0, placasMantenimiento: [] },
  documentos: { vencidos: 2, porVencer: 5, vigentes: 20, total: 27, sinFecha: 0, primero: '2026-11-30', vencidosEjemplo: [{ nombre: 'WNP104', tipo: 'soat' }] },
};

describe('Transporte: resumen compartido, comparación y enlaces filtrados', () => {
  test('resumenViajesHoy: grupos, ocupación de los salidos y bloqueados por hora de salida', () => {
    const r = resumenViajesHoy(TRANSPORTE.viajes!, TRANSPORTE.cumplimiento);
    expect(r).toMatchObject({ completados: 1, enRuta: 1, porSalir: 0, bloqueados: 2, total: 4, retrasados: 1, salidos: 2, pctOcupacion: 75 });
    expect(bloqueadosPorSalida(r).map((f) => f.v.codigo)).toEqual(['V-4', 'V-5']);
  });

  test('«Ocupación 75 % +5 pp vs. cierre de ayer» con mini-gráfica', () => {
    const fotos: FotoDia[] = [
      { fecha: '2026-11-21', metrica: 'transporte.ocupacion_pct', valor: 66 },
      { fecha: '2026-11-22', metrica: 'transporte.ocupacion_pct', valor: 70 },
    ];
    const tr = armarTransporte({ crudo: { ...TRANSPORTE, hoy: HOY, fotos }, href: todo });
    expect(tr.kpis.find((k) => k.id === 'ocupacion')).toMatchObject({ delta: 5, unidadDelta: 'puntos', comparadoCon: { clave: 'comun.vsCierreAyer' }, serie: [66, 70, 75] });
  });

  test('sin fotos: ni delta ni mini-gráfica', () => {
    const tr = armarTransporte({ crudo: { ...TRANSPORTE, hoy: HOY, fotos: null }, href: todo });
    const k = tr.kpis.find((x) => x.id === 'ocupacion');
    expect(k?.delta).toBeUndefined();
    expect(k?.serie).toBeUndefined();
  });

  test('enlaces: bloqueados a Despachos de hoy filtrado, documentos a Flota por estado', () => {
    const tr = armarTransporte({ crudo: TRANSPORTE, href: todo });
    expect(tr.atencion.find((a) => a.id === 'bloqueado-4')?.href).toBe('/app/transporte/viajes?pestana=despachos&estado=bloqueado');
    expect(tr.atencion.find((a) => a.id === 'documentosVencidos')?.href).toBe('/app/transporte/flota?estado=vencido');
    expect(tr.atencion.find((a) => a.id === 'retrasados')?.href).toBe('/app/transporte/viajes?pestana=despachos');
    expect(tr.kpis.find((k) => k.id === 'documentos')?.href).toBe('/app/transporte/flota?estado=por_vencer');
  });

  test('sin Viajes en el menú no hay renglones de despachos', () => {
    const tr = armarTransporte({ crudo: TRANSPORTE, href: (p) => (p.endsWith('/viajes') ? null : p) });
    expect(tr.atencion.some((a) => a.id.startsWith('bloqueado'))).toBe(false);
  });
});

// ─── Bloque «Hoy» ───────────────────────────────────────────────────────────

const BASE_HOY: DatosHoy = {
  porCobrar: null,
  stock: null,
  pedidosWeb: null,
  cajasAnteriores: null,
  tareas: { abiertas: 4, vencenHoy: 1, vencidas: 0 },
  unaSucursal: false,
};

describe('bloque «Hoy»: casillas de Logística y Transporte', () => {
  test('Documentos, Despachos y Envíos con su acción filtrada (pantalla C)', () => {
    const c = casillasHoy({
      ...BASE_HOY,
      transporte: { bloqueados: 3, codigos: ['V-1123', 'M-0459', 'V-2000'], documentosVencidos: 2, ejemplo: { nombre: 'WNP104', causa: 'soat' } },
      logistica: { atrasados: 5, masAtrasado: { numero: 'WO-000412', minutos: 18 } },
    });
    expect(c.map((x) => x.id)).toEqual(['documentosVencidos', 'despachosBloqueados', 'enviosAtrasados', 'misTareas']);
    const [doc, des, env] = c;
    expect(doc).toMatchObject({ tono: 'peligro', estado: 'vencido', accion: { href: '/app/transporte/flota?estado=vencido' } });
    expect(doc.detalle).toEqual({ clave: 'detalles.documentoEjemplo', params: { causa: 'soat', nombre: 'WNP104', mas: 1 } });
    expect(des).toMatchObject({ estado: 'critico', accion: { href: '/app/transporte/viajes?pestana=despachos&estado=bloqueado' } });
    expect(des.detalle.params).toEqual({ codigos: 'V-1123 · M-0459', n: 3, mas: 1 });
    expect(env).toMatchObject({ estado: 'urgente', accion: { href: '/app/logistica/por-despachar?atrasados=1' } });
  });

  test('son avisos: sin nada vencido, bloqueado ni atrasado no se pintan; sin permiso (null) tampoco', () => {
    const vacio = casillasHoy({ ...BASE_HOY, transporte: { bloqueados: 0, codigos: [], documentosVencidos: 0, ejemplo: null }, logistica: { atrasados: 0, masAtrasado: null } });
    expect(vacio.map((x) => x.id)).toEqual(['misTareas']);
    expect(casillasHoy({ ...BASE_HOY, transporte: null, logistica: null }).map((x) => x.id)).toEqual(['misTareas']);
  });
});

// ─── Cuadres ────────────────────────────────────────────────────────────────

describe('Cuadres: filtro de la URL con la regla del indicador', () => {
  const cuadres: CuadreGuardado[] = [
    { id: 'a', branch_id: 1, driver_id: 'd1', status: 'closed', expected_total: 10000, received_total: 6000, difference: -4000, expected_by_method: null, received_by_method: null, opened_at: '2026-11-23T13:00:00Z', closed_at: '2026-11-23T20:00:00Z' },
    { id: 'b', branch_id: 1, driver_id: 'd2', status: 'closed', expected_total: 5000, received_total: 4000, difference: -1000, expected_by_method: null, received_by_method: null, opened_at: '2026-11-20T13:00:00Z', closed_at: '2026-11-20T20:00:00Z' },
    { id: 'c', branch_id: 1, driver_id: 'd3', status: 'open', expected_total: 7000, received_total: 0, difference: 0, expected_by_method: null, received_by_method: null, opened_at: '2026-11-23T13:00:00Z' },
  ];
  const fila = (cuadreId: string | null, estado: FilaCuadre['estado']): FilaCuadre => ({
    clave: cuadreId ? `cuadre:${cuadreId}` : 'pendiente:d4:1',
    cuadreId,
    driverId: 'd',
    branchId: 1,
    fecha: '2026-11-23T13:00:00Z',
    estado,
    entregas: 1,
    esperado: 1000,
    porMedio: { efectivo: 0, datafono: 0, transferencia: 0 },
    diferencia: 0,
    motivo: null,
    responsable: null,
    pendienteContador: false,
  });
  const filas = [fila('a', 'con_diferencia'), fila('b', 'con_diferencia'), fila('c', 'abierto'), fila(null, 'por_recibir')];

  test('«con diferencia hoy» son las mismas que cuenta el indicador', () => {
    const r = filtrarCuadres(filas, cuadres, 'con_diferencia_hoy', HOY, 'America/Bogota');
    expect(r.map((f) => f.cuadreId)).toEqual(['a']);
    expect(kpisCuadres(filas, cuadres, HOY, 'America/Bogota').conDiferenciaHoy).toBe(r.length);
  });

  test('«por recibir» = abiertos + cobrado sin cuadre; un valor desconocido no filtra', () => {
    expect(filtrarCuadres(filas, cuadres, 'por_recibir', HOY, 'America/Bogota').map((f) => f.estado)).toEqual(['abierto', 'por_recibir']);
    expect(leerFiltroCuadres('lo_que_sea')).toBeNull();
    expect(filtrarCuadres(filas, cuadres, leerFiltroCuadres('lo_que_sea'), HOY, 'America/Bogota')).toHaveLength(4);
  });
});
