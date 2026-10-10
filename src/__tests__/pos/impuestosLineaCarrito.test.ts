/**
 * Fija el cálculo ACTUAL de impuestos del carrito del POS de mostrador con y
 * sin cada control (2026-09-23, docs/design/POS-CARRITO-LINEAS-NOTAS.md §7):
 *
 *   1. «Excluir impuesto» por línea  → `CartItem.tax_excluded` (icono ReceiptText).
 *   2. «Incluido» por línea          → `CartItem.tax_included` (casilla de la línea).
 *   3. «Impuestos incluidos» global  → `Cart.tax_included` (switch del Resumen), que
 *                                      además copia su valor a TODAS las líneas.
 *
 * Son tres cálculos distintos que hoy NO coinciden entre sí para una línea
 * excluida (ver la sección del documento). Estos tests no dicen cuál es el
 * correcto: congelan lo que hace el código para que un cambio de persistencia
 * (bug N1: la nota y el «Excluir impuesto» vivían solo en el estado de React)
 * no altere un peso del cobro sin que alguien lo decida.
 *
 *   A. `POSService` (carrito guardado, `calculateCartTotals`/`calculateItemTaxes`).
 *   B. Resumen del carrito (`TaxSummary`) y diálogo de cobro (`CheckoutDialog`):
 *      ambos arman un `TaxCalculationItem` por línea y llaman a
 *      `calculateCartTaxes`. Como son componentes (Jest corre en `node`), el test
 *      reproduce el armado y un guardarraíl comprueba que el código fuente sigue
 *      diciendo exactamente eso.
 *      El cobro ya no hereda `cart.tax_included` cuando la línea no lo trae:
 *      ese flag suelto sacaba el impuesto del precio (17.496 → 16.200) y
 *      apagar la casilla no lo devolvía.
 *
 * Datos inventados: organización 120, sucursal 7, IVA 19 %.
 */

import * as fs from 'fs';
import * as path from 'path';

jest.mock('@/lib/supabase/config', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'neq', 'gte', 'lte', 'or', 'not']) {
    chain[m] = () => chain;
  }
  chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
  chain.single = () => Promise.resolve({ data: null, error: null });
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
  return { supabase: { from: () => chain } };
});

jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
  getCurrentBranchIdWithFallback: () => 7,
  getCurrentUserId: () => 'user-1',
}));

