import { filtrarPedidosPorRecaudo, pagosDeLasTarjetas } from '../recaudoPedidos';
import { resumenRecaudo, type PagoRecaudo } from '@/lib/finanzas/recaudo/recaudoPorMedio';

const pago = (id: string, pedidoId: string | null, medio: string, monto: number, tipo: PagoRecaudo['tipo']): PagoRecaudo => ({
  id,
  fecha: '2026-11-25T15:00:00Z',
  sedeId: 1,
  medio,
  metodo: medio,
  submetodo: null,
  tipo,
  monto,
  referencia: null,
  ventaId: null,
  factura: null,
  pedidoId,
  pedidoNumero: pedidoId,
});

const contraentrega = { status: 'confirmed', total: 100000, delivery_type: 'delivery_own', payment_status: 'partial', payment_method: 'cash', advance_amount: 20000, advance_status: 'paid' };

const pedidos = [
  { id: 'A', ...contraentrega },
  { id: 'B', status: 'confirmed', total: 44000, delivery_type: 'delivery_own', payment_status: 'paid', payment_method: 'bold_link' },
  { id: 'C', status: 'pending', total: 10000, delivery_type: 'pickup', payment_status: 'pending', payment_method: 'mp' },
];

const pagos = [
  pago('1', 'A', 'bold', 20000, 'anticipo'),
  pago('2', 'A', 'efectivo', 80000, 'puerta'),
  pago('3', 'B', 'bold', 44000, 'completo'),
  pago('4', 'Z', 'bold', 30000, 'completo'), // pedido de otro día, cobrado hoy
  pago('5', null, 'efectivo', 9999, 'tienda'), // venta del POS: no es de este listado
];

describe('filtros de recaudo de Pedidos online', () => {
  it('por medio: un pedido pagado por partes pasa con cada uno de sus medios', () => {
    expect(filtrarPedidosPorRecaudo(pedidos, pagos, { medios: ['bold'], estadosPago: [] }).map((o) => o.id)).toEqual(['A', 'B']);
    expect(filtrarPedidosPorRecaudo(pedidos, pagos, { medios: ['efectivo'], estadosPago: [] }).map((o) => o.id)).toEqual(['A']);
    expect(filtrarPedidosPorRecaudo(pedidos, pagos, { medios: [], estadosPago: [] })).toHaveLength(3);
  });

  it('por estado del pago, combinable con el medio', () => {
    expect(filtrarPedidosPorRecaudo(pedidos, pagos, { medios: [], estadosPago: ['pendiente'] }).map((o) => o.id)).toEqual(['C']);
    expect(filtrarPedidosPorRecaudo(pedidos, pagos, { medios: ['bold'], estadosPago: ['pagadoCompleto'] }).map((o) => o.id)).toEqual(['B']);
  });

  it('las tarjetas suman cada pago una vez, sin las ventas del POS', () => {
    const todos = pagosDeLasTarjetas(pagos, [], null);
    expect(resumenRecaudo(todos).total).toEqual({ pagos: 4, monto: 174000 });
    const bold = resumenRecaudo(pagosDeLasTarjetas(pagos, ['bold'], null));
    expect(bold.total.monto).toBe(94000);
    expect(bold.porTipo.anticipo.monto).toBe(20000);
  });

  it('con filtros del pedido, las tarjetas dicen lo mismo que la tabla', () => {
    const r = resumenRecaudo(pagosDeLasTarjetas(pagos, ['bold'], new Set(['B'])));
    expect(r.total).toEqual({ pagos: 1, monto: 44000 });
  });
});
