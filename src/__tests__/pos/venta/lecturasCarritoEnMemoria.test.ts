/**
 * Carrito del mostrador: impuestos y promociones en memoria corta.
 *
 * Medido en producción (celular, 2026-11-24): cada «+» hacía en fila
 * `promotions` → `organization_taxes` → `product_tax_relations` por cada línea
 * (cerca de medio segundo con dos líneas; con diez, casi dos). Ahora el carrito
 * reutiliza lo leído hace poco (`src/lib/pos/venta/memoriaCorta.ts`).
 *
 * Estas pruebas fijan las dos caras: que los viajes bajan, y que el dinero sale
 * igual —mismo impuesto, mismo total— y nunca se cobra con un dato que en
 * realidad fue un error de lectura.
 *
 * Datos inventados: organización 120, sucursal 7.
 */
const mockTablas: Record<string, { data: unknown; error: unknown }> = {};
const mockLecturas: Record<string, number> = {};
jest.mock('@/lib/supabase/config', () => {
  const tabla = (nombre: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'neq', 'gt', 'gte', 'lte', 'or', 'not', 'range', 'abortSignal']) chain[m] = () => chain;
    const respuesta = () => {
      mockLecturas[nombre] = (mockLecturas[nombre] ?? 0) + 1;
      return mockTablas[nombre] ?? { data: [], error: null };
    };
    chain.maybeSingle = () => Promise.resolve(respuesta());
    chain.single = () => Promise.resolve(respuesta());
    chain.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(respuesta()).then(ok, ko);
    return chain;
  };
  return { supabase: { from: tabla } };
});
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
  getCurrentBranchIdWithFallback: () => 7,
  getCurrentUserId: () => 'user-1',
}));
jest.mock('@/lib/pos/display/posDisplay', () => ({
  getPosDisplayEmitter: () => ({ onCartsSaved: () => undefined, setMode: () => undefined, setTotals: () => undefined }),
}));
jest.mock('@/lib/services/organizationTimezoneService', () => ({ getOrganizationTimezone: async () => 'America/Bogota' }));

import { POSService } from '@/lib/services/posService';
import { olvidarPromocionesEnMemoria, VIGENCIA_PROMOCIONES_EN_MEMORIA_MS } from '@/lib/services/promotionEngine';
import type { Product } from '@/components/pos/types';
import { almacen, carrito, guardarCarritos, instalarAlmacen } from './utilesServicio';

const hamburguesa = { id: 1001, name: 'Hamburguesa', category_id: 5, parent_product_id: null, sale_mode: 'unit' } as unknown as Product;
const gaseosa = { id: 1002, name: 'Gaseosa', category_id: 6, parent_product_id: null, sale_mode: 'unit' } as unknown as Product;

const IVA = { id: 'tax-iva', name: 'IVA', rate: 19, tax_included: false, is_active: true, is_default: true, organization_id: 120 };
const lecturas = (tabla: string) => mockLecturas[tabla] ?? 0;
const reiniciarConteo = () => Object.keys(mockLecturas).forEach((k) => delete mockLecturas[k]);

let ahora = 0;

beforeAll(() => instalarAlmacen());
beforeEach(() => {
  ahora = 1_800_000_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => ahora);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  almacen.clear();
  Object.keys(mockTablas).forEach((k) => delete mockTablas[k]);
  reiniciarConteo();
  POSService.olvidarLecturasEnMemoria();
  olvidarPromocionesEnMemoria();
  mockTablas.product_prices = { data: [{ price: '10000', effective_from: '2026-01-01T00:00:00Z', effective_to: null }], error: null };
  mockTablas.organization_taxes = { data: [IVA], error: null };
  guardarCarritos([carrito('cart-1')]);
});
afterEach(() => jest.restoreAllMocks());

