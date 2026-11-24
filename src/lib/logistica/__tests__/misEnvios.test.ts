/**
 * «Mis envíos»: pestañas, resumen de la ruta, siguiente paso, promesa, enlaces, cambio, novedad y
 * fin de jornada. Las fechas se prueban con dos zonas: el día de un envío es el de su sede.
 */
import {
  agruparMisEnvios,
  cambioADevolver,
  claveDePlan,
  enlaceComoLlegar,
  enlaceLlamar,
  enlaceWaze,
  enlaceWhatsApp,
  estadoDelPaso,
  estadoPedidoDelAviso,
  estadoPromesa,
  faltanteEntrega,
  faltanteNovedad,
  fechaReprogramada,
  horasReintentoHoy,
  lugarDeEntrega,
  montosRapidos,
  notaEntrega,
  opcionesReintento,
  ordenarParadas,
  pestanaDeEnvio,
  planSugerido,
  porCobrar,
  puedeReportarNovedad,
  resumenJornada,
  resumenRuta,
  rutaFotoEnvio,
  siguientePaso,
  type EnvioDomiciliario,
  type FormularioEntrega,
} from '../misEnvios';

const BOG = 'America/Bogota';
const HOY = '2026-11-22';

const envio = (p: Partial<EnvioDomiciliario>): EnvioDomiciliario => ({
  id: p.id ?? Math.random().toString(36).slice(2),
  shipment_number: p.shipment_number ?? 'WO-1',
  status: p.status ?? 'assigned',
  ...p,
});

describe('pestañas de Mis envíos', () => {
  test('en ruta → pendientes; entregado hoy → entregados; reprogramado a otro día → novedades', () => {
    expect(pestanaDeEnvio(envio({ status: 'out_for_delivery' }), HOY, BOG)).toBe('pendientes');
    expect(pestanaDeEnvio(envio({ status: 'delivered', delivered_at: '2026-11-22T15:00:00Z' }), HOY, BOG)).toBe('entregados');
    expect(pestanaDeEnvio(envio({ status: 'failed_attempt', expected_delivery_date: '2026-11-23' }), HOY, BOG)).toBe('novedades');
  });

  test('el 2.º intento reprogramado para hoy vuelve a pendientes', () => {
    expect(pestanaDeEnvio(envio({ status: 'failed_attempt', expected_delivery_date: HOY }), HOY, BOG)).toBe('pendientes');
    expect(pestanaDeEnvio(envio({ status: 'failed_attempt', expected_delivery_date: null }), HOY, BOG)).toBe('pendientes');
  });

  test('entregado a las 20:00 de Bogotá (01:00 UTC del día siguiente) cuenta como de hoy', () => {
    const e = envio({ status: 'delivered', delivered_at: '2026-11-23T01:00:00Z' });
    expect(pestanaDeEnvio(e, HOY, BOG)).toBe('entregados');
    // En Madrid ese instante ya es el 23: no es de «hoy» (22).
    expect(pestanaDeEnvio(e, HOY, 'Europe/Madrid')).toBeNull();
  });

  test('entregado otro día y cancelado no se muestran', () => {
    expect(pestanaDeEnvio(envio({ status: 'delivered', delivered_at: '2026-11-20T15:00:00Z' }), HOY, BOG)).toBeNull();
    expect(pestanaDeEnvio(envio({ status: 'cancelled' }), HOY, BOG)).toBeNull();
  });

  test('ordenar: primero lo que va en camino, luego con paquete, luego por promesa', () => {
    const a = envio({ id: 'a', status: 'assigned', promesa: '2026-11-22T17:00:00Z' });
    const b = envio({ id: 'b', status: 'out_for_delivery', promesa: '2026-11-22T20:00:00Z' });
    const c = envio({ id: 'c', status: 'picked', promesa: '2026-11-22T18:00:00Z' });
    const d = envio({ id: 'd', status: 'assigned', promesa: '2026-11-22T16:00:00Z' });
    expect(ordenarParadas([a, b, c, d]).map((e) => e.id)).toEqual(['b', 'c', 'd', 'a']);
  });
});

