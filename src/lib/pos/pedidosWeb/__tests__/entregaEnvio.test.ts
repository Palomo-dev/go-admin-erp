/**
 * Tarjeta «Entrega» del pedido online con el envío real (Figma 3236-223013) y el número de guía
 * en una sola línea del rótulo (decisión 5 del 2026-11-25).
 */
import {
  accionMarcarEntregado,
  cobroDeEntrega,
  enlaceRastreoTransportadora,
  envioActivo,
  esTransportadora,
  estadoTarjetaEntrega,
  hitosDelEnvio,
  momentoAvisoDeHito,
  puedeCambiarDomiciliario,
} from '../entregaEnvio';
import { tamanoNumeroGuia } from '@/lib/logistica/rotuloEnvio';
import type { EventoLinea } from '@/lib/logistica/detalleEnvio';

const ev = (id: string, canonico: string, hora: string, extra: Partial<EventoLinea> = {}): EventoLinea => ({
  id,
  event_time: hora,
  canonical_status: canonico,
  event_type: canonico,
  reason_code: null,
  description: null,
  provider_status: null,
  ...extra,
});

describe('estadoTarjetaEntrega: shipments.status → los nueve estados de la tarjeta', () => {
  it.each([
    ['draft', 'por_despachar'],
    ['pending', 'por_despachar'],
    ['ready', 'por_despachar'],
    ['ready_for_pickup', 'por_despachar'],
    ['assigned', 'asignado'],
    ['picked', 'asignado'],
    ['dispatched', 'en_camino'],
    ['in_transit', 'en_camino'],
    ['out_for_delivery', 'en_camino'],
    ['delivered', 'entregado'],
    ['failed_attempt', 'novedad'],
    ['failed', 'novedad'],
    ['returned', 'devuelto'],
    ['cancelled', 'cancelado'],
  ])('%s → %s', (status, esperado) => {
    expect(estadoTarjetaEntrega(status, false)).toBe(esperado);
  });

  it('sin envío: «Sin envío» a domicilio y «Listo para recoger» en recoger en tienda', () => {
    expect(estadoTarjetaEntrega(null, false)).toBe('sin_envio');
    expect(estadoTarjetaEntrega(undefined, true)).toBe('recoger');
  });
});

describe('reglas de acción', () => {
  it('envío activo: todo menos entregado, devuelto y cancelado', () => {
    expect(envioActivo('out_for_delivery')).toBe(true);
    expect(envioActivo('pending')).toBe(true);
    expect(envioActivo('delivered')).toBe(false);
    expect(envioActivo('returned')).toBe(false);
    expect(envioActivo('cancelled')).toBe(false);
    expect(envioActivo(null)).toBe(false);
  });

  it('cambiar domiciliario solo con domicilio propio y antes de «En camino» (decisión 3)', () => {
    expect(puedeCambiarDomiciliario({ status: 'ready_for_pickup', modo: 'own' })).toBe(true);
    expect(puedeCambiarDomiciliario({ status: 'assigned', modo: 'own' })).toBe(true);
    expect(puedeCambiarDomiciliario({ status: 'picked', modo: 'own' })).toBe(false);
    expect(puedeCambiarDomiciliario({ status: 'out_for_delivery', modo: 'own' })).toBe(false);
    // Tras una novedad se reasigna desde Logística, con motivo.
    expect(puedeCambiarDomiciliario({ status: 'failed_attempt', modo: 'own' })).toBe(false);
    expect(puedeCambiarDomiciliario({ status: 'assigned', modo: 'national_carrier' })).toBe(false);
  });

  it('«Marcar entregado» con envío activo abre Logística; sin envío, solo el pedido (decisión 4)', () => {
    expect(accionMarcarEntregado(null)).toBe('pedido');
    expect(accionMarcarEntregado('delivered')).toBe('pedido');
    expect(accionMarcarEntregado('cancelled')).toBe('pedido');
    expect(accionMarcarEntregado('out_for_delivery')).toBe('logistica');
    expect(accionMarcarEntregado('ready_for_pickup')).toBe('logistica');
    // Un envío que aún no puede entregarse no deja marcar solo el pedido (no divergen).
    expect(accionMarcarEntregado('pending')).toBe('bloqueado');
    expect(accionMarcarEntregado('draft')).toBe('bloqueado');
  });

  it('transportadora: por modo de despacho o por tipo de entrega del pedido', () => {
    expect(esTransportadora({ modo: 'national_carrier' })).toBe(true);
    expect(esTransportadora({ modo: 'own', deliveryType: 'delivery_third_party' })).toBe(true);
    expect(esTransportadora({ modo: 'own', deliveryType: 'delivery_own' })).toBe(false);
  });

  it('enlace de rastreo: el del envío o la plantilla con la guía; solo http(s)', () => {
    expect(enlaceRastreoTransportadora('https://t.co/x', 'https://a/{guia}', '1')).toBe('https://t.co/x');
    expect(enlaceRastreoTransportadora(null, 'https://rastreo.test/?g={tracking_number}', '7012 4455')).toBe('https://rastreo.test/?g=7012%204455');
    expect(enlaceRastreoTransportadora(null, 'javascript:alert({guia})', '1')).toBeNull();
    expect(enlaceRastreoTransportadora('javascript:alert(1)', null, '1')).toBeNull();
    expect(enlaceRastreoTransportadora(null, 'https://rastreo.test/', '1')).toBeNull();
    expect(enlaceRastreoTransportadora(null, 'https://rastreo.test/{guia}', '')).toBeNull();
  });
});

