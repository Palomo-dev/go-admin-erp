/**
 * Lógica de Logística (Figma «21 Logística» y «22 Logística»): bandeja Por despachar, Seguimiento
 * «Por resolver», detalle del envío e insignia de estado. Puro: sin Supabase ni React.
 */
import {
  accionesFilaDespacho,
  avisoBandeja,
  canalDeEnvio,
  estadoBandeja,
  filtrarDespacho,
  kpisDespacho,
  ordenSugeridoRuta,
  ordenarDespacho,
  resumenSeleccion,
  type FilaDespacho,
} from '../despacho';
import {
  accionSugerida,
  conteosSeguimiento,
  listaPorResolver,
  plazoDe,
  porResolver,
  tasaPrimerIntento,
  type FilaSeguimiento,
} from '../seguimiento';
import { AJUSTES_LOGISTICA_POR_DEFECTO } from '../ajustesLogistica';
import { accionesDetalle, documentoOculto, faltanteEntregaAdmin, lineaDeTiempo, pasoCobro } from '../detalleEnvio';
import { ESTADOS_CANONICOS } from '../estadosEnvio';
import { INSIGNIA_ESTADO, estadoParaInsignia } from '../estadoEnvioUi';

const ZONA = 'America/Bogota';
// 23 nov 2026, 12:00 m. en Bogotá.
const AHORA = new Date('2026-11-23T17:00:00Z');

function fila(p: Partial<FilaDespacho> = {}): FilaDespacho {
  return {
    id: p.id ?? 'e1',
    numero: 'DEL-WO-1',
    status: 'pending',
    modo: 'own',
    branchId: 1,
    canal: 'web',
    pedido: 'WO-1',
    pedidoWebId: 'w1',
    creado: '2026-11-23T15:00:00Z',
    cliente: 'Camila Torres',
    telefono: '301 778 50 63',
    direccion: 'Calle 53 #9-11',
    ciudad: 'Bogotá',
    barrio: 'Chapinero',
    instrucciones: null,
    promesa: '2026-11-23T18:00:00Z',
    fechaEsperada: '2026-11-23',
    valor: 45900,
    moneda: null,
    contraentrega: 0,
    codStatus: null,
    pagado: true,
    domiciliarioId: null,
    domiciliario: null,
    vehiculoId: null,
    asignado: null,
    intentosFallidos: 0,
    motivoNovedad: null,
    codigoRequerido: false,
    ...p,
  };
}

