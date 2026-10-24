/**
 * Motor PURO de promociones (`motorPromociones.ts`): sin Supabase y sin reloj
 * implícito. Cada bloque reproduce una falla del diagnóstico (A–H) con datos
 * ficticios de la «org 120», sucursal 7, zona America/Bogota.
 *
 * Las mismas fallas, a través del POS de verdad (POSService, PedidosService
 * y promotionEngine), en `src/__tests__/pos/promociones/promocionesPos.test.ts`.
 */
import {
  cambiosDescuentoMesa,
  combinarDescuentos,
  diaSemanaEnZona,
  evaluarPromociones,
  lineaMesaGestionada,
  promocionesUsadas,
  promocionVigente,
  unidadesGratisCompraLleva,
  type ContextoPromocion,
  type FilaPromocion,
  type LineaPromocion,
} from '@/lib/promotions/motorPromociones';

// Miércoles 7 de octubre de 2026, 20:00 en Bogotá = jueves 01:00 UTC.
const MIERCOLES_20_BOGOTA = new Date('2026-10-08T01:00:00.000Z');
const ctx = (extra: Partial<ContextoPromocion> = {}): ContextoPromocion => ({
  canal: 'pos',
  ahora: MIERCOLES_20_BOGOTA,
  zonaHoraria: 'America/Bogota',
  sucursalId: 7,
  ...extra,
});

let secuencia = 0;
function promo(extra: Partial<FilaPromocion> = {}): FilaPromocion {
  secuencia += 1;
  return {
    id: `00000000-0000-4000-8000-${String(secuencia).padStart(12, '0')}`,
    name: `Promo ${secuencia}`,
    promotion_type: 'percentage',
    discount_value: 10,
    applies_to: 'all',
    start_date: '2026-01-01T00:00:00Z',
    end_date: null,
    is_active: true,
    usage_limit: null,
    usage_count: 0,
    is_combinable: false,
    priority: 0,
    created_at: '2026-01-01T00:00:00Z',
    branches: null,
    applicable_days: null,
    applies_to_pos: true,
    promotion_rules: [],
    ...extra,
  };
}
const soloProducto = (productId: number) => ({
  applies_to: 'products',
  promotion_rules: [{ rule_type: 'include_product', product_id: productId, category_id: null }],
});
const linea = (product_id: number, quantity: number, unit_price: number, extra: Partial<LineaPromocion> = {}): LineaPromocion => ({
  product_id,
  quantity,
  unit_price,
  ...extra,
});

describe('A · no combinables: gana la que más descuenta en ESTA cuenta', () => {
  it('8 no combinables de mayor prioridad que no tocan la cuenta no bloquean a la que sí aplica', () => {
    const ajenas = Array.from({ length: 7 }, (_, i) => promo({ priority: 10 + i, ...soloProducto(9000 + i) }));
    const laQueAplica = promo({ priority: 1, discount_value: 15, ...soloProducto(1001) });
    const r = evaluarPromociones([...ajenas, laQueAplica], [linea(1001, 1, 20000)], ctx());
    expect(r.discountTotal).toBe(3000);
    expect(r.applied.map((a) => a.promotion_id)).toEqual([laQueAplica.id]);
  });

  it('empate en descuento: decide la prioridad', () => {
    const baja = promo({ priority: 1 });
    const alta = promo({ priority: 5 });
    const r = evaluarPromociones([baja, alta], [linea(1001, 1, 10000)], ctx());
    expect(r.applied.map((a) => a.promotion_id)).toEqual([alta.id]);
  });

  it('empate en descuento y prioridad: gana la más antigua (created_at), sin importar el orden de llegada', () => {
    const nueva = promo({ created_at: '2026-05-01T00:00:00Z' });
    const vieja = promo({ created_at: '2026-02-01T00:00:00Z' });
    expect(evaluarPromociones([nueva, vieja], [linea(1001, 1, 10000)], ctx()).applied[0].promotion_id).toBe(vieja.id);
    expect(evaluarPromociones([vieja, nueva], [linea(1001, 1, 10000)], ctx()).applied[0].promotion_id).toBe(vieja.id);
  });

  it('una no combinable compite contra la SUMA de las combinables', () => {
    const sola = promo({ discount_value: 15 });
    const c1 = promo({ is_combinable: true, discount_value: 10 });
    const c2 = promo({ is_combinable: true, discount_value: 10 });
    const r = evaluarPromociones([sola, c1, c2], [linea(1001, 1, 10000)], ctx());
    expect(r.discountTotal).toBe(2000);
    expect(r.applied.map((a) => a.promotion_id).sort()).toEqual([c1.id, c2.id].sort());
  });
});

describe('B · usage_limit', () => {
  it('límite de usos agotado: no aplica', () => {
    const agotada = promo({ usage_limit: 5, usage_count: 5 });
    expect(evaluarPromociones([agotada], [linea(1001, 1, 10000)], ctx()).discountTotal).toBe(0);
  });
  it('con usos restantes aplica; usage_limit nulo = sin límite; llega como texto desde PostgREST', () => {
    expect(evaluarPromociones([promo({ usage_limit: '5', usage_count: 4 })], [linea(1001, 1, 10000)], ctx()).discountTotal).toBe(1000);
    expect(evaluarPromociones([promo({ usage_limit: null, usage_count: 999 })], [linea(1001, 1, 10000)], ctx()).discountTotal).toBe(1000);
  });
});

