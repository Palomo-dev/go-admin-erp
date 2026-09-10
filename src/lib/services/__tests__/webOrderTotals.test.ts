/// <reference types="jest" />
/**
 * Reparto de totales de pedidos web en líneas de venta/factura.
 *
 * Bug que impide reincidir: FACT-0207 (org 135, 2026-09-10). El sitio web
 * aplicó una promoción de 16.000 a nivel de pedido; el ERP facturó las líneas
 * por el bruto (92.200 + 10.000 de envío = 102.200), el pago de la pasarela
 * (86.200) quedó "parcial" y apareció una cuenta por cobrar de 16.000 que el
 * cliente nunca debió.
 */
import type { WebOrder, WebOrderItem } from '../webOrdersService';
import {
  lineasFacturaDesdePedidoWeb,
  repartirTotalesPedidoWeb,
} from '../webOrderTotals';

function item(parcial: Partial<WebOrderItem> & { quantity: number; unit_price: number }): WebOrderItem {
  return {
    id: 'i',
    web_order_id: 'w',
    product_id: 1,
    product_name: 'Producto',
    tax_amount: 0,
    discount_amount: 0,
    total: parcial.quantity * parcial.unit_price,
    status: 'pending',
    created_at: '2026-09-10T00:00:00Z',
    ...parcial,
  };
}

function pedido(parcial: Partial<WebOrder>): WebOrder {
  return {
    id: 'w',
    organization_id: 135,
    branch_id: 1,
    order_number: 'WO-TEST',
    status: 'pending',
    source: 'website',
    subtotal: 0,
    tax_total: 0,
    discount_total: 0,
    delivery_fee: 0,
    tip_amount: 0,
    total: 0,
    delivery_type: 'pickup',
    is_scheduled: false,
    payment_status: 'paid',
    created_at: '2026-09-10T00:00:00Z',
    updated_at: '2026-09-10T00:00:00Z',
    items: [],
    ...parcial,
  } as unknown as WebOrder;
}

const sumaLineas = (lineas: { total_line: number }[]) =>
  Math.round(lineas.reduce((s, l) => s + l.total_line, 0) * 100) / 100;