describe('resumen de la ruta', () => {
  test('cuenta paradas, a cobrar (contraentrega pendiente) y efectivo en mano', () => {
    const envios = [
      envio({ status: 'out_for_delivery', cod_amount: 128900, cod_status: 'pending' }),
      envio({ status: 'picked', cod_amount: 0 }),
      envio({ status: 'delivered', delivered_at: '2026-11-22T14:00:00Z', cod_amount: 50000, cod_status: 'collected', cod_collected_amount: 50000, cod_collected_method: 'cash' }),
      envio({ status: 'delivered', delivered_at: '2026-11-22T15:00:00Z', cod_amount: 46400.5, cod_status: 'collected', cod_collected_amount: 46400.5, cod_collected_method: 'cash' }),
      envio({ status: 'delivered', delivered_at: '2026-11-22T16:00:00Z', cod_amount: 64000, cod_status: 'collected', cod_collected_amount: 64000, cod_collected_method: 'card' }),
    ];
    const g = agruparMisEnvios(envios, HOY, () => BOG);
    const r = resumenRuta(g, envios);
    expect(r).toMatchObject({ estado: 'en_ruta', porEntregar: 2, entregados: 3, parada: 4, totalParadas: 5, aCobrar: 128900, enMano: 96400.5 });
  });

  test('sin salir, terminada y vacía', () => {
    const sinSalir = [envio({ status: 'assigned' })];
    expect(resumenRuta(agruparMisEnvios(sinSalir, HOY, () => BOG), sinSalir).estado).toBe('sin_salir');
    const terminada = [envio({ status: 'delivered', delivered_at: '2026-11-22T15:00:00Z' })];
    expect(resumenRuta(agruparMisEnvios(terminada, HOY, () => BOG), terminada).estado).toBe('terminada');
    expect(resumenRuta(agruparMisEnvios([], HOY, () => BOG), []).estado).toBe('vacia');
  });

  test('porCobrar: solo contraentrega pendiente', () => {
    expect(porCobrar(envio({ cod_amount: 1000, cod_status: 'pending' }))).toBe(1000);
    expect(porCobrar(envio({ cod_amount: 1000, cod_status: null }))).toBe(1000);
    expect(porCobrar(envio({ cod_amount: 1000, cod_status: 'collected' }))).toBe(0);
    expect(porCobrar(envio({ cod_amount: 0 }))).toBe(0);
  });
});

describe('siguiente paso del domiciliario', () => {
  test('recoger → en camino → entregar; el intento fallido se reintenta', () => {
    expect(siguientePaso('assigned')).toBe('recoger');
    expect(siguientePaso('ready_for_pickup')).toBe('recoger');
    expect(siguientePaso('picked')).toBe('en_camino');
    expect(siguientePaso('in_transit')).toBe('en_camino');
    expect(siguientePaso('out_for_delivery')).toBe('entregar');
    expect(siguientePaso('failed_attempt')).toBe('reintentar');
    expect(siguientePaso('delivered')).toBeNull();
    expect(siguientePaso('pending')).toBeNull();
  });

  test('cada paso simple lleva al estado que la base acepta', () => {
    expect(estadoDelPaso('recoger')).toBe('picked');
    expect(estadoDelPaso('en_camino')).toBe('out_for_delivery');
    expect(estadoDelPaso('reintentar')).toBe('out_for_delivery');
    expect(estadoDelPaso('entregar')).toBeNull();
  });

  test('«No se pudo entregar» solo cuando ya lleva el paquete', () => {
    expect(puedeReportarNovedad('assigned')).toBe(false);
    expect(puedeReportarNovedad('out_for_delivery')).toBe(true);
    expect(puedeReportarNovedad('failed_attempt')).toBe(true);
    expect(puedeReportarNovedad('delivered')).toBe(false);
  });

  test('el aviso de la RPC se traduce al estado del pedido web', () => {
    expect(estadoPedidoDelAviso('listo')).toBe('ready');
    expect(estadoPedidoDelAviso('en_camino')).toBe('in_delivery');
    expect(estadoPedidoDelAviso('entregado')).toBe('delivered');
    expect(estadoPedidoDelAviso('novedad')).toBeNull();
    expect(estadoPedidoDelAviso(null)).toBeNull();
  });
});

