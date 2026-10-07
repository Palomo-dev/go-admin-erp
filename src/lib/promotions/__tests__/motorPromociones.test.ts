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
});