describe('Por despachar', () => {
  test('canal del envío según su origen', () => {
    expect(canalDeEnvio('web_order', 'website')).toBe('web');
    expect(canalDeEnvio('web_order', 'qr_menu')).toBe('qr');
    expect(canalDeEnvio('sale')).toBe('pos');
    expect(canalDeEnvio('manual')).toBe('manual');
  });

  test('estado de la bandeja', () => {
    expect(estadoBandeja(fila())).toBe('por_asignar');
    expect(estadoBandeja(fila({ status: 'assigned', domiciliarioId: 'd1' }))).toBe('asignado');
    expect(estadoBandeja(fila({ status: 'ready_for_pickup' }))).toBe('listo_para_salir');
    expect(estadoBandeja(fila({ status: 'failed_attempt' }))).toBe('intento_fallido');
    expect(estadoBandeja(fila({ modo: 'national_carrier' }))).toBe('por_crear_guia');
  });

  test('KPI: atrasados, para hoy y mañana, contraentrega de hoy y sin domiciliario', () => {
    const filas = [
      fila({ id: 'a', promesa: '2026-11-23T16:00:00Z', contraentrega: 128900, codStatus: 'pending' }), // atrasado 1 h
      fila({ id: 'b', promesa: '2026-11-23T20:00:00Z', domiciliarioId: 'd1', status: 'assigned' }),
      fila({ id: 'c', promesa: '2026-11-24T20:00:00Z', fechaEsperada: '2026-11-24' }), // mañana
      fila({ id: 'd', promesa: '2026-11-23T21:00:00Z', contraentrega: 96400.5, codStatus: 'pending' }),
    ];
    const k = kpisDespacho(filas, AHORA, ZONA);
    expect(k.porDespachar).toBe(4);
    expect(k.atrasados).toBe(1);
    expect(k.paraHoy).toBe(3);
    expect(k.paraManana).toBe(1);
    expect(k.contraentregaHoy).toBe(225300.5);
    expect(k.enviosContraentregaHoy).toBe(2);
    expect(k.sinDomiciliario).toBe(3);
    expect(k.sinDomiciliarioHoy).toBe(2);
  });

  test('la contraentrega ya cobrada no cuenta como por cobrar', () => {
    const k = kpisDespacho([fila({ contraentrega: 5000, codStatus: 'collected' })], AHORA, ZONA);
    expect(k.contraentregaHoy).toBe(0);
  });

  test('busca por teléfono, barrio y pedido sin tildes ni mayúsculas', () => {
    const filas = [fila({ id: 'a' }), fila({ id: 'b', barrio: 'Usaquén', telefono: '315 664 09 12', pedido: 'POS-V-1088' })];
    expect(filtrarDespacho(filas, { busqueda: 'usaquen' }, AHORA).map((f) => f.id)).toEqual(['b']);
    expect(filtrarDespacho(filas, { busqueda: '6640912' }, AHORA).map((f) => f.id)).toEqual(['b']);
    expect(filtrarDespacho(filas, { busqueda: 'pos-v' }, AHORA).map((f) => f.id)).toEqual(['b']);
    expect(filtrarDespacho(filas, { pago: 'contraentrega' }, AHORA)).toEqual([]);
    expect(filtrarDespacho(filas, { soloAtrasados: true }, AHORA)).toEqual([]);
  });

  test('ordena por promesa: lo que vence primero, arriba; sin promesa al final', () => {
    const filas = [fila({ id: 'tarde', promesa: '2026-11-23T22:00:00Z' }), fila({ id: 'sin', promesa: null }), fila({ id: 'pronto', promesa: '2026-11-23T17:10:00Z' })];
    expect(ordenarDespacho(filas).map((f) => f.id)).toEqual(['pronto', 'tarde', 'sin']);
  });

  test('ruta sugerida: por promesa y, a igual hora, por barrio', () => {
    const p = '2026-11-23T19:00:00Z';
    const filas = [fila({ id: 'z', barrio: 'Usaquén', promesa: p }), fila({ id: 'a', barrio: 'Chapinero', promesa: p })];
    expect(ordenSugeridoRuta(filas).map((f) => f.id)).toEqual(['a', 'z']);
  });

  test('acciones por fila: asignar sin exigir vehículo; pedir repartidor y crear guía con motivo', () => {
    const a = accionesFilaDespacho(fila());
    expect(a.asignar.disponible).toBe(true);
    expect(a.listoParaSalir.disponible).toBe(true);
    expect(a.cancelar.disponible).toBe(true);
    expect(a.pedirRepartidor).toEqual({ disponible: false, motivo: 'requiere_tercero' });
    expect(a.crearGuia).toEqual({ disponible: false, motivo: 'requiere_transportadora' });
    expect(accionesFilaDespacho(fila({ status: 'ready_for_pickup' })).listoParaSalir).toEqual({ disponible: false, motivo: 'ya_listo' });
    expect(accionesFilaDespacho(fila({ modo: 'national_carrier' })).asignar).toEqual({ disponible: false, motivo: 'no_es_propio' });
  });

  test('la hoja de asignar solo lleva los asignables y suma su contraentrega', () => {
    const r = resumenSeleccion([fila({ id: 'a', contraentrega: 1000 }), fila({ id: 'b', modo: 'national_carrier', contraentrega: 5 }), fila({ id: 'c' })]);
    expect(r.asignables.map((f) => f.id)).toEqual(['a', 'c']);
    expect(r.noAsignables.map((f) => f.id)).toEqual(['b']);
    expect(r.contraentrega).toBe(1000);
    expect(r.conContraentrega).toBe(1);
  });

  test('aviso «no hay domiciliarios» solo si hay envíos sin domiciliario y cero domiciliarios', () => {
    expect(avisoBandeja({ sinDomiciliario: 31 }, 0)).toBe('sin_domiciliarios');
    expect(avisoBandeja({ sinDomiciliario: 0 }, 0)).toBeNull();
    expect(avisoBandeja({ sinDomiciliario: 31 }, 2)).toBeNull();
    expect(avisoBandeja({ sinDomiciliario: 31 }, null)).toBeNull();
  });
});