describe('C · día de la semana en la zona de la organización', () => {
  it('miércoles 20:00 en Bogotá es miércoles aunque el proceso vaya en UTC (allí ya es jueves)', () => {
    expect(diaSemanaEnZona(MIERCOLES_20_BOGOTA, 'America/Bogota')).toBe('wednesday');
    const miercoles = promo({ applicable_days: ['wednesday'] });
    const jueves = promo({ applicable_days: ['thursday'] });
    expect(evaluarPromociones([miercoles], [linea(1001, 1, 10000)], ctx()).discountTotal).toBe(1000);
    expect(evaluarPromociones([jueves], [linea(1001, 1, 10000)], ctx()).discountTotal).toBe(0);
  });
  it('zona ilegible: respaldo America/Bogota', () => {
    expect(diaSemanaEnZona(MIERCOLES_20_BOGOTA, 'No/Existe')).toBe('wednesday');
  });
});

describe('D · sucursales (branches jsonb)', () => {
  it('branches como texto ["7"] alcanza a la sucursal 7', () => {
    expect(evaluarPromociones([promo({ branches: ['7'] })], [linea(1001, 1, 10000)], ctx()).discountTotal).toBe(1000);
  });
  it('otra sucursal o sin sucursal: no aplica; vacía o nula: todas', () => {
    expect(promocionVigente(promo({ branches: [8] }), ctx())).toBe(false);
    expect(promocionVigente(promo({ branches: [7] }), ctx({ sucursalId: null }))).toBe(false);
    expect(promocionVigente(promo({ branches: [] }), ctx())).toBe(true);
  });
});

describe('E · el descuento de promoción se recalcula; el manual no se pisa', () => {
  const minimo = promo({ min_purchase_amount: 50000 });
  it('subir y bajar la cantidad con compra mínima pone y QUITA el descuento', () => {
    expect(evaluarPromociones([minimo], [linea(1001, 1, 30000)], ctx()).lineDiscounts).toEqual([0]);
    expect(evaluarPromociones([minimo], [linea(1001, 2, 30000)], ctx()).lineDiscounts).toEqual([6000]);
    expect(evaluarPromociones([minimo], [linea(1001, 1, 30000)], ctx()).lineDiscounts).toEqual([0]);
  });
  it('combinarDescuentos: manual del cajero gana; si no hay, el de la promoción nueva (también 0)', () => {
    const finales = combinarDescuentos(
      [
        { quantity: 1, unit_price: 30000, discount_amount: 3000, promo_discount_amount: 3000, manual_discount_amount: null },
        { quantity: 1, unit_price: 30000, discount_amount: 1000, manual_discount_amount: 1000 },
        // Carrito guardado antes del cambio: su descuento se trata como manual.
        { quantity: 1, unit_price: 30000, discount_amount: 500 },
      ],
      [0, 3000, 3000],
    );
    expect(finales.map((f) => f.discount_amount)).toEqual([0, 1000, 500]);
    expect(finales.map((f) => f.promo_discount_amount)).toEqual([0, 0, 0]);
  });
});

describe('F · mismo producto en dos líneas', () => {
  it('cada línea lleva SOLO su descuento (lineDiscounts), no la suma del producto', () => {
    const r = evaluarPromociones([promo()], [linea(1001, 1, 10000), linea(1001, 2, 10000)], ctx());
    expect(r.lineDiscounts).toEqual([1000, 2000]);
    expect(r.itemDiscounts[1001]).toBe(3000);
    expect(r.discountTotal).toBe(3000);
  });
});