describe('impuestos del carrito en memoria corta', () => {
  it('el segundo toque no vuelve a pedir impuestos y el total sale igual', async () => {
    let cart = await POSService.addItemToCart('cart-1', hamburguesa, 1);
    expect(cart.items[0]).toMatchObject({ tax_rate: 19, tax_amount: 1900, total: 11900 });
    expect(lecturas('organization_taxes')).toBe(1);
    expect(lecturas('product_tax_relations')).toBe(1);

    reiniciarConteo();
    cart = await POSService.updateCartItemQuantity('cart-1', cart.items[0].id, 3);
    expect(cart.items[0]).toMatchObject({ quantity: 3, tax_rate: 19, tax_amount: 5700, total: 35700 });
    expect(cart.total).toBe(35700);
    expect(lecturas('organization_taxes')).toBe(0);
    expect(lecturas('product_tax_relations')).toBe(0);
  });

  it('los impuestos de producto se piden una vez por producto, no por línea', async () => {
    await POSService.addItemToCart('cart-1', hamburguesa, 1);
    await POSService.addItemToCart('cart-1', gaseosa, 1);
    // Tercera línea del mismo producto (con nota no se suma a la primera).
    const cart = await POSService.addItemToCart('cart-1', hamburguesa, 1, [{ groupId: 1, groupName: 'Salsas', modifierId: 9, name: 'BBQ', extraPrice: 0 }]);
    expect(cart.items).toHaveLength(3);
    expect(lecturas('product_tax_relations')).toBe(2);
    expect(lecturas('organization_taxes')).toBe(1);
    expect(cart.total).toBe(35700);
  });

  it('pasado el minuto se vuelven a leer: un cambio de impuestos llega solo', async () => {
    let cart = await POSService.addItemToCart('cart-1', hamburguesa, 1);
    expect(cart.items[0].tax_rate).toBe(19);

    mockTablas.organization_taxes = { data: [{ ...IVA, rate: 8 }], error: null };
    ahora += 59_000;
    cart = await POSService.updateCartItemQuantity('cart-1', cart.items[0].id, 2);
    expect(cart.items[0].tax_rate).toBe(19);

    ahora += 2_000;
    cart = await POSService.updateCartItemQuantity('cart-1', cart.items[0].id, 3);
    expect(cart.items[0]).toMatchObject({ tax_rate: 8, tax_amount: 2400, total: 32400 });
  });

  it('un error al leer impuestos NO se recuerda: el siguiente toque lee y cobra el impuesto', async () => {
    mockTablas.organization_taxes = { data: null, error: { message: 'sin red' } };
    let cart = await POSService.addItemToCart('cart-1', hamburguesa, 1);
    expect(cart.items[0].tax_amount).toBe(0);

    mockTablas.organization_taxes = { data: [IVA], error: null };
    cart = await POSService.updateCartItemQuantity('cart-1', cart.items[0].id, 2);
    expect(cart.items[0]).toMatchObject({ tax_rate: 19, tax_amount: 3800, total: 23800 });
  });

  it('un error al leer los impuestos de UN producto tampoco se recuerda', async () => {
    mockTablas.product_tax_relations = { data: null, error: { message: 'sin red' } };
    await POSService.addItemToCart('cart-1', hamburguesa, 1);
    reiniciarConteo();
    mockTablas.product_tax_relations = { data: [], error: null };
    await POSService.addItemToCart('cart-1', gaseosa, 1);
    // Vuelve a pedir los de la hamburguesa (falló antes) y pide los de la gaseosa.
    expect(lecturas('product_tax_relations')).toBe(2);
  });

  it('Mesas, el cobro y el PMS (sin `memoria`) leen siempre de la base, y refrescan lo guardado', async () => {
    await POSService.getOrganizationTaxes();
    await POSService.getOrganizationTaxes();
    await POSService.getProductTaxes(1001);
    await POSService.getProductTaxes(1001);
    expect(lecturas('organization_taxes')).toBe(2);
    expect(lecturas('product_tax_relations')).toBe(2);

    mockTablas.organization_taxes = { data: [{ ...IVA, rate: 5 }], error: null };
    await POSService.getOrganizationTaxes();
    reiniciarConteo();
    const enMemoria = await POSService.getOrganizationTaxes({ memoria: true });
    expect(enMemoria[0].rate).toBe(5);
    expect(lecturas('organization_taxes')).toBe(0);
  });

  it('lo que devuelve es una copia: ordenarla o vaciarla no daña lo guardado', async () => {
    const primera = await POSService.getOrganizationTaxes({ memoria: true });
    primera.length = 0;
    expect(await POSService.getOrganizationTaxes({ memoria: true })).toHaveLength(1);
  });
});