describe('promesa de hora', () => {
  const ahora = new Date('2026-11-22T18:00:00Z');
  test('tarde, pronto (≤ 15 min) y a tiempo', () => {
    expect(estadoPromesa('2026-11-22T17:42:00Z', ahora)).toEqual({ tipo: 'tarde', minutos: 18 });
    expect(estadoPromesa('2026-11-22T18:12:00Z', ahora)).toEqual({ tipo: 'pronto', minutos: 12 });
    expect(estadoPromesa('2026-11-22T18:42:00Z', ahora)).toEqual({ tipo: 'a_tiempo', minutos: 42 });
    expect(estadoPromesa(null, ahora)).toBeNull();
    expect(estadoPromesa('no-es-fecha', ahora)).toBeNull();
  });
});

describe('enlaces de contacto', () => {
  test('tel: con dígitos y el + inicial', () => {
    expect(enlaceLlamar('315 220 41 87')).toBe('tel:3152204187');
    expect(enlaceLlamar('+57 315-220-4187')).toBe('tel:+573152204187');
    expect(enlaceLlamar('123')).toBeNull();
    expect(enlaceLlamar(null)).toBeNull();
  });

  test('wa.me con el número internacional y el texto codificado', () => {
    expect(enlaceWhatsApp('573152204187')).toBe('https://wa.me/573152204187');
    expect(enlaceWhatsApp('573152204187', 'Hola, pedido WO-1')).toBe('https://wa.me/573152204187?text=Hola%2C%20pedido%20WO-1');
    expect(enlaceWhatsApp(null)).toBeNull();
  });

  test('Cómo llegar: coordenadas primero; si no, la dirección escrita', () => {
    expect(enlaceComoLlegar({ delivery_latitude: 4.65, delivery_longitude: -74.05 })).toBe('https://www.google.com/maps/dir/?api=1&destination=4.65,-74.05');
    expect(enlaceComoLlegar({ delivery_latitude: '4.65', delivery_longitude: '-74.05' })).toContain('destination=4.65,-74.05');
    expect(enlaceComoLlegar({ delivery_latitude: 0, delivery_longitude: 0, delivery_address: 'Cra 45 #12-30', delivery_city: 'Bogotá' })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Cra%2045%20%2312-30%2C%20Bogot%C3%A1',
    );
    expect(enlaceComoLlegar({})).toBeNull();
  });

  test('Waze solo con coordenadas válidas', () => {
    expect(enlaceWaze({ delivery_latitude: 4.65, delivery_longitude: -74.05 })).toBe('https://waze.com/ul?ll=4.65,-74.05&navigate=yes');
    expect(enlaceWaze({ delivery_latitude: 200, delivery_longitude: -74 })).toBeNull();
    expect(enlaceWaze({})).toBeNull();
  });
});

