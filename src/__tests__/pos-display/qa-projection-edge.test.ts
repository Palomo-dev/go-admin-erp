/**
 * QA ronda 1 — casos borde de projectCartForDisplay que el builder no cubrió.
 *
 * Los BUG A, B y E se corrigieron en la ronda 2: los tests que los
 * documentaban pasaron de `it.failing` a `it` y ahora fijan el contrato.
 *
 * Fixtures con organización ficticia (org 1). Sin nombres de clientes reales.
 */

import type { Cart, CartItem, Product } from '@/components/pos/types';
import { projectCartForDisplay } from '@/lib/pos/display/projection';

const TS = '2026-09-15T15:00:00.000Z';

function product(id: number, name: string): Product {
  return { id, organization_id: 1, sku: `SKU-${id}`, name, unit_code: 'UND', status: 'active', created_at: TS, updated_at: TS };
}

function item(over: Partial<CartItem> & { id: string; product_id: number }): CartItem {
  const quantity = over.quantity ?? 1;
  const unit_price = over.unit_price ?? 1000;
  return {
    cart_id: 'cart-1',
    product: product(over.product_id, `Producto ${over.product_id}`),
    quantity,
    unit_price,
    total: quantity * unit_price,
    discount_amount: 0,
    tax_amount: 0,
    tax_rate: 0,
    created_at: TS,
    updated_at: TS,
    ...over,
  };
}

function cart(over: Partial<Cart> = {}): Cart {
  return {
    id: 'cart-1', organization_id: 1, branch_id: 1, status: 'active', items: [],
    subtotal: 0, tax_amount: 0, tax_total: 0, discount_amount: 0, discount_total: 0, total: 0,
    created_at: TS, updated_at: TS, ...over,
  };
}

describe('QA proyección: cantidades y descuentos límite', () => {
  it('cantidad 0: la línea se proyecta con qty 0 y total 0, sin NaN', () => {
    const c = cart({ items: [item({ id: 'l1', product_id: 1, quantity: 0, unit_price: 5000, total: 0 })] });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.lines[0].qty).toBe(0);
    expect(out.lines[0].total).toBe(0);
    expect(JSON.stringify(out)).not.toContain('NaN');
  });

  it('cantidad negativa o fraccionaria se copia tal cual (espejo, no valida)', () => {
    const c = cart({ items: [item({ id: 'l1', product_id: 1, quantity: -2 }), item({ id: 'l2', product_id: 2, quantity: 0.5 })] });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.lines[0].qty).toBe(-2);
    expect(out.lines[1].qty).toBe(0.5);
  });

  it('descuento mayor que el subtotal: se refleja el total negativo que dejó la caja (espejo) y el descuento de la línea', () => {
    // calculateCartTotals no clampa: total = subtotal + tax − discount puede ser < 0.
    const c = cart({
      items: [item({ id: 'l1', product_id: 1, quantity: 1, unit_price: 1000, discount_amount: 1500 })],
      subtotal: 1000, discount_total: 1500, total: -500,
    });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.discountTotal).toBe(1500);
    expect(out.lines[0].discount).toBe(1500);
    expect(out.total).toBe(-500); // la pantalla nunca miente: muestra lo que muestra la caja
  });

  it('descuento negativo en la línea se trata como sin descuento', () => {
    const c = cart({ items: [item({ id: 'l1', product_id: 1, discount_amount: -10 })] });
    expect(projectCartForDisplay(c, { currency: 'COP' }).lines[0].discount).toBeNull();
  });

  it('modificadores sin precio (extraPrice undefined/null/string) → 0; nombre no string → ""', () => {
    const mods = [
      { groupId: 1, groupName: 'g', modifierId: 1, name: 'Sin precio', extraPrice: undefined },
      { groupId: 1, groupName: 'g', modifierId: 2, name: 'Nulo', extraPrice: null },
      { groupId: 1, groupName: 'g', modifierId: 3, name: 'Texto', extraPrice: '300' },
      { groupId: 1, groupName: 'g', modifierId: 4, name: 42, extraPrice: 100 },
    ] as unknown as CartItem['modifiers'];
    const c = cart({ items: [item({ id: 'l1', product_id: 1, modifiers: mods })] });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.lines[0].modifiers).toEqual([
      { name: 'Sin precio', extraPrice: 0 },
      { name: 'Nulo', extraPrice: 0 },
      { name: 'Texto', extraPrice: 300 },
      { name: '', extraPrice: 100 },
    ]);
  });

  it('ítem sin product (carrito viejo de localStorage) no rompe: nombre vacío', () => {
    const broken = { ...item({ id: 'l1', product_id: 1 }), product: undefined } as unknown as CartItem;
    const out = projectCartForDisplay(cart({ items: [broken] }), { currency: 'COP' });
    expect(out.lines[0].name).toBe('');
  });

  /**
   * BUG E (corregido en ronda 2). resolveTaxIncluded recibe ahora el array ya
   * normalizado con Array.isArray, así que un carrito con `items: null` de
   * localStorage proyecta vacío en vez de lanzar TypeError.
   */
  it('BUG E: cart.items no es array (localStorage corrupto) → sin líneas, no lanza', () => {
    const broken = { ...cart(), items: null } as unknown as Cart;
    expect(() => projectCartForDisplay(broken, { currency: 'COP' })).not.toThrow();
    const out = projectCartForDisplay(broken, { currency: 'COP' });
    expect(out.lines).toEqual([]);
    expect(out.taxIncluded).toBe(false);
  });

  it('cart.items no es array PERO cart.tax_included es booleano → no lanza (la rama protegida)', () => {
    const broken = { ...cart({ tax_included: true }), items: null } as unknown as Cart;
    expect(projectCartForDisplay(broken, { currency: 'COP' }).lines).toEqual([]);
  });

  it('lastChangedLineId vacío ("") se normaliza a null', () => {
    const c = cart({ items: [item({ id: 'l1', product_id: 1 })] });
    expect(projectCartForDisplay(c, { currency: 'COP', lastChangedLineId: '' }).lastChangedLineId).toBeNull();
  });

  it('importes como string ("1500") se proyectan como número', () => {
    const c = cart({ subtotal: '1500' as unknown as number, total: '1500' as unknown as number });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.subtotal).toBe(1500);
    expect(out.total).toBe(1500);
  });

  it('la salida sobrevive a structuredClone/JSON (lo que exige BroadcastChannel)', () => {
    const c = cart({ items: [item({ id: 'l1', product_id: 1, notes: 'x' })], subtotal: 1000, total: 1000 });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
    expect(structuredClone(out)).toEqual(out);
  });
});