describe('cobroDeEntrega', () => {
  const contraentrega = { total: 151000, delivery_type: 'delivery_own', payment_method: 'cash', payment_status: 'pending', advance_amount: 9000, advance_status: 'paid' as const };

  it('manda la contraentrega del envío: «Cobrar al entregar» con total y anticipo', () => {
    expect(cobroDeEntrega(contraentrega, { cod_amount: 142000, cod_status: 'pending' })).toEqual({ tipo: 'cobrar', monto: 142000, total: 151000, anticipo: 9000 });
  });

  it('sin contraentrega en el envío, el pedido contraentrega dice su saldo (total − anticipo pagado)', () => {
    expect(cobroDeEntrega(contraentrega, { cod_amount: 0, cod_status: null })).toEqual({ tipo: 'cobrar', monto: 142000, total: 151000, anticipo: 9000 });
    expect(cobroDeEntrega(contraentrega, null)).toMatchObject({ tipo: 'cobrar', monto: 142000 });
  });

  it('ya cobrado en la puerta: «Cobrado» con lo recibido', () => {
    expect(cobroDeEntrega(contraentrega, { cod_amount: 142000, cod_status: 'collected', cod_collected_amount: 142000, cod_collected_method: 'cash' })).toEqual({ tipo: 'cobrado', monto: 142000, metodo: 'cash' });
  });

  it('pagado en línea: «Pagado · no cobrar»', () => {
    expect(cobroDeEntrega({ ...contraentrega, payment_status: 'paid', payment_method: 'wompi' }, { cod_amount: 0 })).toEqual({ tipo: 'pagado' });
  });

  it('recoger en tienda sin pagar: se cobra en la caja; pagado, no', () => {
    const recoger = { total: 58000, delivery_type: 'pickup', payment_method: 'cash', payment_status: 'pending' };
    expect(cobroDeEntrega(recoger, null, true)).toEqual({ tipo: 'cobrar', monto: 58000, total: 58000, anticipo: 0 });
    expect(cobroDeEntrega({ ...recoger, payment_status: 'paid' }, null, true)).toEqual({ tipo: 'pagado' });
  });
});