describe('entregar: efectivo, cambio y lo que falta', () => {
  test('cambio a devolver en centavos; null si no alcanza', () => {
    expect(cambioADevolver(128900, 150000)).toBe(21100);
    expect(cambioADevolver(0.3, 0.5)).toBe(0.2);
    expect(cambioADevolver(128900, 128900)).toBe(0);
    expect(cambioADevolver(128900, 100000)).toBeNull();
    expect(cambioADevolver(128900, NaN)).toBeNull();
  });

  test('billetes rápidos como en el diseño (128.900 → 130.000, 150.000, 200.000)', () => {
    expect(montosRapidos(128900)).toEqual([130000, 150000, 200000]);
    expect(montosRapidos(150000)).toEqual([160000, 200000]);
    expect(montosRapidos(12500)).toEqual([13000, 15000, 20000]);
    expect(montosRapidos(0)).toEqual([]);
  });

  const base: FormularioEntrega = {
    codigoRequerido: true,
    codigo: '4821',
    prueba: 'codigo',
    fotos: 0,
    firma: false,
    receptor: 'Ana Gómez',
    totalCobrar: 128900,
    medio: 'cash',
    recibidoEfectivo: 150000,
    aprobacion: '',
    comprobante: false,
  };

  test('contraentrega: el código es obligatorio aunque se elija foto', () => {
    expect(faltanteEntrega(base)).toBeNull();
    expect(faltanteEntrega({ ...base, codigo: '48' })).toBe('codigo');
    expect(faltanteEntrega({ ...base, prueba: 'foto', fotos: 1, codigo: '' })).toBe('codigo');
  });

  test('sin contraentrega: foto o firma', () => {
    const sinCodigo = { ...base, codigoRequerido: false, codigo: '', totalCobrar: 0 };
    expect(faltanteEntrega({ ...sinCodigo, prueba: 'foto' })).toBe('foto_o_firma');
    expect(faltanteEntrega({ ...sinCodigo, prueba: 'foto', fotos: 1 })).toBeNull();
    expect(faltanteEntrega({ ...sinCodigo, prueba: 'firma' })).toBe('foto_o_firma');
    expect(faltanteEntrega({ ...sinCodigo, prueba: 'firma', firma: true })).toBeNull();
  });

  test('cobro: efectivo suficiente, aprobación del datáfono y comprobante de la transferencia', () => {
    expect(faltanteEntrega({ ...base, receptor: '  ' })).toBe('receptor');
    expect(faltanteEntrega({ ...base, medio: null })).toBe('medio');
    expect(faltanteEntrega({ ...base, recibidoEfectivo: 100000 })).toBe('efectivo_insuficiente');
    expect(faltanteEntrega({ ...base, medio: 'card' })).toBe('aprobacion');
    expect(faltanteEntrega({ ...base, medio: 'card', aprobacion: '0045' })).toBeNull();
    expect(faltanteEntrega({ ...base, medio: 'transfer' })).toBe('comprobante');
    expect(faltanteEntrega({ ...base, medio: 'transfer', comprobante: true })).toBeNull();
  });

  test('nota de la prueba con el efectivo y el cambio, o la aprobación', () => {
    const etiquetas = { efectivo: 'Efectivo', cambio: 'Cambio', aprobacion: 'Aprobación' };
    expect(notaEntrega({ medio: 'cash', recibidoEfectivo: 150000, cambio: 21100, aprobacion: '', etiquetas })).toBe('Efectivo: 150000 · Cambio: 21100');
    expect(notaEntrega({ medio: 'card', recibidoEfectivo: null, cambio: null, aprobacion: ' 0045 ', etiquetas })).toBe('Aprobación: 0045');
    expect(notaEntrega({ medio: 'transfer', recibidoEfectivo: null, cambio: null, aprobacion: '', etiquetas })).toBeNull();
  });

  test('quién recibió: valores del CHECK de la base y portería → lobby', () => {
    expect(lugarDeEntrega('doorman')).toBe('lobby');
    expect(lugarDeEntrega('customer')).toBe('door');
  });
});

