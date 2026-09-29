/**
 * Venta por peso en el POS (PRODUCTOS-POR-PESO-BASCULA.md fases 1 y 2): cada
 * pesada es una línea propia con su `pesaje`, «cambiar peso», el sobre de
 * `pos_checkout_v1` con `notes.pesaje` y el redondeo al cobrar, el carrito con
 * decimales, la tarjeta «Por kg», el código exacto primero, la devolución con
 * «Reingresa» y el formulario «Cómo se vende».
 *
 * Datos inventados: organización 120, sucursal 7.
 */

jest.mock('@/lib/supabase/config', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'neq', 'gte', 'lte', 'or', 'not']) {
    chain[m] = () => chain;
  }
  chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
  chain.single = () => Promise.resolve({ data: null, error: null });
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
  const precios: Record<string, unknown> = { ...chain };
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'lte', 'or']) precios[m] = () => precios;
  precios.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve({ data: [{ price: '18900', effective_from: '2026-01-01T00:00:00Z', effective_to: null }], error: null })
      .then(onFulfilled, onRejected);
  return { supabase: { from: (tabla: string) => (tabla === 'product_prices' ? precios : chain) } };
});
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
  getCurrentBranchIdWithFallback: () => 7,
  getCurrentUserId: () => 'user-1',
}));
jest.mock('@/lib/services/promotionEngine', () => ({
  promotionEngine: { evaluate: async () => ({ discountTotal: 0, itemDiscounts: {}, applied: [] }) },
}));
jest.mock('@/lib/pos/display/posDisplay', () => ({
  getPosDisplayEmitter: () => ({ onCartsSaved: () => undefined, setMode: () => undefined, setTotals: () => undefined }),
}));

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
  get length(): number {
    return this.map.size;
  }
  key(i: number): string | null {
    return Array.from(this.map.keys())[i] ?? null;
  }
}

const storage = new MemoryStorage();
const g = globalThis as unknown as Record<string, unknown>;
g.window = globalThis;
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
if (typeof g.addEventListener !== 'function') {
  g.addEventListener = () => undefined;
  g.removeEventListener = () => undefined;
}

import { POSService } from '@/lib/services/posService';
import { buildCheckoutEnvelope } from '@/lib/offline/checkoutRpc';
import { cuentasDelCobro } from '@/lib/pos/venta/cobro/cuentasCobro';
import { cantidadDesdeTexto, textoCantidadParcialValido } from '@/components/kit/cartLineLogica';
import { aProductoTarjeta } from '@/lib/pos/venta/catalogoGrilla';
import { resolverCodigo, type PosGridProduct } from '@/lib/pos/venta/catalogo';
import { parametrosProcesarDevolucion, CODIGOS_ERROR_DEVOLUCION } from '@/lib/pos/devoluciones/procesarDevolucion';
import { CODIGOS_ERROR_COBRO } from '@/lib/pos/erroresCobro';
import { pesajeManual } from '@/lib/pos/peso';
import {
  camposModoVenta,
  estadoInicial,
  referenciaComoTexto,
  referenciaDesdeTexto,
  unidadParaModo,
  validarModoVenta,
} from '@/components/inventario/productos/logica/formularioProducto';
import type { Cart, CartItem, CheckoutData, Product } from '@/components/pos/types';

const KEY = 'pos_carts_120';
const QUESO = {
  id: 2001, organization_id: 120, sku: 'QUE-KG', name: 'Queso campesino', unit_code: 'KG  ', status: 'active',
  sale_mode: 'weight', qty_decimals: 3, price: 18900, created_at: '', updated_at: '',
} as unknown as Product;
const GASEOSA = {
  id: 2002, organization_id: 120, sku: 'GAS', name: 'Gaseosa', unit_code: 'UN', status: 'active',
  sale_mode: 'unit', qty_decimals: 0, price: 2500, created_at: '', updated_at: '',
} as unknown as Product;

const leer = (): Cart[] => JSON.parse(storage.getItem(KEY) || '[]');

