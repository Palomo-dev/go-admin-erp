/**
 * Promociones en el POS (mostrador y mesas) con el motor REAL: solo se simula
 * Supabase. Cada caso reproduce una falla del diagnóstico de 2026-10-07 y
 * falla con el código anterior:
 *
 *   A. no combinables: se tomaba la de mayor prioridad aunque no tocara la cuenta;
 *   B. usage_limit ignorado;
 *   C. día de la semana con `getDay()` del reloj del proceso;
 *   D. branches como texto no alcanzaban a la sucursal;
 *   E. el descuento de promoción quedaba pegado al cambiar el carrito;
 *   F. mismo producto en dos líneas: cada una llevaba la suma (descuento doble);
 *   G. mesas: se evaluaba plato por plato y el cobro no sumaba el uso;
 *   H. un llamador de servidor no podía pasar su cliente (leía 0 promociones).
 *
 * Datos ficticios: org 120, sucursal 7, zona America/Bogota.
 */
import { createFakeSupabase, type FakeOp } from '@/lib/offline/__tests__/fakeSupabase';

const fake = createFakeSupabase(() => ({ data: null }));

jest.mock('@/lib/supabase/config', () => ({ supabase: fake.client }));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
  getCurrentBranchIdWithFallback: () => 7,
  getCurrentUserId: async () => 'user-cajero',
}));
jest.mock('@/lib/pos/display/posDisplay', () => ({
  getPosDisplayEmitter: () => ({ onCartsSaved: () => undefined, setMode: () => undefined, setTotals: () => undefined }),
}));
jest.mock('@/lib/utils/offlineCache', () => ({ isAppOnline: jest.fn(() => true) }));

import { promotionEngine } from '@/lib/services/promotionEngine';
import { POSService } from '@/lib/services/posService';
import { PedidosService } from '@/components/pos/mesas/id/pedidosService';
import { almacen, carrito, guardarCarritos, instalarAlmacen, leerCarritos, linea } from '../venta/utilesServicio';

// ── Base simulada ────────────────────────────────────────────────────────────
let promociones: Array<Record<string, unknown>> = [];
let lineasMesa: Array<Record<string, unknown>> = [];
const productos: Record<number, { category_id: number | null; parent_product_id: number | null; sale_mode: string }> = {};

function manejador(op: FakeOp) {
  if (op.table === 'promotions') return { data: promociones };
  if (op.table === 'organizations') return { data: { timezone: 'America/Bogota' } };
  if (op.table === 'organization_settings') return { data: null };
  if (op.table === 'products') {
    const ids = (op.filters.id as number[]) ?? [];
    return { data: ids.filter((id) => productos[id]).map((id) => ({ id, ...productos[id] })) };
  }
  if (op.table === 'sales') return { data: { id: 'venta-mesa', organization_id: 120, branch_id: 7, status: 'pending' } };
  if (op.table === 'sale_items') return { data: lineasMesa };
  return { data: null };
}

let n = 0;
function promo(extra: Record<string, unknown> = {}): Record<string, unknown> {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    organization_id: 120,
    name: `Promo ${n}`,
    promotion_type: 'percentage',
    discount_value: '10.00',
    applies_to: 'all',
    start_date: '2026-01-01T00:00:00+00:00',
    end_date: null,
    is_active: true,
    usage_limit: null,
    usage_count: 0,
    is_combinable: false,
    priority: 0,
    created_at: '2026-01-01T00:00:00+00:00',
    branches: null,
    applicable_days: null,
    applies_to_pos: true,
    applies_to_web: true,
    applies_to_finances: true,
    promotion_rules: [],
    ...extra,
  };
}
const soloProducto = (productId: number) => ({
  applies_to: 'products',
  promotion_rules: [{ id: `r-${productId}`, rule_type: 'include_product', product_id: productId, category_id: null }],
});