describe('promociones del carrito en memoria corta', () => {
  const promo = {
    id: 'promo-10',
    organization_id: 120,
    name: '10 % en todo',
    promotion_type: 'percentage',
    discount_value: '10',
    is_active: true,
    is_combinable: true,
    applies_to_pos: true,
    applies_to: 'all',
    start_date: '2026-01-01T00:00:00Z',
    end_date: null,
    priority: 1,
    created_at: '2026-01-01T00:00:00Z',
    promotion_rules: [],
    promotion_tiers: [],
  };

  beforeEach(() => {
    mockTablas.organization_taxes = { data: [], error: null };
    mockTablas.promotions = { data: [promo], error: null };
  });

  it('toques seguidos reutilizan la lista: una sola lectura de promociones, mismo descuento', async () => {
    let cart = await POSService.addItemToCart('cart-1', hamburguesa, 1);
    expect(cart.items[0].promo_discount_amount).toBe(1000);
    cart = await POSService.updateCartItemQuantity('cart-1', cart.items[0].id, 2);
    cart = await POSService.updateCartItemQuantity('cart-1', cart.items[0].id, 3);
    expect(cart.items[0].promo_discount_amount).toBe(3000);
    expect(cart.total).toBe(27000);
    expect(lecturas('promotions')).toBe(1);
  });

  it('`recalculateCart` (abrir el carrito, realtime, cada minuto) lee siempre de la base', async () => {
    let cart = await POSService.addItemToCart('cart-1', hamburguesa, 2);
    expect(cart.items[0].promo_discount_amount).toBe(2000);

    // El administrador apaga la promoción: el recálculo lo ve al instante…
    mockTablas.promotions = { data: [], error: null };
    cart = await POSService.recalculateCart('cart-1');
    expect(cart.items[0].promo_discount_amount).toBe(0);
    expect(cart.total).toBe(20000);
    // …y los toques siguientes parten de esa lista ya refrescada.
    cart = await POSService.updateCartItemQuantity('cart-1', cart.items[0].id, 3);
    expect(cart.items[0].promo_discount_amount).toBe(0);
  });

  it('sin recálculo de por medio, la lista vence sola a los 30 s', async () => {
    let cart = await POSService.addItemToCart('cart-1', hamburguesa, 1);
    mockTablas.promotions = { data: [], error: null };
    ahora += VIGENCIA_PROMOCIONES_EN_MEMORIA_MS - 1;
    cart = await POSService.updateCartItemQuantity('cart-1', cart.items[0].id, 2);
    expect(cart.items[0].promo_discount_amount).toBe(2000);
    ahora += 2;
    cart = await POSService.updateCartItemQuantity('cart-1', cart.items[0].id, 3);
    expect(cart.items[0].promo_discount_amount).toBe(0);
  });

  it('un error al leer promociones no se recuerda como «no hay promociones»', async () => {
    mockTablas.promotions = { data: null, error: { message: 'sin red' } };
    let cart = await POSService.addItemToCart('cart-1', hamburguesa, 1);
    expect(cart.items[0].promo_discount_amount ?? 0).toBe(0);
    mockTablas.promotions = { data: [promo], error: null };
    cart = await POSService.updateCartItemQuantity('cart-1', cart.items[0].id, 2);
    expect(cart.items[0].promo_discount_amount).toBe(2000);
  });
});