function seg(p: Partial<FilaSeguimiento> = {}): FilaSeguimiento {
  return {
    id: p.id ?? 's1',
    numero: 'ENV-1',
    status: 'failed_attempt',
    modo: 'own',
    pedido: 'WO-1',
    pedidoWebId: 'w1',
    canal: 'web',
    cliente: 'Cliente',
    telefono: '3001234567',
    direccion: 'Cra 7 # 45-12',
    ciudad: 'Bogotá',
    barrio: null,
    transportadora: null,
    guia: null,
    sede: 'Sede Centro',
    domiciliario: 'Andrés',
    promesa: null,
    ultimoMovimiento: '2026-11-23T16:00:00Z',
    ultimoEvento: null,
    motivoNovedad: 'not_home',
    detalleNovedad: null,
    intentosFallidos: 1,
    reprogramado: null,
    ...p,
  };
}

describe('Seguimiento › Por resolver', () => {
  test('novedad abierta y sin movimiento según los ajustes; lo demás no está por resolver', () => {
    expect(porResolver(seg(), AHORA)?.tipo).toBe('novedad');
    expect(porResolver(seg({ status: 'in_transit', ultimoMovimiento: '2026-11-22T10:00:00Z' }), AHORA)).toEqual({ tipo: 'sin_movimiento', horas: 31 });
    // Por defecto: 2 h para domiciliario propio, 24 h para transportadora (horasSinMovimiento).
    expect(porResolver(seg({ status: 'in_transit', ultimoMovimiento: '2026-11-23T10:00:00Z' }), AHORA)).toEqual({ tipo: 'sin_movimiento', horas: 7 });
    expect(porResolver(seg({ status: 'in_transit', ultimoMovimiento: '2026-11-23T16:00:00Z' }), AHORA)).toBeNull();
    expect(porResolver(seg({ status: 'in_transit', transportadora: 'Coordinadora', ultimoMovimiento: '2026-11-23T10:00:00Z' }), AHORA)).toBeNull();
    expect(porResolver(seg({ status: 'delivered' }), AHORA)).toBeNull();
  });

  test('el umbral sale de Configuración › Logística, no de 24 h fijas', () => {
    const ajustes = { ...AJUSTES_LOGISTICA_POR_DEFECTO, horasSinMovimientoPropio: 8, horasSinMovimientoTransportadora: 6 };
    const propio = seg({ status: 'out_for_delivery', ultimoMovimiento: '2026-11-23T10:00:00Z' }); // 7 h
    const conTransportadora = seg({ status: 'in_transit', transportadora: 'Coordinadora', ultimoMovimiento: '2026-11-23T10:00:00Z' }); // 7 h
    expect(porResolver(propio, AHORA, ajustes)).toBeNull();
    expect(porResolver(conTransportadora, AHORA, ajustes)).toEqual({ tipo: 'sin_movimiento', horas: 7 });
    // Desde la hora exacta del umbral («desde N horas»).
    expect(porResolver(seg({ status: 'assigned', ultimoMovimiento: '2026-11-23T09:00:00Z' }), AHORA, ajustes)).toEqual({ tipo: 'sin_movimiento', horas: 8 });
    expect(conteosSeguimiento([propio, conTransportadora], AHORA, new Date('2026-11-24T05:00:00Z'), ajustes)).toMatchObject({
      sinMovimiento: 1,
      sinMovimientoTransportadora: 1,
    });
    expect(listaPorResolver([propio, conTransportadora], { chip: 'sin_movimiento' }, AHORA, ajustes).map((f) => f.transportadora)).toEqual(['Coordinadora']);
  });

  test('acción sugerida según el motivo', () => {
    expect(accionSugerida(seg(), AHORA)).toBe('reintentar');
    expect(accionSugerida(seg({ motivoNovedad: 'incomplete_address' }), AHORA)).toBe('cambiar_direccion');
    expect(accionSugerida(seg({ motivoNovedad: 'rejected' }), AHORA)).toBe('contactar_cliente');
    expect(accionSugerida(seg({ motivoNovedad: 'damaged', transportadora: 'Servientrega' }), AHORA)).toBe('abrir_reclamo');
    expect(accionSugerida(seg({ status: 'in_transit', transportadora: 'Coordinadora', ultimoMovimiento: '2026-11-21T10:00:00Z' }), AHORA)).toBe('consultar_proveedor');
    expect(accionSugerida(seg({ status: 'in_transit', ultimoMovimiento: '2026-11-21T10:00:00Z' }), AHORA)).toBe('ver_detalle');
  });

  test('plazo: la promesa futura manda; si no, 24 h tras el último movimiento', () => {
    expect(plazoDe(seg({ promesa: '2026-11-23T20:00:00Z' }), AHORA)).toBe('2026-11-23T20:00:00.000Z');
    expect(plazoDe(seg(), AHORA)).toBe('2026-11-24T16:00:00.000Z');
  });

  test('chips y orden por plazo', () => {
    const filas = [
      seg({ id: 'nov-tarde', ultimoMovimiento: '2026-11-23T16:30:00Z' }),
      seg({ id: 'quieto', status: 'out_for_delivery', ultimoMovimiento: '2026-11-21T08:00:00Z' }),
      seg({ id: 'nov-pronto', ultimoMovimiento: '2026-11-23T09:00:00Z' }),
      seg({ id: 'ok', status: 'assigned', ultimoMovimiento: '2026-11-23T16:00:00Z' }),
    ];
    expect(listaPorResolver(filas, { chip: 'todo' }, AHORA).map((f) => f.id)).toEqual(['quieto', 'nov-pronto', 'nov-tarde']);
    expect(listaPorResolver(filas, { chip: 'novedades' }, AHORA).map((f) => f.id)).toEqual(['nov-pronto', 'nov-tarde']);
    expect(listaPorResolver(filas, { chip: 'sin_movimiento' }, AHORA).map((f) => f.id)).toEqual(['quieto']);
    const c = conteosSeguimiento(filas, AHORA, new Date('2026-11-24T05:00:00Z'));
    expect(c).toMatchObject({ todo: 3, novedades: 2, sinMovimiento: 1 });
  });

  test('entregas al primer intento', () => {
    expect(tasaPrimerIntento([])).toBeNull();
    expect(tasaPrimerIntento([{ failed_attempts: 0 }, { failed_attempts: 1 }, { failed_attempts: null }, { failed_attempts: 0 }])).toBe(0.75);
  });
});