describe('G · mesa: la cuenta COMPLETA', () => {
  it('dos platos que juntos superan la compra mínima', () => {
    const r = evaluarPromociones([promo({ min_purchase_amount: 50000 })], [linea(1001, 1, 30000), linea(1002, 1, 30000)], ctx());
    expect(r.lineDiscounts).toEqual([3000, 3000]);
  });
  it('monto fijo en una mesa con tres platos: UN monto repartido, no uno por plato', () => {
    const r = evaluarPromociones(
      [promo({ promotion_type: 'fixed_amount', discount_value: 9000 })],
      [linea(1001, 1, 10000), linea(1002, 1, 20000), linea(1003, 1, 30000)],
      ctx(),
    );
    expect(r.discountTotal).toBe(9000);
    expect(r.lineDiscounts).toEqual([1500, 3000, 4500]);
  });
  it('monto fijo mayor que la cuenta: nunca descuenta más que la cuenta', () => {
    const r = evaluarPromociones([promo({ promotion_type: 'fixed_amount', discount_value: 50000 })], [linea(1001, 1, 8000)], ctx());
    expect(r.lineDiscounts).toEqual([8000]);
  });
  it('2x1 agregado de uno en uno (cada plato su línea) sí aplica', () => {
    const dosPorUno = promo({ promotion_type: 'buy_x_get_y', buy_quantity: 1, get_quantity: 1, ...soloProducto(1001) });
    const una = evaluarPromociones([dosPorUno], [linea(1001, 1, 12000)], ctx());
    const dos = evaluarPromociones([dosPorUno], [linea(1001, 1, 12000), linea(1001, 1, 12000)], ctx());
    expect(una.discountTotal).toBe(0);
    expect(dos.discountTotal).toBe(12000);
    expect(dos.lineDiscounts.filter((d) => d > 0)).toHaveLength(1);
  });
  it('el tope es de la cuenta, no de cada plato', () => {
    const r = evaluarPromociones(
      [promo({ discount_value: 50, max_discount_amount: 10000 })],
      [linea(1001, 1, 20000), linea(1002, 1, 20000)],
      ctx(),
    );
    expect(r.discountTotal).toBe(10000);
    expect(r.lineDiscounts).toEqual([5000, 5000]);
  });
  it('cambiosDescuentoMesa: solo líneas gestionadas y que cambian; respeta descuentos ajenos y pagados', () => {
    const p = promo({ discount_value: 10 });
    const lineas = [
      { id: 'a', quantity: 1, unit_price: 10000, discount_amount: 0, notes: {} },
      { id: 'b', quantity: 1, unit_price: 10000, discount_amount: 2500, notes: { origen: 'web' } }, // ajeno
      { id: 'c', quantity: 1, unit_price: 10000, discount_amount: 0, paid_amount: 4000, notes: {} }, // con abono
      { id: 'd', quantity: 1, unit_price: 10000, discount_amount: 1000, notes: { descuento_promocion: 1000, promociones: [p.id] } }, // ya al día
    ];
    expect(lineas.map(lineaMesaGestionada)).toEqual([true, false, false, true]);
    const r = evaluarPromociones([p], lineas.map((l) => linea(1001, l.quantity, l.unit_price)), ctx());
    expect(cambiosDescuentoMesa(lineas, r)).toEqual([{ sale_item_id: 'a', discount_amount: 1000, promotion_ids: [p.id] }]);
  });
  it('promocionesUsadas: solo las que quedaron en una línea con descuento de promoción', () => {
    const p = promo();
    const r = evaluarPromociones([p], [linea(1001, 1, 10000)], ctx());
    expect(promocionesUsadas(r, [1000])).toEqual([p.id]);
    expect(promocionesUsadas(r, [0])).toEqual([]);
  });
});

describe('H · categoría y variante (lo que la factura manual y las cotizaciones no enviaban)', () => {
  it('promoción por categoría aplica si la línea trae category_id; sin él, no', () => {
    const porCategoria = promo({ applies_to: 'categories', promotion_rules: [{ rule_type: 'include_category', product_id: null, category_id: 55 }] });
    expect(evaluarPromociones([porCategoria], [linea(1001, 1, 10000, { category_id: 55 })], ctx()).discountTotal).toBe(1000);
    expect(evaluarPromociones([porCategoria], [linea(1001, 1, 10000)], ctx()).discountTotal).toBe(0);
  });
  it('regla sobre el producto padre alcanza a la variante', () => {
    const sobrePadre = promo(soloProducto(500));
    expect(evaluarPromociones([sobrePadre], [linea(501, 1, 10000, { parent_product_id: 500 })], ctx()).discountTotal).toBe(1000);
  });
});

describe('vigencia general', () => {
  it('canal, fechas y activa', () => {
    expect(promocionVigente(promo({ applies_to_pos: false }), ctx())).toBe(false);
    expect(promocionVigente(promo({ start_date: '2026-12-01T00:00:00Z' }), ctx())).toBe(false);
    expect(promocionVigente(promo({ end_date: '2026-10-01T00:00:00Z' }), ctx())).toBe(false);
    expect(promocionVigente(promo({ is_active: false }), ctx())).toBe(false);
  });
  it('«Lleve X pague Y» no regala kilos', () => {
    const dosPorUno = promo({ promotion_type: 'buy_x_get_y', buy_quantity: 1, get_quantity: 1 });
    expect(evaluarPromociones([dosPorUno], [linea(1, 2.5, 18900, { sale_mode: 'weight' })], ctx()).discountTotal).toBe(0);
  });
  it('3x2 regala una de cada tres; 2x1 regala una de cada dos; compra 1 lleva 2 gratis sigue el grupo de tres', () => {
    expect(unidadesGratisCompraLleva(3, 3, 2)).toBe(1);
    expect(unidadesGratisCompraLleva(5, 3, 2)).toBe(1);
    expect(unidadesGratisCompraLleva(6, 3, 2)).toBe(2);
    expect(unidadesGratisCompraLleva(2, 2, 1)).toBe(1);
    expect(unidadesGratisCompraLleva(3, 1, 2)).toBe(2);
    const tresPorDos = promo({ promotion_type: 'buy_x_get_y', buy_quantity: 3, get_quantity: 2 });
    expect(evaluarPromociones([tresPorDos], [linea(1, 3, 10000)], ctx()).discountTotal).toBe(10000);
    const dosPorUno = promo({ promotion_type: 'buy_x_get_y', buy_quantity: 2, get_quantity: 1 });
    expect(evaluarPromociones([dosPorUno], [linea(1, 2, 10000)], ctx()).discountTotal).toBe(10000);
  });
  it('el paquete descuenta la diferencia contra el precio; sin precio, el porcentaje', () => {
    const paquete = promo({
      promotion_type: 'bundle',
      bundle_price: 15000,
      applies_to: 'products',
      promotion_rules: [
        { rule_type: 'include_product', product_id: 1, category_id: null },
        { rule_type: 'include_product', product_id: 2, category_id: null },
      ],
    });
    expect(evaluarPromociones([paquete], [linea(1, 1, 10000), linea(2, 1, 10000)], ctx()).discountTotal).toBe(5000);
    expect(evaluarPromociones([paquete], [linea(1, 1, 10000)], ctx()).discountTotal).toBe(0);
    const porcentaje = promo({ promotion_type: 'bundle', discount_value: 10, bundle_price: null });
    expect(evaluarPromociones([porcentaje], [linea(1, 1, 20000)], ctx()).discountTotal).toBe(2000);
  });
  it('la franja horaria se mide en la zona de la organización y puede cruzar la medianoche', () => {
    expect(promocionVigente(promo({ start_time: '18:00', end_time: '21:00' }), ctx())).toBe(true);
    expect(promocionVigente(promo({ start_time: '21:00', end_time: '22:00' }), ctx())).toBe(false);
    expect(promocionVigente(promo({ start_time: '22:00', end_time: '06:00' }), ctx())).toBe(false);
    expect(promocionVigente(promo({ start_time: '19:00', end_time: '02:00' }), ctx())).toBe(true);
  });
});

