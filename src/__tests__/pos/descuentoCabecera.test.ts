import { cuadrarDescuentoCabecera, descuentoDesdeLineas } from '@/lib/pos/venta/descuentoCabecera';

describe('descuento de cabecera', () => {
  it('suma los descuentos de las líneas y redondea a centavos', () => {
    expect(descuentoDesdeLineas([
      { discount_amount: 200.004 },
      { discount_amount: 300 },
      { discount_amount: null },
    ])).toBe(500);
  });

  it('alinea un carrito viejo cuyo descuento manual solo estaba en la cabecera', () => {
    const cart = cuadrarDescuentoCabecera({
      discount_total: 500,
      discount_amount: 500,
      items: [{ discount_amount: 0 }, { discount_amount: 0 }],
    });
    expect(cart.discount_total).toBe(0);
    expect(cart.discount_amount).toBe(0);
  });

  it('conserva la cabecera cuando ya es la suma de las líneas', () => {
    const cart = { discount_total: 500, discount_amount: 500, items: [{ discount_amount: 200 }, { discount_amount: 300 }] };
    expect(cuadrarDescuentoCabecera(cart)).toBe(cart);
  });
});
