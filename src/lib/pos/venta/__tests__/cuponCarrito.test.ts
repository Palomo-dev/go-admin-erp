import { descuentoDeVentaPorLinea, repartirMonto, validarCupon, type CuponAplicable } from '@/lib/pos/venta/cuponCarrito';

const ahora = new Date('2026-10-20T15:00:00.000Z');
const cupon = (extra: Partial<CuponAplicable> = {}): CuponAplicable => ({
  id: 'c1',
  code: 'BIENVENIDA',
  discount_type: 'percentage',
  discount_value: 10,
  is_active: true,
  ...extra,
});

describe('validarCupon', () => {
  const ctx = { ahora, subtotal: 50000, customerId: 'cli-1', usosDelCliente: 0, yaCompro: false };

  it('un 10 % de 50.000 son 5.000, con tope', () => {
    expect(validarCupon(cupon(), ctx)).toEqual({ ok: true, descuento: 5000 });
    expect(validarCupon(cupon({ max_discount_amount: 3000 }), ctx)).toEqual({ ok: true, descuento: 3000 });
  });

  it('rechaza inactivo, vencido, agotado, otro cliente y compra mínima', () => {
    expect(validarCupon(cupon({ is_active: false }), ctx).ok).toBe(false);
    expect(validarCupon(cupon({ end_date: '2026-10-01T00:00:00Z' }), ctx)).toMatchObject({ motivo: 'vencido' });
    expect(validarCupon(cupon({ usage_limit: 1, usage_count: 1 }), ctx)).toMatchObject({ motivo: 'agotado' });
    expect(validarCupon(cupon({ customer_id: 'otro' }), ctx)).toMatchObject({ motivo: 'otro_cliente' });
    expect(validarCupon(cupon({ min_purchase_amount: 80000 }), ctx)).toMatchObject({ motivo: 'minimo' });
  });
});

describe('reparto', () => {
  it('la última línea absorbe el centavo', () => {
    expect(repartirMonto(10, [100, 100, 100])).toEqual([3.33, 3.33, 3.34]);
  });

  it('el porcentaje de la venta es por línea y el monto se reparte', () => {
    const lineas = [{ quantity: 1, unit_price: 10000 }, { quantity: 2, unit_price: 5000 }];
    expect(descuentoDeVentaPorLinea(lineas, 'porcentaje', 10)).toEqual([1000, 1000]);
    expect(descuentoDeVentaPorLinea(lineas, 'monto', 4000)).toEqual([2000, 2000]);
  });
});