describe('cantidad mínima y compra mínima de las líneas que entran', () => {
  const fija = (extra: Partial<FilaPromocion> = {}) =>
    promo({
      promotion_type: 'fixed_amount',
      discount_value: 1000,
      min_purchase_amount: 8000,
      min_quantity: 2,
      ...soloProducto(1),
      ...extra,
    });

  it('un monto fijo de producto no se activa con otra línea de la cuenta', () => {
    expect(evaluarPromociones([fija()], [linea(1, 1, 4000)], ctx()).discountTotal).toBe(0);
    expect(evaluarPromociones([fija()], [linea(1, 2, 4000)], ctx()).discountTotal).toBe(1000);
    expect(evaluarPromociones([fija()], [linea(1, 1, 4000), linea(2, 1, 4000)], ctx()).discountTotal).toBe(0);
  });

  it('el porcentaje mide las mismas unidades y el mismo subtotal', () => {
    const diez = promo({
      promotion_type: 'percentage',
      discount_value: 10,
      min_purchase_amount: 8000,
      min_quantity: 2,
      ...soloProducto(1),
    });
    expect(evaluarPromociones([diez], [linea(1, 2, 4000)], ctx()).discountTotal).toBe(800);
    expect(evaluarPromociones([diez], [linea(1, 1, 4000), linea(2, 1, 4000)], ctx()).discountTotal).toBe(0);
  });

  it('dos líneas del mismo producto sí suman unidades y dinero', () => {
    expect(evaluarPromociones([fija()], [linea(1, 1, 4000), linea(1, 1, 4000)], ctx()).discountTotal).toBe(1000);
  });

  it('la compra mínima llega como texto y, en productos, no usa el resto de la cuenta', () => {
    const texto = promo({
      promotion_type: 'fixed_amount',
      discount_value: 1000,
      min_purchase_amount: '8000.00',
      ...soloProducto(1),
    });
    expect(evaluarPromociones([texto], [linea(1, 1, 4000), linea(2, 1, 4000)], ctx()).discountTotal).toBe(0);
    expect(evaluarPromociones([texto], [linea(1, 2, 4000)], ctx()).discountTotal).toBe(1000);
  });

  it('min_purchase_scope cart vuelve a medir toda la cuenta', () => {
    const toda = fija({ min_quantity: null, min_purchase_scope: 'cart' });
    expect(evaluarPromociones([toda], [linea(1, 1, 4000), linea(2, 1, 4000)], ctx()).discountTotal).toBe(1000);
  });

  it('una categoría compara solo sus líneas', () => {
    const porCategoria = promo({
      promotion_type: 'fixed_amount',
      discount_value: 1000,
      min_purchase_amount: 8000,
      applies_to: 'categories',
      promotion_rules: [{ rule_type: 'include_category', product_id: null, category_id: 55 }],
    });
    const dentro = linea(1, 1, 4000, { category_id: 55 });
    const fuera = linea(2, 1, 4000, { category_id: 9 });
    expect(evaluarPromociones([porCategoria], [dentro, linea(3, 1, 4000, { category_id: 55 })], ctx()).discountTotal).toBe(1000);
    expect(evaluarPromociones([porCategoria], [dentro, fuera], ctx()).discountTotal).toBe(0);
  });

  it('una unidad conserva el descuento si min_quantity está vacía aunque buy_quantity sea 2', () => {
    const sinMinimo = promo({
      promotion_type: 'fixed_amount',
      discount_value: 7000,
      buy_quantity: 2,
      get_quantity: 1,
      min_quantity: null,
      min_purchase_amount: 14000,
      ...soloProducto(1),
    });
    expect(evaluarPromociones([sinMinimo], [linea(1, 1, 14000)], ctx()).discountTotal).toBe(7000);
    expect(evaluarPromociones([sinMinimo], [linea(1, 2, 14000)], ctx()).discountTotal).toBe(7000);
  });

  it('min_quantity manda aunque buy_quantity traiga otro número', () => {
    const tres = promo({
      promotion_type: 'fixed_amount',
      discount_value: 1000,
      buy_quantity: 2,
      min_quantity: 3,
      ...soloProducto(1),
    });
    expect(evaluarPromociones([tres], [linea(1, 2, 4000)], ctx()).discountTotal).toBe(0);
    expect(evaluarPromociones([tres], [linea(1, 3, 4000)], ctx()).discountTotal).toBe(1000);
  });

  it('el porcentaje y el paquete tampoco leen buy_quantity como mínimo', () => {
    const diez = promo({
      promotion_type: 'percentage',
      discount_value: 10,
      buy_quantity: '2',
      min_quantity: null,
      ...soloProducto(1),
    });
    expect(evaluarPromociones([diez], [linea(1, 1, 10000)], ctx()).discountTotal).toBe(1000);
    expect(evaluarPromociones([diez], [linea(1, 2, 10000)], ctx()).discountTotal).toBe(2000);

    const paquete = promo({
      promotion_type: 'bundle',
      bundle_price: 3000,
      buy_quantity: 2,
      min_quantity: null,
      applies_to: 'products',
      promotion_rules: [{ rule_type: 'include_product', product_id: 1, category_id: null, quantity: 1 }],
    });
    expect(evaluarPromociones([paquete], [linea(1, 1, 4000)], ctx()).discountTotal).toBe(1000);
    expect(evaluarPromociones([paquete], [linea(1, 2, 4000)], ctx()).discountTotal).toBe(2000);
  });

  it('buy_quantity 1, 0 o vacío no inventa un mínimo', () => {
    for (const buy_quantity of [1, 0, null, '', '1', '1.9'] as const) {
      const fija = promo({
        promotion_type: 'fixed_amount',
        discount_value: 1000,
        buy_quantity,
        min_quantity: null,
        ...soloProducto(1),
      });
      expect(evaluarPromociones([fija], [linea(1, 1, 4000)], ctx()).discountTotal).toBe(1000);
    }
  });

  it('sin min_quantity una sola línea del producto ya descuenta y una ajena no entra', () => {
    const sinMinimo = promo({
      promotion_type: 'fixed_amount',
      discount_value: 1000,
      buy_quantity: 2,
      min_quantity: null,
      min_purchase_amount: 4000,
      ...soloProducto(1),
    });
    expect(evaluarPromociones([sinMinimo], [linea(1, 1, 4000)], ctx()).discountTotal).toBe(1000);
    expect(evaluarPromociones([sinMinimo], [linea(2, 5, 4000)], ctx()).discountTotal).toBe(0);
  });

  it('compra X lleva Y ignora la cantidad mínima', () => {
    const dosPorUno = promo({
      promotion_type: 'buy_x_get_y',
      buy_quantity: 2,
      get_quantity: 1,
      min_quantity: 99,
      ...soloProducto(1),
    });
    expect(evaluarPromociones([dosPorUno], [linea(1, 2, 4000)], ctx()).discountTotal).toBe(4000);
  });

  it('compra X lleva Y sigue tratando buy_quantity como la X', () => {
    const dosPorUno = promo({
      promotion_type: 'buy_x_get_y',
      buy_quantity: 2,
      get_quantity: 1,
      min_quantity: null,
      ...soloProducto(1),
    });
    expect(evaluarPromociones([dosPorUno], [linea(1, 1, 4000)], ctx()).discountTotal).toBe(0);
    expect(evaluarPromociones([dosPorUno], [linea(1, 2, 4000)], ctx()).discountTotal).toBe(4000);
  });
});

