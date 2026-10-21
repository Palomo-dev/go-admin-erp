import { minimoDelFormulario } from '@/lib/promotions/cantidadMinima';
import { cantidadDeRegla, prepararPromocion } from '@/lib/promotions/prepararPromocion';

describe('prepararPromocion', () => {
  it('activar o desactivar no toca las cantidades', () => {
    expect(prepararPromocion({ is_active: false, buy_quantity: 2, get_quantity: 1 })).toEqual({
      is_active: false,
      buy_quantity: 2,
      get_quantity: 1,
    });
  });

  it('una promo nueva no convierte el 2 por defecto de compra X lleva Y en cantidad mínima', () => {
    expect(
      prepararPromocion({
        promotion_type: 'fixed_amount',
        buy_quantity: 2,
        get_quantity: 1,
        min_quantity: null,
      }),
    ).toMatchObject({
      buy_quantity: null,
      get_quantity: null,
      min_quantity: null,
    });
  });

  it('al editar, el mínimo legado pasa al campo que se guarda en min_quantity', () => {
    expect(
      minimoDelFormulario(
        { promotion_type: 'fixed_amount' as const, buy_quantity: 2, min_quantity: null },
        true,
      ),
    ).toMatchObject({ min_quantity: 2 });
    expect(
      minimoDelFormulario(
        { promotion_type: 'fixed_amount' as const, buy_quantity: 2, min_quantity: 3 },
        true,
      ).min_quantity,
    ).toBe(3);
    expect(
      minimoDelFormulario(
        { promotion_type: 'percentage' as const, buy_quantity: 2, min_quantity: null },
        false,
      ).min_quantity,
    ).toBeNull();
    expect(
      minimoDelFormulario(
        { promotion_type: 'buy_x_get_y' as const, buy_quantity: 2, get_quantity: 1, min_quantity: null },
        true,
      ),
    ).toMatchObject({ buy_quantity: 2, min_quantity: null });
  });

  it('porcentaje y monto fijo guardan el mínimo y la repetición, y vacían compra X lleva Y', () => {
    expect(
      prepararPromocion({
        promotion_type: 'percentage',
        applies_to: 'products',
        buy_quantity: 2,
        get_quantity: 1,
        min_quantity: 2,
        repeat_every_quantity: 2,
        min_purchase_scope: 'cart',
      }),
    ).toMatchObject({
      buy_quantity: null,
      get_quantity: null,
      min_quantity: 2,
      repeat_every_quantity: 2,
      min_purchase_scope: 'cart',
    });
  });

  it('todos los productos no guardan un alcance, y un cero no es una repetición', () => {
    const out = prepararPromocion({
      promotion_type: 'fixed_amount',
      applies_to: 'all',
      min_purchase_scope: 'cart',
      repeat_every_quantity: 0,
      min_quantity: -1,
    });
    expect(out.min_purchase_scope).toBeNull();
    expect(out.repeat_every_quantity).toBeNull();
    expect(out.min_quantity).toBeNull();
  });

  it('compra X lleva Y conserva X e Y y no guarda cantidad mínima ni repetición', () => {
    expect(
      prepararPromocion({
        promotion_type: 'buy_x_get_y',
        applies_to: 'products',
        buy_quantity: 2,
        get_quantity: 1,
        min_quantity: 2,
        repeat_every_quantity: 2,
        min_purchase_scope: 'eligible',
      }),
    ).toMatchObject({
      buy_quantity: 2,
      get_quantity: 1,
      min_quantity: null,
      repeat_every_quantity: null,
      min_purchase_scope: 'eligible',
    });
  });

  it('la cantidad de una regla solo se guarda en un producto incluido del paquete', () => {
    expect(cantidadDeRegla({ rule_type: 'include_product', product_id: 1, quantity: null }, 'bundle')).toBe(1);
    expect(cantidadDeRegla({ rule_type: 'include_product', product_id: 1, quantity: 3 }, 'bundle')).toBe(3);
    expect(cantidadDeRegla({ rule_type: 'include_product', product_id: 1, quantity: 3 }, 'percentage')).toBeNull();
    expect(cantidadDeRegla({ rule_type: 'exclude_product', product_id: 1, quantity: 3 }, 'bundle')).toBeNull();
  });
});