// Miércoles 7 de octubre de 2026, 20:00 en Bogotá = jueves 01:00 UTC.
const MIERCOLES_20_BOGOTA = new Date('2026-10-08T01:00:00.000Z');
const evaluar = (items: Array<{ product_id: number; quantity: number; unit_price: number }>, extra: Record<string, unknown> = {}) =>
  promotionEngine.evaluate({
    channel: 'pos',
    organization_id: 120,
    branch_id: 7,
    date: MIERCOLES_20_BOGOTA,
    items: items.map((i) => ({ ...i, category_id: null, parent_product_id: null, sale_mode: 'unit' })),
    ...extra,
  });

beforeAll(() => instalarAlmacen());
beforeEach(() => {
  fake.reset();
  fake.setHandler(manejador);
  promociones = [];
  lineasMesa = [];
  almacen.clear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(POSService, 'getProductTaxes').mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

// ── Motor (promotionEngine.evaluate) ─────────────────────────────────────────

describe('A · 8 no combinables y solo una toca la cuenta', () => {
  it('aplica la que toca la cuenta, no la de mayor prioridad', async () => {
    const ajenas = Array.from({ length: 7 }, (_, i) => promo({ priority: 20 - i, ...soloProducto(9000 + i) }));
    const laQueAplica = promo({ priority: 1, discount_value: '15', ...soloProducto(1001) });
    promociones = [...ajenas, laQueAplica];
    const r = await evaluar([{ product_id: 1001, quantity: 1, unit_price: 20000 }]);
    expect(r.discountTotal).toBe(3000);
    expect(r.applied.map((a) => a.promotion_id)).toEqual([laQueAplica.id]);
  });
});

describe('B · límite de usos agotado', () => {
  it('no se aplica', async () => {
    promociones = [promo({ usage_limit: 3, usage_count: 3 })];
    expect((await evaluar([{ product_id: 1001, quantity: 1, unit_price: 10000 }])).discountTotal).toBe(0);
  });
});

describe('C · miércoles 20:00 en Bogotá con el proceso en UTC', () => {
  it('la promoción «solo miércoles» aplica y la «solo jueves» no', async () => {
    promociones = [promo({ applicable_days: ['wednesday'] })];
    expect((await evaluar([{ product_id: 1001, quantity: 1, unit_price: 10000 }])).discountTotal).toBe(1000);
    promociones = [promo({ applicable_days: ['thursday'] })];
    expect((await evaluar([{ product_id: 1001, quantity: 1, unit_price: 10000 }])).discountTotal).toBe(0);
  });
});

describe('D · branches guardado como texto', () => {
  it('["7"] alcanza a la sucursal 7', async () => {
    promociones = [promo({ branches: ['7'] })];
    expect((await evaluar([{ product_id: 1001, quantity: 1, unit_price: 10000 }])).discountTotal).toBe(1000);
  });
});

describe('H · el llamador de servidor pasa su propio cliente', () => {
  it('con `db` lee las promociones de ESE cliente, no del cliente de navegador', async () => {
    const servidor = createFakeSupabase((op) => (op.table === 'promotions' ? { data: [promo()] } : op.table === 'organizations' ? { data: { timezone: 'America/Bogota' } } : { data: null }));
    promociones = []; // el cliente de navegador no ve nada (sin sesión)
    const r = await evaluar([{ product_id: 1001, quantity: 1, unit_price: 10000 }], { db: servidor.client });
    expect(r.discountTotal).toBe(1000);
    expect(fake.ops.filter((o) => o.table === 'promotions')).toHaveLength(0);
  });

  it('completa categoría y padre desde products de la organización (factura manual, cotizaciones)', async () => {
    productos[3001] = { category_id: 55, parent_product_id: 3000, sale_mode: 'unit' };
    promociones = [promo({ applies_to: 'categories', promotion_rules: [{ id: 'r', rule_type: 'include_category', product_id: null, category_id: 55 }] })];
    const r = await promotionEngine.evaluate({
      channel: 'finances',
      organization_id: 120,
      branch_id: 7,
      date: MIERCOLES_20_BOGOTA,
      items: [{ product_id: 3001, quantity: 1, unit_price: 10000 }],
    });
    expect(r.lineDiscounts).toEqual([1000]);
    const consulta = fake.ops.find((o) => o.table === 'products');
    expect(consulta?.filters).toMatchObject({ organization_id: 120, id: [3001] });
  });
});

// ── Mostrador (POSService) ───────────────────────────────────────────────────

describe('E · mostrador: el descuento de promoción se recalcula en cada cambio', () => {
  beforeEach(() => {
    promociones = [promo({ min_purchase_amount: '50000' })];
  });

  it('subir y bajar la cantidad con compra mínima pone y QUITA el descuento', async () => {
    guardarCarritos([carrito('cart-1', { items: [linea('l1', { quantity: 1, unit_price: 30000, total: 30000 })] })]);
    let cart = await POSService.updateCartItemQuantity('cart-1', 'l1', 2);
    expect(cart.items[0].discount_amount).toBe(6000);
    cart = await POSService.updateCartItemQuantity('cart-1', 'l1', 1);
    expect(cart.items[0].discount_amount).toBe(0);
    expect(cart.discount_total).toBe(0);
    expect(leerCarritos()[0].items[0].discount_amount).toBe(0);
  });

  it('quitar una línea recalcula: la otra deja de cumplir la compra mínima', async () => {
    guardarCarritos([carrito('cart-1', { items: [
      linea('l1', { quantity: 1, unit_price: 30000, total: 30000 }),
      linea('l2', { product_id: 1002, quantity: 1, unit_price: 30000, total: 30000 }),
    ] })]);
    let cart = await POSService.updateCartItemQuantity('cart-1', 'l1', 1);
    expect(cart.items.map((i) => i.discount_amount)).toEqual([3000, 3000]);
    cart = await POSService.removeItemFromCart('cart-1', 'l2');
    expect(cart.items.map((i) => i.discount_amount)).toEqual([0]);
  });

  it('el descuento manual del cajero no se pisa al cambiar la cantidad', async () => {
    guardarCarritos([carrito('cart-1', { items: [linea('l1', { quantity: 2, unit_price: 30000, total: 60000 })] })]);
    await POSService.updateCartItemDiscount('cart-1', 'l1', 1000);
    const cart = await POSService.updateCartItemQuantity('cart-1', 'l1', 3);
    expect(cart.items[0].discount_amount).toBe(1000);
    expect(cart.items[0].manual_discount_amount).toBe(1000);
  });

  it('2x1 agregado de uno en uno en el mostrador', async () => {
    promociones = [promo({ promotion_type: 'buy_x_get_y', buy_quantity: 1, get_quantity: 1, ...soloProducto(1001) })];
    const producto = { id: 1001, name: 'Hamburguesa', sku: 'H1', sale_mode: 'unit', category_id: null, parent_product_id: null } as never;
    guardarCarritos([carrito('cart-1', { items: [linea('l1', { quantity: 1, unit_price: 12000, total: 12000, product: producto })] })]);
    let cart = await POSService.addItemToCart('cart-1', producto, 1);
    expect(cart.items[0].discount_amount).toBe(12000);
    cart = await POSService.addItemToCart('cart-1', producto, 1);
    expect(cart.items[0].discount_amount).toBe(12000);
    cart = await POSService.addItemToCart('cart-1', producto, 1);
    expect(cart.items[0].discount_amount).toBe(24000);
  });
});

describe('F · mismo producto en dos líneas', () => {
  it('cada línea lleva su descuento, no la suma del producto', async () => {
    promociones = [promo()];
    guardarCarritos([carrito('cart-1', { items: [
      linea('l1', { quantity: 1, unit_price: 10000, total: 10000 }),
      linea('l2', { quantity: 2, unit_price: 10000, total: 20000, notes: 'sin cebolla' }),
    ] })]);
    const cart = await POSService.updateCartItemQuantity('cart-1', 'l1', 1);
    expect(cart.items.map((i) => i.discount_amount)).toEqual([1000, 2000]);
    expect(cart.discount_total).toBe(3000);
  });
});

// ── Mesas (PedidosService) ───────────────────────────────────────────────────

function lineaMesa(id: string, productId: number, quantity: number, unitPrice: number, extra: Record<string, unknown> = {}) {
  return {
    id, product_id: productId, quantity: String(quantity), unit_price: String(unitPrice), discount_amount: '0.00',
    paid_amount: '0', paid_at: null, notes: { product_name: `Plato ${productId}` }, created_at: `2026-10-07T20:0${id.length}:00Z`,
    product: { category_id: null, parent_product_id: null, sale_mode: 'unit' },
    ...extra,
  };
}
const aplicadas = () =>
  fake.ops.filter((o) => o.table === 'rpc:pos_mesa_aplicar_promociones').map((o) => (o.payload as { p_lineas: unknown }).p_lineas);

describe('G · mesa: se evalúa la cuenta completa', () => {
  it('dos platos que juntos superan la compra mínima', async () => {
    promociones = [promo({ min_purchase_amount: '50000' })];
    lineasMesa = [lineaMesa('a', 1001, 1, 30000), lineaMesa('b', 1002, 1, 30000)];
    await PedidosService.recalcularPromocionesMesa('venta-mesa');
    const ids = [promociones[0].id];
    expect(aplicadas()).toEqual([[
      { sale_item_id: 'a', discount_amount: 3000, promotion_ids: ids },
      { sale_item_id: 'b', discount_amount: 3000, promotion_ids: ids },
    ]]);
  });

  it('monto fijo en una mesa con tres platos: un solo monto repartido', async () => {
    promociones = [promo({ promotion_type: 'fixed_amount', discount_value: '9000' })];
    lineasMesa = [lineaMesa('a', 1001, 1, 10000), lineaMesa('b', 1002, 1, 20000), lineaMesa('c', 1003, 1, 30000)];
    await PedidosService.recalcularPromocionesMesa('venta-mesa');
    const [lineas] = aplicadas() as Array<Array<{ discount_amount: number }>>;
    expect(lineas.map((l) => l.discount_amount)).toEqual([1500, 3000, 4500]);
  });

  it('2x1 con los platos agregados de uno en uno', async () => {
    promociones = [promo({ promotion_type: 'buy_x_get_y', buy_quantity: 1, get_quantity: 1, ...soloProducto(1001) })];
    lineasMesa = [lineaMesa('a', 1001, 1, 12000), lineaMesa('b', 1001, 1, 12000)];
    await PedidosService.recalcularPromocionesMesa('venta-mesa');
    const [lineas] = aplicadas() as Array<Array<{ discount_amount: number }>>;
    expect(lineas.map((l) => l.discount_amount)).toEqual([12000]);
  });

  it('al bajar de la compra mínima, el descuento se quita; el de un pedido web se respeta', async () => {
    const p = promo({ min_purchase_amount: '50000' });
    promociones = [p];
    lineasMesa = [
      lineaMesa('a', 1001, 1, 30000, { discount_amount: '3000.00', notes: { descuento_promocion: 3000, promociones: [p.id] } }),
      lineaMesa('w', 1002, 1, 10000, { discount_amount: '2000.00', notes: { origen: 'web' } }),
    ];
    await PedidosService.recalcularPromocionesMesa('venta-mesa');
    expect(aplicadas()).toEqual([[{ sale_item_id: 'a', discount_amount: 0, promotion_ids: [] }]]);
  });

  it('al cobrar se envían las promociones que quedaron en las líneas', async () => {
    lineasMesa = [
      lineaMesa('a', 1001, 1, 30000, { notes: { promociones: ['p-1'] } }),
      lineaMesa('b', 1002, 1, 30000, { notes: { promociones: ['p-1', 'p-2'] } }),
      lineaMesa('x', 1003, 0, 30000, { notes: { promociones: ['p-3'] } }),
    ];
    expect((await PedidosService.promocionesDeLaCuenta('venta-mesa')).sort()).toEqual(['p-1', 'p-2']);
  });
});