describe('repetir el descuento cada N unidades', () => {
  it('el monto fijo es floor(unidades/N) por el valor y se topa al subtotal', () => {
    const cadaDos = promo({
      promotion_type: 'fixed_amount',
      discount_value: 5000,
      repeat_every_quantity: 2,
      ...soloProducto(1),
    });
    expect(evaluarPromociones([cadaDos], [linea(1, 1, 4000)], ctx()).discountTotal).toBe(0);
    expect(evaluarPromociones([cadaDos], [linea(1, 2, 4000)], ctx()).discountTotal).toBe(5000);
    expect(evaluarPromociones([cadaDos], [linea(1, 3, 4000)], ctx()).discountTotal).toBe(5000);
    expect(evaluarPromociones([cadaDos], [linea(1, 4, 4000)], ctx()).discountTotal).toBe(10000);
    const caro = promo({
      promotion_type: 'fixed_amount',
      discount_value: 5000,
      repeat_every_quantity: 1,
      ...soloProducto(1),
    });
    expect(evaluarPromociones([caro], [linea(1, 1, 1000)], ctx()).discountTotal).toBe(1000);
  });

  it('un paquete con 20 % cada 3 descuenta 6 de 7 unidades y nada con 2; sin N, las 7', () => {
    const cadaTres = promo({
      promotion_type: 'bundle',
      discount_value: 20,
      bundle_price: null,
      repeat_every_quantity: 3,
    });
    const siete = evaluarPromociones([cadaTres], [linea(1, 7, 1000)], ctx());
    expect(siete.discountTotal).toBe(1200);
    expect(siete.lineDiscounts).toEqual([1200]);
    expect(evaluarPromociones([cadaTres], [linea(1, 2, 1000)], ctx()).discountTotal).toBe(0);
    const sinRepetir = promo({
      promotion_type: 'bundle',
      discount_value: 20,
      bundle_price: null,
      repeat_every_quantity: null,
    });
    expect(evaluarPromociones([sinRepetir], [linea(1, 7, 1000)], ctx()).discountTotal).toBe(1400);
  });

  it('un paquete con 20 % cada 2 descuenta las unidades pares y nada con una sola', () => {
    const cadaDos = promo({
      promotion_type: 'bundle',
      discount_value: 20,
      bundle_price: null,
      repeat_every_quantity: 2,
    });
    expect(evaluarPromociones([cadaDos], [linea(1, 1, 1000)], ctx()).discountTotal).toBe(0);
    expect(evaluarPromociones([cadaDos], [linea(1, 2, 1000)], ctx()).discountTotal).toBe(400);
    expect(evaluarPromociones([cadaDos], [linea(1, 4, 1000)], ctx()).discountTotal).toBe(800);
  });

  it('un paquete con precio y N limita los paquetes completos; sin N, todos', () => {
    const reglas = [{ rule_type: 'include_product', product_id: 1, category_id: null, quantity: 1 }];
    const conTope = promo({
      promotion_type: 'bundle',
      bundle_price: 8000,
      discount_value: 0,
      repeat_every_quantity: 3,
      applies_to: 'products',
      promotion_rules: reglas,
    });
    expect(evaluarPromociones([conTope], [linea(1, 7, 10000)], ctx()).discountTotal).toBe(4000);
    expect(evaluarPromociones([conTope], [linea(1, 2, 10000)], ctx()).discountTotal).toBe(0);
    const sinTope = promo({
      promotion_type: 'bundle',
      bundle_price: 8000,
      discount_value: 0,
      repeat_every_quantity: null,
      applies_to: 'products',
      promotion_rules: reglas,
    });
    expect(evaluarPromociones([sinTope], [linea(1, 7, 10000)], ctx()).discountTotal).toBe(14000);
  });

  it('el porcentaje solo cubre los grupos completos; el sobrante queda a precio normal', () => {
    const diez = promo({
      promotion_type: 'percentage',
      discount_value: 10,
      repeat_every_quantity: 2,
      ...soloProducto(1),
    });
    const tres = evaluarPromociones([diez], [linea(1, 2, 4000), linea(1, 1, 4000)], ctx());
    expect(tres.discountTotal).toBe(800);
    expect(tres.lineDiscounts).toEqual([800, 0]);
  });

  it('si no llega a la cantidad mínima, no repite aunque haya un grupo', () => {
    const cadaDos = promo({
      promotion_type: 'fixed_amount',
      discount_value: 5000,
      min_quantity: 4,
      repeat_every_quantity: 2,
      ...soloProducto(1),
    });
    expect(evaluarPromociones([cadaDos], [linea(1, 3, 4000)], ctx()).discountTotal).toBe(0);
    expect(evaluarPromociones([cadaDos], [linea(1, 4, 4000)], ctx()).discountTotal).toBe(10000);
  });
});