describe('no se pudo entregar', () => {
  test('horas de hoy en la zona de la sede: siguiente hora + 1 y + 3, sin pasar de las 20', () => {
    // 18:20 UTC = 13:20 en Bogotá → 15:00 y 17:00.
    expect(horasReintentoHoy(new Date('2026-11-22T18:20:00Z'), BOG)).toEqual([15, 17]);
    // 23:10 UTC = 18:10 en Bogotá → 20:00 (las 22 ya no).
    expect(horasReintentoHoy(new Date('2026-11-22T23:10:00Z'), BOG)).toEqual([20]);
    // 02:00 UTC = 21:00 en Bogotá → ninguna.
    expect(horasReintentoHoy(new Date('2026-11-23T02:00:00Z'), BOG)).toEqual([]);
  });

  test('opciones y plan sugerido: rechazado → devolver', () => {
    const op = opcionesReintento(new Date('2026-11-22T18:20:00Z'), BOG);
    expect(op.map(claveDePlan)).toEqual(['hoy-15', 'hoy-17', 'manana', 'devolver']);
    expect(planSugerido('not_home', op)).toEqual({ tipo: 'hoy', hora: 15 });
    expect(planSugerido('rejected', op)).toEqual({ tipo: 'devolver' });
    expect(planSugerido('not_home', [])).toEqual({ tipo: 'manana' });
  });

  test('fecha a reprogramar: hoy o mañana (día calendario); devolver no reprograma', () => {
    expect(fechaReprogramada({ tipo: 'hoy', hora: 15 }, HOY)).toBe(HOY);
    expect(fechaReprogramada({ tipo: 'manana' }, '2026-12-31')).toBe('2027-01-01');
    expect(fechaReprogramada({ tipo: 'devolver' }, HOY)).toBeNull();
  });

  test('«Otro» exige nota', () => {
    expect(faltanteNovedad({ motivo: 'other', nota: '', plan: { tipo: 'manana' } })).toBe('nota');
    expect(faltanteNovedad({ motivo: 'not_home', nota: '', plan: { tipo: 'manana' } })).toBeNull();
    expect(faltanteNovedad({ motivo: null, nota: '', plan: null })).toBe('motivo');
  });
});

describe('fin de jornada', () => {
  test('cuenta entregas, novedades, cobros del día por medio y el efectivo que va a la caja', () => {
    const envios = [
      envio({ status: 'delivered', delivered_at: '2026-11-22T14:00:00Z', cod_status: 'collected', cod_collected_method: 'cash', cod_collected_amount: 100000, cod_collected_at: '2026-11-22T14:00:00Z' }),
      envio({ status: 'delivered', delivered_at: '2026-11-22T15:00:00Z', cod_status: 'collected', cod_collected_method: 'cash', cod_collected_amount: 112400, cod_collected_at: '2026-11-22T15:00:00Z' }),
      envio({ status: 'delivered', delivered_at: '2026-11-22T16:00:00Z', cod_status: 'remitted', cod_collected_method: 'card', cod_collected_amount: 64000, cod_collected_at: '2026-11-22T16:00:00Z' }),
      envio({ status: 'failed_attempt', expected_delivery_date: '2026-11-23' }),
      envio({ status: 'returned', updated_at: '2026-11-22T17:00:00Z' }),
      // Cobrado ayer y aún sin entregar en caja: cuenta para la caja, no para «lo que cobraste hoy».
      envio({ status: 'delivered', delivered_at: '2026-11-21T15:00:00Z', cod_status: 'collected', cod_collected_method: 'cash', cod_collected_amount: 5000, cod_collected_at: '2026-11-21T15:00:00Z' }),
    ];
    const r = resumenJornada(envios, HOY, () => BOG);
    expect(r.entregados).toBe(3);
    expect(r.noEntregados).toBe(2);
    expect(r.porDevolver).toBe(1);
    expect(r.cobros).toEqual([
      { medio: 'cash', envios: 2, total: 212400 },
      { medio: 'card', envios: 1, total: 64000 },
    ]);
    expect(r.totalCobrado).toBe(276400);
    expect(r.efectivoACaja).toBe(217400);
    expect(r.reprogramados).toHaveLength(1);
    expect(r.devoluciones).toHaveLength(1);
  });
});

test('ruta de la foto: organización primero (política de subida del bucket)', () => {
  expect(rutaFotoEnvio(120, 'abc', 'u-1', 'firma', 'png')).toBe('120/abc/firma-u-1.png');
  expect(rutaFotoEnvio(120, 'abc', 'u-1', 'foto', '../jpg')).toBe('120/abc/foto-u-1.jpg');
});