jest.mock('@/lib/services/promotionEngine', () => ({
  promotionEngine: {
    evaluate: async () => ({ discountTotal: 0, itemDiscounts: {}, applied: [] }),
  },
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
import { calculateCartTaxes, type OrganizationTax, type TaxCalculationItem } from '@/lib/utils/taxCalculations';
import type { Cart, CartItem } from '@/components/pos/types';

const KEY = 'pos_carts_120';
const IVA = { id: 'iva-19', name: 'IVA', rate: 19, is_default: true, is_active: true, tax_included: false };

function linea(id: string, extra: Partial<CartItem> = {}): CartItem {
  return {
    id,
    cart_id: 'cart-1',
    product_id: 1001,
    product: { id: 1001, name: 'Hamburguesa', sku: 'H1' } as never,
    quantity: 2,
    unit_price: 10000,
    total: 20000,
    discount_amount: 0,
    tax_amount: 0,
    tax_rate: 0,
    created_at: '2026-09-23T12:00:00.000Z',
    updated_at: '2026-09-23T12:00:00.000Z',
    ...extra,
  };
}

function carrito(items: CartItem[], extra: Partial<Cart> = {}): Cart {
  return {
    id: 'cart-1',
    organization_id: 120,
    branch_id: 7,
    status: 'active',
    items,
    subtotal: 0,
    tax_amount: 0,
    tax_total: 0,
    discount_amount: 0,
    discount_total: 0,
    total: 0,
    created_at: '2026-09-23T12:00:00.000Z',
    updated_at: '2026-09-23T12:00:00.000Z',
    ...extra,
  };
}

function guardar(cart: Cart) {
  storage.setItem(KEY, JSON.stringify([cart]));
}

function leer(): Cart {
  return (JSON.parse(storage.getItem(KEY) || '[]') as Cart[])[0];
}

beforeEach(() => {
  storage.clear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(POSService, 'getProductTaxes').mockResolvedValue([
    { product_id: 1001, tax_id: IVA.id, organization_taxes: IVA },
  ]);
});

afterEach(() => jest.restoreAllMocks());

// ─── A. POSService: el carrito guardado ──────────────────────────────────────

describe('A. POSService.calculateCartTotals (carrito guardado)', () => {
  it('sin controles: IVA encima del precio', async () => {
    guardar(carrito([linea('l1')]));
    const cart = await POSService.recalculateCart('cart-1');
    expect(cart.items[0].tax_amount).toBe(3800);
    expect(cart.items[0].tax_rate).toBe(19);
    expect(cart.items[0].total).toBe(23800);
    expect(cart.subtotal).toBe(20000);
    expect(cart.tax_total).toBe(3800);
    expect(cart.total).toBe(23800);
  });

  it('«Incluido» en la línea: el IVA sale de dentro del precio', async () => {
    guardar(carrito([linea('l1')]));
    const cart = await POSService.updateItemTaxIncluded('cart-1', 'l1', true);
    expect(cart.items[0].tax_included).toBe(true);
    expect(cart.items[0].tax_amount).toBe(3193.28);
    expect(cart.items[0].total).toBe(20000);
    expect(cart.tax_total).toBe(3193.28);
    expect(cart.total).toBe(20000);
    // Y queda guardado.
    expect(leer().items[0].tax_included).toBe(true);
  });

  it('«Excluir impuesto»: el servicio NO lo mira (calcula el IVA igual)', async () => {
    guardar(carrito([linea('l1', { tax_excluded: true })]));
    const cart = await POSService.recalculateCart('cart-1');
    expect(cart.items[0].tax_amount).toBe(3800);
    expect(cart.items[0].total).toBe(23800);
    expect(cart.total).toBe(23800);
    expect(cart.items[0].tax_excluded).toBe(true);
  });

  it('«Excluir impuesto» + «Incluido»: manda «Incluido»', async () => {
    guardar(carrito([linea('l1', { tax_excluded: true, tax_included: true })]));
    const cart = await POSService.recalculateCart('cart-1');
    expect(cart.items[0].tax_amount).toBe(3193.28);
    expect(cart.total).toBe(20000);
  });

  it('descuento de línea: el IVA se calcula sobre la base descontada', async () => {
    guardar(carrito([linea('l1')]));
    const cart = await POSService.updateCartItemDiscount('cart-1', 'l1', 1000);
    expect(cart.items[0].tax_amount).toBe(3610);
    expect(cart.items[0].total).toBe(22610);
    expect(cart.discount_total).toBe(1000);
    expect(cart.total).toBe(22610);
  });

  it('switch global «Impuestos incluidos»: se copia a TODAS las líneas', async () => {
    guardar(carrito([linea('l1'), linea('l2', { tax_included: false })]));
    const on = await POSService.updateCartTaxSettings('cart-1', { tax_included: true });
    expect(on.tax_included).toBe(true);
    expect(on.items.map((i) => i.tax_included)).toEqual([true, true]);
    expect(on.total).toBe(40000);
    const off = await POSService.updateCartTaxSettings('cart-1', { tax_included: false });
    expect(off.items.map((i) => i.tax_included)).toEqual([false, false]);
    expect(off.total).toBe(47600);
  });

  it('carrito mixto (una incluida, otra no): solo se suma el IVA de la que no lo trae', async () => {
    guardar(carrito([linea('l1', { tax_included: true }), linea('l2')]));
    const cart = await POSService.recalculateCart('cart-1');
    expect(cart.subtotal).toBe(40000);
    expect(cart.tax_total).toBe(3193.28 + 3800);
    expect(cart.total).toBe(43800);
  });
});

// ─── B. Resumen (TaxSummary) y cobro (CheckoutDialog) ────────────────────────

const ORG_TAXES: OrganizationTax[] = [{ id: IVA.id, name: IVA.name, rate: IVA.rate, is_default: true, is_active: true }];
const APLICADOS = { [IVA.id]: true };

interface Totales {
  subtotal: number;
  impuestos: number;
  total: number;
}

/** TaxSummary.tsx, bucle de `calculateTaxBreakdown` (rama de impuestos del producto). */
function resumen(items: CartItem[], taxIncluded: boolean): Totales {
  let subtotal = 0;
  let impuestos = 0;
  let total = 0;
  for (const item of items) {
    if (item.tax_excluded) {
      const lineTotal = item.quantity * item.unit_price;
      subtotal += lineTotal;
      total += lineTotal;
      continue;
    }
    const taxItem: TaxCalculationItem = {
      quantity: item.quantity,
      unit_price: item.unit_price,
      product_id: item.product_id,
      discount_amount: item.discount_amount || 0,
      tax_rate: item.tax_rate || undefined,
      tax_included: item.tax_excluded ? false : (item.tax_included ?? taxIncluded ?? undefined),
    };
    const r = calculateCartTaxes([taxItem], APLICADOS, ORG_TAXES, taxIncluded);
    subtotal += r.subtotal;
    impuestos += r.totalTaxAmount;
    total += r.finalTotal;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { subtotal: r2(subtotal), impuestos: r2(impuestos), total: r2(total) };
}

/**
 * CheckoutDialog.tsx, `calculateCartTotals` (rama de impuestos del producto).
 * La casilla del cobro no hereda `cart.tax_included`. Si la línea dice si el
 * impuesto va dentro del precio, eso manda. La casilla solo llena las que no dicen nada.
 */
function cobro(cart: Cart, taxIncludedDialogo: boolean): Totales {
  let subtotal = 0;
  let impuestos = 0;
  let total = 0;
  for (const item of cart.items) {
    const tasaDecidida = item.tasaDecidida === true;
    const taxItem: TaxCalculationItem = {
      quantity: item.quantity,
      unit_price: item.unit_price,
      product_id: item.product_id,
      discount_amount: item.discount_amount || 0,
      tax_rate: tasaDecidida ? (Number(item.tax_rate) || 0) : (item.tax_rate || undefined),
      tax_included: item.tax_included,
      tax_excluded: item.tax_excluded,
      tasaDecidida,
    };
    const r = calculateCartTaxes([taxItem], APLICADOS, ORG_TAXES, taxIncludedDialogo);
    subtotal += r.subtotal;
    impuestos += r.totalTaxAmount;
    total += r.finalTotal;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { subtotal: r2(subtotal), impuestos: r2(impuestos), total: r2(total) };
}

describe('B. Resumen del carrito y diálogo de cobro', () => {
  // `tax_rate` 19: el que deja POSService en la línea al recalcular (A).
  const base = () => linea('l1', { tax_rate: 19 });

  it('sin controles: los dos cobran IVA encima', () => {
    expect(resumen([base()], false)).toEqual({ subtotal: 20000, impuestos: 3800, total: 23800 });
    expect(cobro(carrito([base()]), false)).toEqual({ subtotal: 20000, impuestos: 3800, total: 23800 });
  });

  it('«Incluido» en la línea: los dos sacan el IVA de dentro', () => {
    const l = { ...base(), tax_included: true };
    expect(resumen([l], false)).toEqual({ subtotal: 16806.72, impuestos: 3193.28, total: 20000 });
    expect(cobro(carrito([l]), false)).toEqual({ subtotal: 16806.72, impuestos: 3193.28, total: 20000 });
  });

  it('switch global encendido y línea sin valor propio: incluido en los dos', () => {
    const l = { ...base(), tax_included: undefined };
    expect(resumen([l], true)).toEqual({ subtotal: 16806.72, impuestos: 3193.28, total: 20000 });
    expect(cobro(carrito([l], { tax_included: true }), true)).toEqual({ subtotal: 16806.72, impuestos: 3193.28, total: 20000 });
  });

  it('la línea manda sobre el switch global: «Incluido» apagado en la línea → IVA encima', () => {
    const l = { ...base(), tax_included: false };
    expect(resumen([l], true)).toEqual({ subtotal: 20000, impuestos: 3800, total: 23800 });
    expect(cobro(carrito([l], { tax_included: true }), true)).toEqual({ subtotal: 20000, impuestos: 3800, total: 23800 });
  });

  it('el flag del carrito no saca el IVA si la línea no lo trae y la casilla está apagada', () => {
    const l = { ...base(), tax_included: undefined };
    // Antes el cobro usaba cart.tax_included y cobraba 20.000 (IVA por dentro).
    // El carrito, con la línea sin marcar, suma el IVA: 23.800. El cobro igual.
    expect(cobro(carrito([l], { tax_included: true }), false)).toEqual({ subtotal: 20000, impuestos: 3800, total: 23800 });
  });

  it('apagar la casilla no le suma el IVA a una línea que ya lo trae en el precio', () => {
    const l = { ...base(), tax_included: true };
    expect(cobro(carrito([l], { tax_included: true }), false)).toEqual({ subtotal: 16806.72, impuestos: 3193.28, total: 20000 });
  });

  it('«Excluir impuesto»: el Resumen la cobra SIN impuesto, el cobro le suma el IVA encima (discrepancia actual)', () => {
    const l = { ...base(), tax_excluded: true };
    expect(resumen([l], false)).toEqual({ subtotal: 20000, impuestos: 0, total: 20000 });
    expect(cobro(carrito([l]), false)).toEqual({ subtotal: 20000, impuestos: 3800, total: 23800 });
  });

  it('«Excluir impuesto» sobre una línea «Incluido»: el cobro fuerza «no incluido» y suma el IVA', () => {
    const l = { ...base(), tax_excluded: true, tax_included: true };
    expect(resumen([l], true)).toEqual({ subtotal: 20000, impuestos: 0, total: 20000 });
    expect(cobro(carrito([l], { tax_included: true }), true)).toEqual({ subtotal: 20000, impuestos: 3800, total: 23800 });
  });

  it('«Excluir impuesto» con descuento: el Resumen ignora el descuento de esa línea', () => {
    const l = { ...base(), tax_excluded: true, discount_amount: 1000 };
    expect(resumen([l], false)).toEqual({ subtotal: 20000, impuestos: 0, total: 20000 });
    // El cobro sí resta el descuento (base 19.000) y suma IVA sobre ella.
    expect(cobro(carrito([l]), false)).toEqual({ subtotal: 19000, impuestos: 3610, total: 22610 });
  });
});

// ─── Guardarraíl: el código fuente sigue armando la línea así ─────────────────

describe('guardarraíl: armado de la línea en los componentes', () => {
  const src = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

  it('TaxSummary: la línea excluida se suma sin impuesto y sin descuento', () => {
    const s = src('components/pos/TaxSummary.tsx');
    expect(s).toContain('if (item.tax_excluded) {\n            const lineTotal = item.quantity * item.unit_price;');
    expect(s).toContain('tax_included: item.tax_excluded ? false : (item.tax_included ?? taxIncluded ?? undefined)');
  });

  it('CheckoutDialog: la casilla del cobro decide, no el flag suelto del carrito', () => {
    const s = src('components/pos/CheckoutDialog.tsx');
    expect(s).toContain('const incluido = impuestoIncluidoDeLinea(item, taxIncluded);');
    expect(s).toContain('tax_included: item.tax_included');
    expect(s).toContain('tax_excluded: item.tax_excluded');
    expect(s).toContain('const tasaDecidida = item.tasaDecidida === true;');
    expect(s).toContain('tax_rate: tasaDecidida ? (Number(item.tax_rate) || 0) : (item.tax_rate || undefined)');
    expect(s).not.toContain('item.tax_included ?? cart.tax_included');
    expect(s).not.toContain('impuestoIncluidoDeLinea(item, taxIncluded, casillaMovida)');
    expect(s).not.toMatch(/if \(item\.tax_excluded\)\s*\{\s*const lineTotal/);
    // Reparto del impuesto total entre las líneas por peso del subtotal (todas, también la excluida).
    // La base es la de esta apertura (`totalesCobro`), no un `calculatedTotals` de la venta anterior.
    expect(s).toContain('const itemTaxAmount = totalesCobro.totalTaxAmount * taxProportion;');
    expect(s).toContain('const totalesCobro = totalesVisiblesDelCobro(calculatedTotals, cart);');
    expect(s).toContain('const ajuste = ajusteAlAbrirCobro(cart.items);');
  });

  it('POSService.calculateItemTaxes no lee tax_excluded', () => {
    const s = src('lib/services/posService.ts');
    const inicio = s.indexOf('private static async calculateItemTaxes');
    const fin = s.indexOf('// MÉTODOS DE IMPUESTOS', inicio);
    expect(inicio).toBeGreaterThan(0);
    expect(s.slice(inicio, fin)).not.toContain('tax_excluded');
  });

  it('switch global: updateCartTaxSettings copia el valor a cada línea', () => {
    const s = src('lib/services/posService.ts');
    expect(s).toContain('cart.items.forEach(item => { item.tax_included = settings.tax_included; });');
  });
});
