/// <reference types="jest" />
/**
 * Reproduce, con los datos EXACTOS de producción, el caso que un cliente
 * reportó en video el 2026-09-10: promoción "Lunes a Miercoles" de la
 * organización 142 (un bar de cócteles), monto fijo $8.000, solo jueves, sobre
 * el producto 51554 (EXTRAGRANDE GRANI CON LICOR, variante del 51491).
 * Al añadir ese producto al POS un jueves, no aparecía el descuento.
 *
 * Se mockea únicamente la consulta a Supabase con la fila tal y como la
 * devuelve PostgREST (verificada con execute_sql); el resto del motor corre
 * de verdad. Si este test pasa, el motor es correcto y el fallo está fuera.
 */

// Fila real de `promotions` con su embed de `promotion_rules`.
const FILA_REAL = {
  id: '11111111-1111-1111-1111-111111111111',
  organization_id: 142,
  name: 'Lunes a Miercoles',
  description: null,
  promotion_type: 'fixed_amount',
  discount_value: '8000.00', // numeric llega como texto desde PostgREST
  buy_quantity: null,
  get_quantity: null,
  min_purchase_amount: null,
  max_discount_amount: null,
  applies_to: 'products',
  start_date: '2026-09-10T00:00:00+00:00',
  end_date: null,
  is_active: true,
  usage_limit: null,
  usage_count: 0,
  is_combinable: false,
  priority: 0,
  branches: null,
  applies_to_web: true,
  applies_to_pos: true,
  applies_to_finances: false,
  applicable_days: ['thursday'],
  promotion_rules: [
    { id: 'r1', rule_type: 'include_product', product_id: 51554, category_id: null, created_at: '2026-09-10T22:26:08Z' },
  ],
};

// Constructor encadenable que devuelve la fila real al final.
function makeQuery(rows: unknown[]) {
  const q: any = {};
  for (const m of ['select', 'eq', 'lte', 'order', 'gte', 'or', 'in']) q[m] = () => q;
  q.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
  return q;
}

// Filas que devuelve la "base" en cada test; se puede cambiar por caso.
let filasMock: unknown[] = [FILA_REAL];

jest.mock('@/lib/supabase/config', () => ({
  supabase: { from: () => makeQuery(filasMock) },
}));

import { promotionEngine } from '../promotionEngine';

// Jueves 10 de septiembre de 2026, 17:27 hora de Colombia (hora del video).
const JUEVES_1727_COL = new Date('2026-09-10T22:27:00Z');

describe('motor de promociones — caso real del cliente (org 142)', () => {
  beforeEach(() => { filasMock = [FILA_REAL]; });

  it('aplica los $8.000 al producto 51554 un jueves', async () => {
    const res = await promotionEngine.evaluate({
      channel: 'pos',
      organization_id: 142,
      branch_id: 1,
      date: JUEVES_1727_COL,
      items: [{ product_id: 51554, category_id: undefined, quantity: 1, unit_price: 20000 }],
    });

    expect(res.discountTotal).toBe(8000);
    expect(res.itemDiscounts[51554]).toBe(8000);
    expect(res.applied).toHaveLength(1);
  });

  it('una regla sobre la VARIANTE no alcanza al PADRE (el padre no es la variante)', async () => {
    const res = await promotionEngine.evaluate({
      channel: 'pos',
      organization_id: 142,
      branch_id: 1,
      date: JUEVES_1727_COL,
      items: [{ product_id: 51491, category_id: undefined, quantity: 1, unit_price: 20000 }],
    });
    expect(res.discountTotal).toBe(0);
  });

  it('una regla sobre el PADRE (51491) SÍ alcanza a su variante (51554) en el carrito', async () => {
    // Misma promoción pero definida sobre el padre "GRANI CON LICOR".
    const conReglaPadre = {
      ...FILA_REAL,
      promotion_rules: [{ ...FILA_REAL.promotion_rules[0], product_id: 51491 }],
    };
    filasMock = [conReglaPadre];

    const res = await promotionEngine.evaluate({
      channel: 'pos',
      organization_id: 142,
      branch_id: 1,
      date: JUEVES_1727_COL,
      // El POS manda la variante con su parent_product_id.
      items: [{ product_id: 51554, parent_product_id: 51491, category_id: undefined, quantity: 1, unit_price: 20000 }],
    });
    expect(res.discountTotal).toBe(8000);
    expect(res.itemDiscounts[51554]).toBe(8000);
  });

  it('NO aplica si el id llega como texto ("51554") — comparación estricta', async () => {
    const res = await promotionEngine.evaluate({
      channel: 'pos',
      organization_id: 142,
      branch_id: 1,
      date: JUEVES_1727_COL,
      items: [{ product_id: '51554' as unknown as number, category_id: undefined, quantity: 1, unit_price: 20000 }],
    });
    expect(res.discountTotal).toBe(0);
  });

  it('NO aplica un miércoles (el día guardado es solo jueves)', async () => {
    const res = await promotionEngine.evaluate({
      channel: 'pos',
      organization_id: 142,
      branch_id: 1,
      date: new Date('2026-09-09T22:27:00Z'),
      items: [{ product_id: 51554, category_id: undefined, quantity: 1, unit_price: 20000 }],
    });
    expect(res.discountTotal).toBe(0);
  });
});