describe('Detalle del envío', () => {
  test('acciones según el estado (tabla 2799:7510, transiciones de la base)', () => {
    expect(accionesDetalle({ status: 'pending', modo: 'own', pedidoWebId: 'w' })).toMatchObject({ asignar: true, listoParaSalir: true, entregar: false, cancelar: true, avisar: false });
    expect(accionesDetalle({ status: 'out_for_delivery', modo: 'own', pedidoWebId: 'w' })).toMatchObject({ entregar: true, novedad: true, devolver: true, cancelar: false, avisar: true, asignar: false });
    expect(accionesDetalle({ status: 'failed_attempt', modo: 'own', pedidoWebId: null })).toMatchObject({ reintentar: true, enCamino: false, asignar: true, devolver: true, avisar: false });
    expect(accionesDetalle({ status: 'delivered', modo: 'own', pedidoWebId: 'w' })).toMatchObject({ entregar: false, devolver: false, cancelar: false, avisar: true });
  });

  test('línea de tiempo: eventos ocurridos, el actual marcado y los pasos por venir', () => {
    const pasos = lineaDeTiempo(
      [
        { id: '1', event_time: '2026-11-23T15:41:00Z', canonical_status: 'created', event_type: 'created', reason_code: null, description: null, provider_status: null },
        { id: '2', event_time: '2026-11-23T16:05:00Z', canonical_status: 'assigned', event_type: 'assigned', reason_code: null, description: null, provider_status: null },
        { id: '3', event_time: '2026-11-23T16:22:00Z', canonical_status: 'out_for_delivery', event_type: 'out_for_delivery', reason_code: null, description: null, provider_status: null },
        { id: '4', event_time: '2026-11-23T16:40:00Z', canonical_status: 'failed_attempt', event_type: 'failed_attempt', reason_code: 'not_home', description: null, provider_status: null },
        { id: '5', event_time: '2026-11-23T19:35:00Z', canonical_status: 'out_for_delivery', event_type: 'out_for_delivery', reason_code: null, description: null, provider_status: null },
      ],
      'out_for_delivery',
    );
    expect(pasos.map((p) => [p.canonico, p.estado])).toEqual([
      ['created', 'hecho'],
      ['assigned', 'hecho'],
      ['out_for_delivery', 'hecho'],
      ['failed_attempt', 'fallo'],
      ['out_for_delivery', 'actual'],
      ['delivered', 'pendiente'],
    ]);
    expect(pasos[4].intento).toBe(2);
    expect(pasos[3].motivo).toBe('not_home');
  });

  test('un envío entregado no tiene pasos por venir', () => {
    const pasos = lineaDeTiempo(
      [{ id: '1', event_time: '2026-11-23T15:41:00Z', canonical_status: 'delivered', event_type: 'delivered', reason_code: null, description: null, provider_status: null }],
      'delivered',
    );
    expect(pasos.every((p) => p.estado !== 'pendiente')).toBe(true);
  });

  test('recaudo, documento oculto y validación de «Marcar entregado»', () => {
    expect(pasoCobro('pending')).toBe('pendiente');
    expect(pasoCobro('collected')).toBe('cobrado');
    expect(pasoCobro('remitted')).toBe('girado');
    expect(documentoOculto('1.020.454 410'.replace(/\./g, ''))).toBe('4410');
    expect(documentoOculto('')).toBeNull();
    const base = { receptor: 'Camila', requiereCodigo: true, codigo: '4821', contraentrega: 45900, metodo: 'cash', monto: 45900 };
    expect(faltanteEntregaAdmin(base)).toBeNull();
    expect(faltanteEntregaAdmin({ ...base, receptor: ' ' })).toBe('receptor');
    expect(faltanteEntregaAdmin({ ...base, codigo: '12' })).toBe('codigo');
    expect(faltanteEntregaAdmin({ ...base, metodo: null })).toBe('metodo');
    expect(faltanteEntregaAdmin({ ...base, monto: 0 })).toBe('monto');
    expect(faltanteEntregaAdmin({ ...base, contraentrega: 0, metodo: null, monto: null, requiereCodigo: false })).toBeNull();
  });
});

describe('Insignia del estado (2802:10982)', () => {
  test('los 11 estados canónicos tienen tono; los internos se traducen', () => {
    for (const e of ESTADOS_CANONICOS) expect(INSIGNIA_ESTADO[e]).toBeDefined();
    expect(estadoParaInsignia('pending')).toBe('created');
    expect(estadoParaInsignia('dispatched')).toBe('in_transit');
    expect(estadoParaInsignia('exception')).toBe('exception');
    expect(estadoParaInsignia('raro')).toBe('created');
    expect(INSIGNIA_ESTADO.out_for_delivery.apariencia).toBe('solido');
  });
});