describe('QA proyección: divergencias con posService (corregidas en ronda 2)', () => {
  /**
   * BUG A. `calculateCartTotals` decide "impuesto incluido" SOLO con
   * `cart.items.some(i => i.tax_included)`; nunca lee `cart.tax_included`.
   * La proyección daba prioridad a `cart.tax_included`, así que con el toggle
   * por ítem (CartView → updateItemTaxIncluded) y `cart.tax_included === false`
   * la caja calculaba el total como "incluido" y la pantalla decía "excluido".
   * Ahora resolveTaxIncluded aplica la regla de la caja.
   */
  it('BUG A: cart.tax_included=false con un ítem tax_included=true debe proyectar taxIncluded=true (regla real de calculateCartTotals)', () => {
    const c = cart({
      tax_included: false,
      items: [item({ id: 'l1', product_id: 1, tax_included: true, tax_amount: 190 }), item({ id: 'l2', product_id: 2, tax_included: false })],
    });
    expect(projectCartForDisplay(c, { currency: 'COP' }).taxIncluded).toBe(true);
  });

  /**
   * BUG B. `calculateItemTaxes` reescribe `item.total` en cuanto el producto
   * tiene impuestos: `taxableBase` (neto tras descuento) si va incluido, o
   * `taxableBase + tax` si va excluido. Solo los productos SIN impuestos
   * conservan qty × unit_price. La proyección copiaba `item.total` sin
   * normalizar, así que el significado de `line.total` cambiaba por línea.
   * Ahora projectLine calcula siempre qty × unitPrice y no lee `item.total`.
   */
  it('BUG B: line.total debe ser qty × unitPrice (bruto) aunque la caja haya dejado item.total neto', () => {
    // Estado real que deja calculateItemTaxes para un ítem con IVA incluido y descuento:
    // total = qty*unit − discount = 2*10000 − 2000 = 18000
    const c = cart({
      tax_included: true,
      items: [item({ id: 'l1', product_id: 1, quantity: 2, unit_price: 10000, discount_amount: 2000, tax_included: true, tax_amount: 2874, total: 18000 })],
      subtotal: 20000, discount_total: 2000, tax_total: 2874, total: 18000,
    });
    const line = projectCartForDisplay(c, { currency: 'COP' }).lines[0];
    expect(line.total).toBe(20000);
    expect(line.discount).toBe(2000);
  });

  it('BUG B (excluido): line.total no debe llevar el impuesto sumado si el contrato dice "bruto"', () => {
    // calculateItemTaxes, impuesto excluido: total = taxableBase + tax = 10000 + 1900
    const c = cart({
      tax_included: false,
      items: [item({ id: 'l1', product_id: 1, quantity: 1, unit_price: 10000, tax_included: false, tax_amount: 1900, total: 11900 })],
      subtotal: 10000, tax_total: 1900, total: 11900,
    });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.lines[0].total).toBe(10000);
    // Con el contrato cumplido, la suma de líneas cuadra con el subtotal (como TaxSummary).
    expect(out.lines.reduce((s, l) => s + l.total, 0)).toBe(out.subtotal);
  });
});
