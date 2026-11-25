import { coincideEstadoPago, contarEstadosPago, estadosPagoDelPedido } from '../estadoPagoPedido';
import { porCobrarAlEntregar, porCobrarEnPuerta } from '../contraentregaPedido';

const contraentrega = {
  status: 'confirmed',
  total: 100000,
  delivery_type: 'delivery_own',
  payment_status: 'partial',
  payment_method: 'cash',
  payment_reference: null,
  advance_amount: 20000,
  advance_status: 'paid',
};

describe('estado del pago del pedido online', () => {
  it('pagado completo por pasarela', () => {
    expect(estadosPagoDelPedido({ status: 'confirmed', total: 44000, delivery_type: 'delivery_own', payment_status: 'paid', payment_method: 'bold_link' })).toEqual(['pagadoCompleto']);
  });

  it('anticipo pagado y por cobrar en puerta se cruzan', () => {
    expect(estadosPagoDelPedido(contraentrega)).toEqual(['anticipoPagado', 'porCobrarPuerta']);
    expect(porCobrarEnPuerta(contraentrega)).toBe(80000);
  });

  it('cobrado en puerta cuando el saldo ya entró', () => {
    const entregado = { ...contraentrega, status: 'delivered', payment_status: 'paid' };
    expect(estadosPagoDelPedido(entregado)).toEqual(['anticipoPagado', 'cobradoPuerta']);
    expect(porCobrarEnPuerta(entregado)).toBe(0);
  });

  it('pendiente y vencido', () => {
    expect(estadosPagoDelPedido({ status: 'pending', payment_status: 'pending', payment_method: 'bold_link', delivery_type: 'pickup' })).toEqual(['pendiente']);
    expect(estadosPagoDelPedido({ ...contraentrega, status: 'expired', advance_status: 'expired', payment_status: 'pending' })).toEqual(['pendiente', 'vencido']);
  });

  it('filtrar y contar', () => {
    const pedidos = [contraentrega, { ...contraentrega, status: 'delivered', payment_status: 'paid' }];
    expect(coincideEstadoPago(pedidos[0], ['cobradoPuerta'])).toBe(false);
    expect(coincideEstadoPago(pedidos[0], [])).toBe(true);
    const c = contarEstadosPago(pedidos);
    expect(c.anticipoPagado).toBe(2);
    expect(c.porCobrarPuerta).toBe(1);
    expect(c.cobradoPuerta).toBe(1);
  });

  it('porCobrarAlEntregar sigue sumando igual que antes', () => {
    expect(porCobrarAlEntregar([contraentrega, { ...contraentrega, advance_status: 'pending' }])).toEqual({ monto: 80000, pedidos: 1 });
  });
});