describe('repartirTotalesPedidoWeb', () => {
  it('FACT-0207: la promoción de pedido se prorratea y las líneas suman lo que pagó Wompi', () => {
    const order = pedido({
      subtotal: 92200,
      discount_total: 16000,
      delivery_fee: 10000,
      total: 86200,
      items: [
        item({ product_id: 10, product_name: 'Canastilla', quantity: 3, unit_price: 8000 }),
        item({ product_id: 11, product_name: 'Caldero', quantity: 1, unit_price: 41000 }),
        item({ product_id: 12, product_name: 'Molino', quantity: 1, unit_price: 27200 }),
      ],
    });

    const reparto = repartirTotalesPedidoWeb(order);
    expect(reparto.diferencia).toBe(0);
    expect(reparto.totalLineas).toBe(86200);

    const descuentos = reparto.items.map((r) => r.descuento);
    expect(Math.round(descuentos.reduce((s, d) => s + d, 0) * 100) / 100).toBe(16000);
    // Proporcional al neto (piso en centavos, el residuo va a la última línea):
    // 24.000/92.200 → 4.164,85 · 41.000/92.200 → 7.114,96 · resto → 4.720,19
    expect(descuentos[0]).toBe(4164.85);
    expect(descuentos[1]).toBe(7114.96);
    expect(descuentos[2]).toBe(4720.19);

    const lineas = lineasFacturaDesdePedidoWeb(order, 'inv-1', reparto);
    expect(lineas).toHaveLength(4);
    expect(lineas[3]).toMatchObject({ description: 'Envío (Delivery)', total_line: 10000, product_id: null });
    expect(sumaLineas(lineas)).toBe(86200);
    // Lo que el trigger usará como subtotal: SUM(qty*unit_price - discount) = 76.200 + 10.000
    const subtotalTrigger = lineas.reduce((s, l) => s + l.qty * l.unit_price - l.discount_amount, 0);
    expect(Math.round(subtotalTrigger * 100) / 100).toBe(86200);
  });

  it('FACT-0209: un solo ítem con descuento mayor que la mitad', () => {
    const order = pedido({
      subtotal: 99600,
      discount_total: 66400,
      delivery_fee: 10000,
      total: 43200,
      items: [item({ quantity: 1, unit_price: 99600 })],
    });
    const reparto = repartirTotalesPedidoWeb(order);
    expect(reparto.diferencia).toBe(0);
    expect(reparto.items[0]).toMatchObject({ descuento: 66400, neto: 33200, total: 33200 });
  });

  it('sin descuento ni envío las líneas son las del pedido, sin cambios', () => {
    const order = pedido({
      subtotal: 50000,
      total: 50000,
      items: [item({ quantity: 2, unit_price: 25000 })],
    });
    const lineas = lineasFacturaDesdePedidoWeb(order, 'inv');
    expect(lineas).toEqual([
      expect.objectContaining({ qty: 2, unit_price: 25000, total_line: 50000, discount_amount: 0, tax_rate: 0 }),
    ]);
  });

  it('respeta el descuento que ya viene en el ítem y solo prorratea el residuo', () => {
    const order = pedido({
      subtotal: 30000,
      discount_total: 5000, // 2.000 ya están en el ítem A; 3.000 son de pedido
      total: 25000,
      items: [
        item({ product_id: 1, quantity: 1, unit_price: 10000, discount_amount: 2000 }),
        item({ product_id: 2, quantity: 1, unit_price: 20000 }),
      ],
    });
    const reparto = repartirTotalesPedidoWeb(order);
    expect(reparto.diferencia).toBe(0);
    // Residuo 3.000 repartido por neto: 8.000 y 20.000 → 857,14 y 2.142,86
    expect(reparto.items[0].descuento).toBeCloseTo(2857.14, 2);
    expect(reparto.items[1].descuento).toBeCloseTo(2142.86, 2);
    expect(reparto.items[0].descuento + reparto.items[1].descuento).toBeCloseTo(5000, 2);
  });

  it('el redondeo nunca deja la suma descuadrada aunque sean muchas líneas', () => {
    const items = Array.from({ length: 7 }, (_, i) => item({ product_id: i + 1, quantity: 1, unit_price: 1111 }));
    const order = pedido({ subtotal: 7777, discount_total: 1000, total: 6777, items });
    const reparto = repartirTotalesPedidoWeb(order);
    expect(reparto.diferencia).toBe(0);
    const suma = reparto.items.reduce((s, r) => s + r.descuento, 0);
    expect(Math.round(suma * 100) / 100).toBe(1000);
  });

  it('un descuento mayor que los productos se limita al bruto (no hay líneas negativas)', () => {
    const order = pedido({ subtotal: 10000, discount_total: 15000, total: 0, items: [item({ quantity: 1, unit_price: 10000 })] });
    const reparto = repartirTotalesPedidoWeb(order);
    expect(reparto.items[0].descuento).toBe(10000);
    expect(reparto.items[0].total).toBe(0);
    expect(reparto.diferencia).toBe(0);
  });

  it('propina y envío entran como líneas propias para que la factura cuadre con el pago', () => {
    const order = pedido({
      subtotal: 40000,
      delivery_fee: 6000,
      tip_amount: 4000,
      total: 50000,
      items: [item({ quantity: 1, unit_price: 40000 })],
    });
    const lineas = lineasFacturaDesdePedidoWeb(order, 'inv');
    expect(lineas.map((l) => l.description)).toEqual(['Producto', 'Envío (Delivery)', 'Propina']);
    expect(sumaLineas(lineas)).toBe(50000);
  });

  it('impuesto por encima del subtotal: se suma a la línea y el trigger lo deriva como tax_total', () => {
    const order = pedido({
      subtotal: 100000,
      tax_total: 19000,
      total: 119000,
      items: [item({ quantity: 1, unit_price: 100000, tax_amount: 19000 })],
    });
    const reparto = repartirTotalesPedidoWeb(order);
    expect(reparto.impuestoSobreBase).toBe(true);
    expect(reparto.diferencia).toBe(0);
    const [linea] = lineasFacturaDesdePedidoWeb(order, 'inv', reparto);
    expect(linea).toMatchObject({ total_line: 119000, tax_rate: 19, discount_amount: 0 });
  });

  it('impuesto incluido en el precio: no se suma dos veces', () => {
    const order = pedido({
      subtotal: 119000,
      tax_total: 19000,
      total: 119000,
      items: [item({ quantity: 1, unit_price: 119000, tax_amount: 19000 })],
    });
    const reparto = repartirTotalesPedidoWeb(order);
    expect(reparto.impuestoSobreBase).toBe(false);
    expect(reparto.totalLineas).toBe(119000);
    expect(reparto.diferencia).toBe(0);
  });

  it('un componente desconocido queda visible en `diferencia`, no se esconde', () => {
    const order = pedido({ subtotal: 10000, total: 12345, items: [item({ quantity: 1, unit_price: 10000 })] });
    expect(repartirTotalesPedidoWeb(order).diferencia).toBe(2345);
  });
});