describe('precio de paquete por cada grupo completo', () => {
  const par = promo({
    promotion_type: 'bundle',
    bundle_price: 7000,
    applies_to: 'products',
    promotion_rules: [{ rule_type: 'include_product', product_id: 1, category_id: null, quantity: 2 }],
  });

  it('cobra el precio por cada par y el sobrante a precio normal', () => {
    expect(evaluarPromociones([par], [linea(1, 1, 4000)], ctx()).discountTotal).toBe(0);
    expect(evaluarPromociones([par], [linea(1, 2, 4000)], ctx()).discountTotal).toBe(1000);
    expect(evaluarPromociones([par], [linea(1, 3, 4000)], ctx()).discountTotal).toBe(1000);
    expect(evaluarPromociones([par], [linea(1, 4, 4000)], ctx()).discountTotal).toBe(2000);
    const tres = evaluarPromociones([par], [linea(1, 2, 4000), linea(1, 1, 4000)], ctx());
    expect(tres.lineDiscounts).toEqual([1000, 0]);
  });

  it('sin productos incluidos no aplica el precio a toda la cuenta', () => {
    const suelto = promo({ promotion_type: 'bundle', bundle_price: 7000, applies_to: 'all' });
    expect(evaluarPromociones([suelto], [linea(1, 2, 4000)], ctx()).discountTotal).toBe(0);
  });

  it('dos reglas del mismo producto usan la cantidad mayor', () => {
    const doble = promo({
      promotion_type: 'bundle',
      bundle_price: 7000,
      applies_to: 'products',
      promotion_rules: [
        { rule_type: 'include_product', product_id: 1, category_id: null, quantity: 1 },
        { rule_type: 'include_product', product_id: 1, category_id: null, quantity: 2 },
      ],
    });
    expect(evaluarPromociones([doble], [linea(1, 2, 4000)], ctx()).discountTotal).toBe(1000);
  });

  it('una variante cuenta para el padre y no se reparte entre el padre y ella misma', () => {
    const soloPadre = promo({
      promotion_type: 'bundle',
      bundle_price: 7000,
      applies_to: 'products',
      promotion_rules: [{ rule_type: 'include_product', product_id: 500, category_id: null, quantity: 2 }],
    });
    const variantes = [linea(501, 1, 4000, { parent_product_id: 500 }), linea(502, 1, 4000, { parent_product_id: 500 })];
    expect(evaluarPromociones([soloPadre], variantes, ctx()).discountTotal).toBe(1000);

    const padreYVariante = promo({
      promotion_type: 'bundle',
      bundle_price: 7000,
      applies_to: 'products',
      promotion_rules: [
        { rule_type: 'include_product', product_id: 500, category_id: null, quantity: 1 },
        { rule_type: 'include_product', product_id: 501, category_id: null, quantity: 1 },
      ],
    });
    expect(evaluarPromociones([padreYVariante], [linea(501, 1, 4000, { parent_product_id: 500 })], ctx()).discountTotal).toBe(0);
  });
});