describe('hitosDelEnvio: una sola línea de tiempo con el envío (decisión 2)', () => {
  it('domicilio propio en camino: listo, asignado y en camino con su hora; «Entregado» pendiente', () => {
    const hitos = hitosDelEnvio(
      [
        ev('c', 'created', '2026-11-25T03:20:00Z'),
        ev('r', 'ready_for_pickup', '2026-11-25T03:20:00Z'),
        ev('a', 'assigned', '2026-11-25T03:31:00Z'),
        ev('o', 'out_for_delivery', '2026-11-25T03:38:00Z'),
      ],
      { status: 'out_for_delivery', modo: 'own' },
      'delivery_own',
    );
    expect(hitos.map((h) => [h.canonico, h.estado])).toEqual([
      ['ready_for_pickup', 'hecho'],
      ['assigned', 'hecho'],
      ['out_for_delivery', 'actual'],
      ['delivered', 'pendiente'],
    ]);
    expect(hitos.every((h) => h.fuente === 'logistica')).toBe(true);
    expect(hitos[2].hora).toBe('2026-11-25T03:38:00Z');
  });

  it('sin eventos (envíos viejos): los timestamps de shipments llenan los hitos', () => {
    const hitos = hitosDelEnvio([], {
      status: 'delivered',
      modo: 'own',
      assigned_at: '2026-11-25T03:31:00Z',
      dispatched_at: '2026-11-25T03:38:00Z',
      delivered_at: '2026-11-25T04:02:00Z',
    });
    expect(hitos.map((h) => [h.canonico, h.hora])).toEqual([
      ['assigned', '2026-11-25T03:31:00Z'],
      ['out_for_delivery', '2026-11-25T03:38:00Z'],
      ['delivered', '2026-11-25T04:02:00Z'],
    ]);
  });

  it('el timestamp no duplica un hito que ya tiene evento', () => {
    const hitos = hitosDelEnvio([ev('a', 'assigned', '2026-11-25T03:31:00Z')], { status: 'assigned', modo: 'own', assigned_at: '2026-11-25T03:30:59Z' });
    expect(hitos.filter((h) => h.canonico === 'assigned')).toHaveLength(1);
  });

  it('novedad y segundo intento: el fallo queda marcado y el reparto lleva su número', () => {
    const hitos = hitosDelEnvio(
      [
        ev('o1', 'out_for_delivery', '2026-11-25T00:01:00Z'),
        ev('f', 'failed_attempt', '2026-11-25T00:24:00Z', { reason_code: 'not_home' }),
        ev('o2', 'out_for_delivery', '2026-11-25T14:48:00Z'),
        ev('d', 'delivered', '2026-11-25T15:12:00Z'),
      ],
      { status: 'delivered', modo: 'own' },
    );
    expect(hitos.map((h) => [h.canonico, h.estado, h.intento, h.motivo])).toEqual([
      ['out_for_delivery', 'hecho', null, null],
      ['failed_attempt', 'fallo', null, 'not_home'],
      ['out_for_delivery', 'hecho', 2, null],
      ['delivered', 'actual', null, null],
    ]);
  });

  it('transportadora: lo que reporta el tercero lleva su fuente; listo y recogido son de Logística', () => {
    const hitos = hitosDelEnvio(
      [ev('r', 'ready_for_pickup', '2026-11-24T20:10:00Z'), ev('p', 'picked', '2026-11-24T21:30:00Z'), ev('t', 'in_transit', '2026-11-25T11:05:00Z')],
      { status: 'in_transit', modo: 'national_carrier' },
      'delivery_third_party',
    );
    expect(hitos.map((h) => [h.canonico, h.fuente])).toEqual([
      ['ready_for_pickup', 'logistica'],
      ['picked', 'logistica'],
      ['in_transit', 'transportadora'],
      ['out_for_delivery', 'transportadora'],
      ['delivered', 'transportadora'],
    ]);
  });

  it('avisos: listo, en camino y entregado', () => {
    expect(momentoAvisoDeHito('ready_for_pickup')).toBe('listo');
    expect(momentoAvisoDeHito('out_for_delivery')).toBe('en_camino');
    expect(momentoAvisoDeHito('delivered')).toBe('entregado');
    expect(momentoAvisoDeHito('assigned')).toBeNull();
  });
});

describe('tamanoNumeroGuia: la guía cabe en una línea del rótulo (decisión 5)', () => {
  const ANCHO_CARACTER = 0.74;
  it('la guía DEL-WO de 24 caracteres se achica para caber en el 10 × 15 (280 px)', () => {
    const numero = 'DEL-WO-452-MX4K2P7F-A3QZ';
    const px = tamanoNumeroGuia(numero, 280, 17);
    expect(px).toBeLessThan(17);
    expect(numero.length * px * (ANCHO_CARACTER + 0.05)).toBeLessThanOrEqual(280);
  });

  it('con sufijo de paquete y en la térmica (232 px) también cabe', () => {
    const numero = 'DEL-WO-1234-MX4K2P7F-A3QZ-2';
    const px = tamanoNumeroGuia(numero, 232, 17, 0.04);
    expect(numero.length * px * (ANCHO_CARACTER + 0.04)).toBeLessThanOrEqual(232);
  });

  it('una guía corta no crece por encima del máximo y nunca baja del mínimo', () => {
    expect(tamanoNumeroGuia('ENV-0711', 280, 17)).toBe(17);
    expect(tamanoNumeroGuia('X'.repeat(500), 280, 17)).toBe(8);
  });
});