beforeEach(() => {
  storage.clear();
  storage.setItem(KEY, JSON.stringify([{ id: 'cart-1', organization_id: 120, branch_id: 7, status: 'active', items: [] }]));
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(POSService, 'getProductTaxes').mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

describe('carrito: cada pesada es una línea propia', () => {
  it('dos pesadas del mismo producto son dos líneas, con la cantidad a 3 decimales y su pesada', async () => {
    const p1 = pesajeManual(QUESO, 0.735, new Date('2026-09-29T15:00:00Z'));
    await POSService.addItemToCart('cart-1', QUESO, 0.7354, undefined, { pesaje: p1 });
    const cart = await POSService.addItemToCart('cart-1', QUESO, 0.5, undefined, { pesaje: pesajeManual(QUESO, 0.5) });
    expect(cart.items).toHaveLength(2);
    expect(cart.items[0]).toMatchObject({ quantity: 0.735, unit_price: 18900, pesaje: { origen: 'manual', neto: 0.735, unidad: 'KG' } });
    expect(cart.items[0].total).toBeCloseTo(13891.5, 6);
    expect(cart.items[1].quantity).toBe(0.5);
    expect(leer()[0].items).toHaveLength(2);
  });

  it('un producto por unidad sigue sumando en la misma línea', async () => {
    await POSService.addItemToCart('cart-1', GASEOSA, 1);
    const cart = await POSService.addItemToCart('cart-1', GASEOSA, 2);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity).toBe(3);
  });

  it('«cambiar peso» cambia la cantidad y la pesada, conserva la nota y topa el descuento', async () => {
    const cart = await POSService.addItemToCart('cart-1', QUESO, 1, undefined, { pesaje: pesajeManual(QUESO, 1) });
    const id = cart.items[0].id;
    await POSService.updateCartItemNote('cart-1', id, { cliente: 'en tajadas' });
    await POSService.updateCartItemDiscount('cart-1', id, 15000);
    const nuevo = await POSService.updateCartItemPesaje('cart-1', id, 0.5, pesajeManual(QUESO, 0.5));
    expect(nuevo.items[0]).toMatchObject({ quantity: 0.5, customer_note: 'en tajadas', pesaje: { neto: 0.5 } });
    expect(nuevo.items[0].discount_amount).toBe(9450);
  });
});

function checkoutCon(items: CartItem[], pagos: Array<{ method: string; amount: number }>, pagado: number, cambio = 0): CheckoutData {
  return {
    cart: {
      id: 'c', organization_id: 120, branch_id: 7, status: 'active', items,
      subtotal: 0, tax_amount: 0, tax_total: 0, discount_amount: 0, discount_total: 0, total: 0,
      created_at: '2026-09-29T13:00:00.000Z', updated_at: '2026-09-29T13:00:00.000Z',
    },
    payments: pagos,
    change: cambio,
    total_paid: pagado,
  };
}

function lineaQueso(cantidad: number): CartItem {
  return {
    id: 'l1', cart_id: 'c', product_id: 2001, product: QUESO, quantity: cantidad, unit_price: 18900, total: cantidad * 18900,
    discount_amount: 0, tax_amount: 0, tax_rate: 0, pesaje: pesajeManual(QUESO, cantidad, new Date('2026-09-29T15:00:00Z')),
    created_at: '2026-09-29T13:00:00.000Z', updated_at: '2026-09-29T13:00:00.000Z',
  };
}

function sobre(checkout: CheckoutData, total: number) {
  return buildCheckoutEnvelope({
    checkout, saleId: 's', createdAt: '2026-09-29T15:00:00.000Z', organizationId: 120, branchId: 7, userId: null, currency: 'COP',
    itemCalcs: [{ lineNet: total, taxRate: 0, taxAmount: 0, total, taxIncluded: false, discount: 0 }],
    subtotal: total, taxTotal: 0, discountTotal: 0, total, promotionIds: [], invoiceCommissionAmount: 0,
  });
}

describe('sobre de pos_checkout_v1 (sin cambiar su contrato)', () => {
  it('la cantidad viaja decimal, el precio por kg, el total exacto y la pesada en notes.pesaje', () => {
    const env = sobre(checkoutCon([lineaQueso(0.735)], [{ method: 'cash', amount: 13892 }], 13892), 13891.5);
    expect(env.items[0]).toMatchObject({ quantity: 0.735, unit_price: 18900, total: 13891.5 });
    expect(env.items[0].notes.pesaje).toMatchObject({ origen: 'manual', neto: 0.735, unidad: 'KG' });
    expect(env.payments).toEqual([{ method: 'cash', amount: 13892 }]);
  });

  it('cobrado redondeado hacia abajo: el pago se completa al total exacto (la venta no queda pendiente por $ 0,40)', () => {
    const env = sobre(checkoutCon([lineaQueso(0.486)], [{ method: 'cash', amount: 9185 }], 9185), 9185.4);
    expect(env.payments).toEqual([{ method: 'cash', amount: 9185.4 }]);
    expect(env.totals.total_paid).toBe(9185.4);
  });

  it('un carrito sin líneas por peso no se toca', () => {
    const linea: CartItem = { ...lineaQueso(1), product: GASEOSA, product_id: 2002, pesaje: undefined, unit_price: 2500, total: 2500 };
    const env = sobre(checkoutCon([linea], [{ method: 'cash', amount: 2499.6 }], 2499.6), 2500);
    expect(env.payments).toEqual([{ method: 'cash', amount: 2499.6 }]);
  });
});

describe('cuentas del cobro con redondeo', () => {
  const base = { calculatedTotals: { subtotal: 9185.4, totalTaxAmount: 0, finalTotal: 9185.4 }, cart: { total: 9185.4, tax_total: 0 }, tipAmount: 0, shippingFee: 0 };
  it('con líneas por peso se cobra el total redondeado a la moneda', () => {
    expect(cuentasDelCobro({ ...base, totalPaid: 9185, decimalesRedondeo: 0 })).toMatchObject({ cartTotal: 9185, remaining: 0, canComplete: true });
    expect(cuentasDelCobro({ ...base, totalPaid: 10000, decimalesRedondeo: 0 })).toMatchObject({ change: 815 });
  });
  it('sin redondeo, igual que antes', () => {
    expect(cuentasDelCobro({ ...base, totalPaid: 9185 })).toMatchObject({ canComplete: false });
  });
});

describe('línea del carrito: cantidad con decimales', () => {
  it('por unidad solo enteros; por peso coma o punto y hasta 3 decimales', () => {
    expect(cantidadDesdeTexto('3')).toBe(3);
    expect(cantidadDesdeTexto('1,5')).toBeNull();
    expect(cantidadDesdeTexto('0,735', 3)).toBe(0.735);
    expect(cantidadDesdeTexto('0,7354', 3)).toBeNull();
    expect(textoCantidadParcialValido('0,', 3)).toBe(true);
    expect(textoCantidadParcialValido('0,7354', 3)).toBe(false);
    expect(textoCantidadParcialValido('1.5', 0)).toBe(false);
  });
});

describe('catálogo del POS', () => {
  it('la tarjeta de un producto por peso dice «Por kg» y el stock en kg', () => {
    const t = aProductoTarjeta({ ...QUESO, track_stock: true, stock_quantity: 12.4 } as unknown as PosGridProduct);
    expect(t).toMatchObject({ unidadVenta: 'kg', decimalesCantidad: 3, precio: 18900 });
    expect(aProductoTarjeta(GASEOSA as unknown as PosGridProduct).unidadVenta).toBeNull();
  });

  it('el código exacto manda: con la fila exacta se agrega; sin ella, «no encontrado» aunque la búsqueda traiga parecidos', () => {
    const fila = { ...GASEOSA, barcode: '2000000000017' } as unknown as Product;
    const grilla = [GASEOSA as unknown as PosGridProduct, QUESO as unknown as PosGridProduct];
    expect(resolverCodigo(fila, grilla)).toMatchObject({ tipo: 'tarjeta', producto: { id: 2002 } });
    expect(resolverCodigo(null, grilla)).toEqual({ tipo: 'no_encontrado' });
  });
});

describe('devolución por peso', () => {
  it('la cantidad decimal y «Reingresa» viajan a procesar_devolucion', () => {
    const p = parametrosProcesarDevolucion(120, 's', {
      items: [{ sale_item_id: 'l1', return_quantity: 0.375, reason: 'defectuoso', restock: false }],
      refund_method: 'cash',
      reason: 'Cliente devuelve',
    }, 'k');
    expect(p.p_items[0]).toEqual({ sale_item_id: 'l1', quantity: 0.375, reason_code: 'defectuoso', serial_ids: [], restock: false });
  });

  it('sin casilla (producto por unidad) no se manda restock', () => {
    const p = parametrosProcesarDevolucion(120, 's', { items: [{ sale_item_id: 'l1', return_quantity: 1, reason: 'x' }], refund_method: 'cash', reason: 'r' }, 'k');
    expect(p.p_items[0]).not.toHaveProperty('restock');
  });

  it('los errores nuevos del servidor tienen código estable', () => {
    expect(CODIGOS_ERROR_DEVOLUCION).toContain('cantidad_decimales');
    for (const c of ['cantidad_decimales', 'cantidad_bajo_minimo', 'origen_peso_invalido', 'origen_peso_no_disponible', 'peso_exige_bascula', 'sin_permiso_peso_manual']) {
      expect(CODIGOS_ERROR_COBRO).toContain(c);
    }
  });
});

describe('formulario del producto: «Cómo se vende»', () => {
  const base = estadoInicial([]);

  it('por peso en kg con precio «cada 100 g»: se envía la referencia; el precio sigue por kg', () => {
    const e = { ...base, sale_mode: 'weight' as const, unit_code: 'KG', precio_referencia: '100GR', min_sale_qty: 0.05, require_scale: true, price: 18900 };
    expect(validarModoVenta(e)).toBeNull();
    expect(camposModoVenta(e)).toEqual({ sale_mode: 'weight', price_ref_qty: 100, price_ref_unit_code: 'GR', min_sale_qty: 0.05, require_scale: true, scale_plu: null });
  });

  it('errores: unidad que no es de peso, «cada 300 g», variantes, servicio, mínimo con decimales de más', () => {
    const peso = { ...base, sale_mode: 'weight' as const, unit_code: 'KG' };
    expect(validarModoVenta({ ...peso, unit_code: 'UN' })).toBe('unidad_peso_invalida');
    expect(validarModoVenta({ ...peso, precio_referencia: '300GR' })).toBe('referencia_precio_invalida');
    expect(validarModoVenta({ ...peso, tiene_variantes: true })).toBe('modo_venta_con_variantes');
    expect(validarModoVenta({ ...peso, product_type: 'service' })).toBe('modo_venta_servicio');
    expect(validarModoVenta({ ...peso, min_sale_qty: 0.0505 })).toBe('minimo_invalido');
    expect(validarModoVenta({ ...base, sale_mode: 'measure', unit_code: 'KG' })).toBe('unidad_medida_invalida');
  });

  it('por unidad deja todo por defecto y la unidad sigue la elección', () => {
    expect(camposModoVenta(base)).toEqual({ sale_mode: 'unit', price_ref_qty: null, price_ref_unit_code: null, min_sale_qty: null, require_scale: false, scale_plu: null });
    expect(unidadParaModo('weight', 'UN')).toBe('KG');
    expect(unidadParaModo('weight', 'LB')).toBe('LB');
    expect(unidadParaModo('measure', 'KG')).toBe('MT');
    expect(unidadParaModo('unit', 'KG')).toBe('UN');
    expect(referenciaComoTexto({ price_ref_qty: '100.000', price_ref_unit_code: 'GR  ' })).toBe('100GR');
    expect(referenciaDesdeTexto('500GR')).toEqual({ cantidad: 500, unidad: 'GR' });
    expect(referenciaDesdeTexto('')).toBeNull();
  });
});