describe('exclusividad por líneas que se solapan', () => {
  const cuenta = [linea(1, 1, 10000), linea(2, 1, 10000)];

  it('dos no combinables sobre productos distintos se aplican las dos', () => {
    const a = promo({ discount_value: 10, ...soloProducto(1) });
    const b = promo({ discount_value: 10, ...soloProducto(2) });
    const r = evaluarPromociones([a, b], cuenta, ctx());
    expect(r.lineDiscounts).toEqual([1000, 1000]);
    expect(r.discountTotal).toBe(2000);
    expect(r.applied.map((x) => x.promotion_id).sort()).toEqual([a.id, b.id].sort());
    expect(r.itemDiscounts).toEqual({ 1: 1000, 2: 1000 });
  });

  it('dos no combinables sobre el mismo producto: sigue una sola', () => {
    const chica = promo({ discount_value: 10, priority: 0, ...soloProducto(1) });
    const grande = promo({ discount_value: 20, priority: 0, ...soloProducto(1) });
    const r = evaluarPromociones([chica, grande], [linea(1, 1, 10000), linea(2, 1, 10000)], ctx());
    expect(r.applied.map((x) => x.promotion_id)).toEqual([grande.id]);
    expect(r.lineDiscounts).toEqual([2000, 0]);
  });

  it('una promoción de cuenta sigue compitiendo con todas, como antes', () => {
    const deCuenta = promo({ discount_value: 15, applies_to: 'all', promotion_rules: [] });
    const a = promo({ discount_value: 10, ...soloProducto(1) });
    const b = promo({ discount_value: 10, ...soloProducto(2) });
    const r = evaluarPromociones([deCuenta, a, b], cuenta, ctx());
    expect(r.discountTotal).toBe(3000);
    expect(r.applied.map((x) => x.promotion_id)).toEqual([deCuenta.id]);
  });

  it('compra mínima de toda la cuenta también une a las de producto', () => {
    const deCuenta = promo({ discount_value: 5, min_purchase_scope: 'cart', ...soloProducto(1) });
    const otra = promo({ discount_value: 10, ...soloProducto(2) });
    const r = evaluarPromociones([deCuenta, otra], cuenta, ctx());
    // 5 % de A = 500, 10 % de B = 1000. Comparten grupo porque la mínima es de la cuenta.
    expect(r.applied.map((x) => x.promotion_id)).toEqual([otra.id]);
    expect(r.lineDiscounts).toEqual([0, 1000]);
  });

  it('con prioridad 0 gana la que más descuenta, igual que antes', () => {
    const porcentaje = promo({ discount_value: 10, priority: 0, ...soloProducto(1) });
    const fija = promo({ promotion_type: 'fixed_amount', discount_value: 500, priority: 0, ...soloProducto(1) });
    const r = evaluarPromociones([porcentaje, fija], [linea(1, 1, 2000)], ctx());
    expect(r.discountTotal).toBe(500);
    expect(r.applied.map((x) => x.promotion_id)).toEqual([fija.id]);
  });
});

describe('la prioridad gana entre no combinables que compiten', () => {
  it('prioridad 10 gana aunque descuente menos', () => {
    const porcentaje = promo({ discount_value: 10, priority: 10, ...soloProducto(1) });
    const fija = promo({ promotion_type: 'fixed_amount', discount_value: 500, priority: 0, ...soloProducto(1) });
    const r = evaluarPromociones([fija, porcentaje], [linea(1, 1, 2000)], ctx());
    expect(r.discountTotal).toBe(200);
    expect(r.applied.map((x) => x.promotion_id)).toEqual([porcentaje.id]);
  });

  it('prioridades iguales: gana la que más descuenta', () => {
    const porcentaje = promo({ discount_value: 10, priority: 4, ...soloProducto(1) });
    const fija = promo({ promotion_type: 'fixed_amount', discount_value: 500, priority: 4, ...soloProducto(1) });
    const r = evaluarPromociones([porcentaje, fija], [linea(1, 1, 2000)], ctx());
    expect(r.discountTotal).toBe(500);
    expect(r.applied[0].promotion_id).toBe(fija.id);
  });

  it('mismo monto: gana la más antigua, en cualquier orden de llegada', () => {
    const nueva = promo({ discount_value: 10, priority: 3, created_at: '2026-06-01T00:00:00Z', ...soloProducto(1) });
    const vieja = promo({ discount_value: 10, priority: 3, created_at: '2026-01-01T00:00:00Z', ...soloProducto(1) });
    expect(evaluarPromociones([nueva, vieja], [linea(1, 1, 2000)], ctx()).applied[0].promotion_id).toBe(vieja.id);
    expect(evaluarPromociones([vieja, nueva], [linea(1, 1, 2000)], ctx()).applied[0].promotion_id).toBe(vieja.id);
  });

  it('la ganadora sigue compitiendo contra la suma de las combinables del mismo producto', () => {
    const sola = promo({ discount_value: 15, priority: 9, ...soloProducto(1) });
    const c1 = promo({ is_combinable: true, discount_value: 10, ...soloProducto(1) });
    const c2 = promo({ is_combinable: true, discount_value: 10, ...soloProducto(1) });
    const r = evaluarPromociones([sola, c1, c2], [linea(1, 1, 10000)], ctx());
    expect(r.discountTotal).toBe(2000);
    expect(r.applied.map((x) => x.promotion_id).sort()).toEqual([c1.id, c2.id].sort());
  });
});

describe('quitar la promoción de una línea', () => {
  it('la línea excluida queda a precio completo y no suma la promoción', () => {
    const p = promo({ discount_value: 10, ...soloProducto(1) });
    const r = evaluarPromociones([p], [linea(1, 1, 10000, { promo_excluded: true }), linea(2, 1, 10000)], ctx());
    expect(r.lineDiscounts).toEqual([0, 0]);
    expect(r.discountTotal).toBe(0);
    expect(r.applied).toEqual([]);
    expect(promocionesUsadas(r, [0, 0])).toEqual([]);
  });

  it('la línea sin flag calcula igual que hoy', () => {
    const p = promo({ discount_value: 10 });
    const r = evaluarPromociones([p], [linea(1, 1, 10000), linea(2, 1, 10000, { promo_excluded: true })], ctx());
    expect(r.lineDiscounts).toEqual([1000, 0]);
    expect(r.discountTotal).toBe(1000);
  });

  it('no cuenta para la compra mínima ni para el 2x1', () => {
    const minima = promo({ min_purchase_amount: 15000 });
    expect(evaluarPromociones([minima], [linea(1, 1, 10000), linea(2, 1, 10000, { promo_excluded: true })], ctx()).discountTotal).toBe(0);
    const dosPorUno = promo({ promotion_type: 'buy_x_get_y', buy_quantity: 1, get_quantity: 1, ...soloProducto(1) });
    const r = evaluarPromociones(
      [dosPorUno],
      [linea(1, 1, 12000), linea(1, 1, 12000, { promo_excluded: true })],
      ctx(),
    );
    expect(r.discountTotal).toBe(0);
  });

  it('combinarDescuentos: en 0 no vuelve la promoción; el manual sí queda', () => {
    const sinPromo = combinarDescuentos(
      [{ quantity: 1, unit_price: 10000, promo_excluded: true, manual_discount_amount: null, promo_discount_amount: 0 }],
      [1000],
    );
    expect(sinPromo[0]).toMatchObject({ discount_amount: 0, promo_discount_amount: 0 });
    const conManual = combinarDescuentos(
      [{ quantity: 1, unit_price: 10000, promo_excluded: true, manual_discount_amount: 400 }],
      [1000],
    );
    expect(conManual[0]).toMatchObject({ discount_amount: 400, promo_discount_amount: 0, manual_discount_amount: 400 });
  });

  it('restaurar (sin el flag) vuelve a aplicar la promoción', () => {
    const p = promo({ discount_value: 10 });
    expect(evaluarPromociones([p], [linea(1, 1, 10000)], ctx()).discountTotal).toBe(1000);
  });

  it('en la mesa el flag se mantiene: la línea excluida no se redescuenta al agregar otro plato', () => {
    const p = promo({ discount_value: 10, applies_to: 'all' });
    const lineasEval = [linea(1, 1, 10000, { promo_excluded: true }), linea(2, 1, 8000)];
    const r = evaluarPromociones([p], lineasEval, ctx());
    expect(r.lineDiscounts).toEqual([0, 800]);
    const cuenta = [
      { id: 'excluida', quantity: 1, unit_price: 10000, discount_amount: 1000, promo_excluded: true, notes: { descuento_promocion: 1000, promociones: [p.id] } },
      { id: 'nueva', quantity: 1, unit_price: 8000, discount_amount: 0, notes: {} },
    ];
    expect(cambiosDescuentoMesa(cuenta, r)).toEqual([
      { sale_item_id: 'excluida', discount_amount: 0, promotion_ids: [] },
      { sale_item_id: 'nueva', discount_amount: 800, promotion_ids: [p.id] },
    ]);
  });
});
