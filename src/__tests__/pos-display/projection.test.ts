/**
 * projectCartForDisplay: contrato que ve el cliente. No puede divergir del
 * recibo, así que aquí se fija qué se copia del carrito y qué se descarta.
 */

import type { Cart, CartItem, Product } from '@/components/pos/types';
import { projectCartForDisplay } from '@/lib/pos/display/projection';

// Fixtures: organización ficticia (org 1); ningún nombre de cliente real.
const FIXED_TS = '2026-09-15T15:00:00.000Z';

function makeProduct(id: number, name: string): Product {
  return {
    id,
    organization_id: 1,
    sku: `SKU-${id}`,
    name,
    unit_code: 'UND',
    status: 'active',
    created_at: FIXED_TS,
    updated_at: FIXED_TS,
    description: 'descripción que no debe viajar a la pantalla',
    cost: 1234,
  };
}

function makeItem(overrides: Partial<CartItem> & { id: string; product_id: number; name?: string }): CartItem {
  const { name, ...rest } = overrides;
  const quantity = rest.quantity ?? 1;
  const unitPrice = rest.unit_price ?? 1000;
  return {
    cart_id: 'cart-1',
    product: makeProduct(rest.product_id, name ?? `Producto ${rest.product_id}`),
    quantity,
    unit_price: unitPrice,
    total: quantity * unitPrice,
    discount_amount: 0,
    tax_amount: 0,
    tax_rate: 0,
    created_at: FIXED_TS,
    updated_at: FIXED_TS,
    ...rest,
  };
}

function makeCart(overrides: Partial<Cart> = {}): Cart {
  return {
    id: 'cart-1',
    organization_id: 1,
    branch_id: 1,
    status: 'active',
    items: [],
    subtotal: 0,
    tax_amount: 0,
    tax_total: 0,
    discount_amount: 0,
    discount_total: 0,
    total: 0,
    created_at: FIXED_TS,
    updated_at: FIXED_TS,
    ...overrides,
  };
}

describe('projectCartForDisplay', () => {
  it('carrito vacío: sin líneas, totales en 0 y moneda de la organización', () => {
    const out = projectCartForDisplay(makeCart(), { currency: 'COP' });
    expect(out).toEqual({
      id: 'cart-1',
      currency: 'COP',
      lines: [],
      subtotal: 0,
      discountTotal: 0,
      discountLabel: null,
      taxTotal: 0,
      taxIncluded: false,
      total: 0,
      lastChangedLineId: null,
    });
  });

  it('no incluye el objeto product completo ni campos internos del ítem', () => {
    const cart = makeCart({
      items: [makeItem({ id: 'l1', product_id: 10, name: 'Café americano', quantity: 2, unit_price: 4500 })],
      subtotal: 9000,
      total: 9000,
    });
    const out = projectCartForDisplay(cart, { currency: 'COP' });
    const line = out.lines[0];
    expect(line).toEqual({
      id: 'l1',
      name: 'Café americano',
      qty: 2,
      unitPrice: 4500,
      total: 9000,
      modifiers: [],
      discount: null,
      note: null,
    });
    // Nada del producto (costo, descripción, sku) viaja a la pantalla.
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain('cost');
    expect(serialized).not.toContain('SKU-10');
    expect(serialized).not.toContain('descripción que no debe viajar');
    expect(serialized).not.toContain('product');
  });

  it('modificadores: nombre y extraPrice; el unitPrice ya los incluye (como posService.addItem)', () => {
    const cart = makeCart({
      items: [
        makeItem({
          id: 'l1',
          product_id: 10,
          name: 'Café americano',
          quantity: 2,
          unit_price: 4500 + 1500, // base + leche de almendras
          modifiers: [
            { groupId: 1, groupName: 'Leche', modifierId: 5, name: 'Leche de almendras', extraPrice: 1500 },
            { groupId: 2, groupName: 'Tamaño', modifierId: 9, name: 'Grande', extraPrice: 0 },
          ],
          notes: '  sin azúcar  ',
        }),
      ],
      subtotal: 12000,
      total: 12000,
    });
    const out = projectCartForDisplay(cart, { currency: 'COP' });
    expect(out.lines[0].unitPrice).toBe(6000);
    expect(out.lines[0].total).toBe(12000);
    expect(out.lines[0].modifiers).toEqual([
      { name: 'Leche de almendras', extraPrice: 1500 },
      { name: 'Grande', extraPrice: 0 },
    ]);
    expect(out.lines[0].note).toBe('sin azúcar');
  });

  it('descuento por línea y total: se copian del carrito; discountLabel es null (Cart no guarda cupón/promoción)', () => {
    const cart = makeCart({
      items: [
        makeItem({ id: 'l1', product_id: 10, quantity: 1, unit_price: 20000, discount_amount: 2000 }),
        makeItem({ id: 'l2', product_id: 11, quantity: 1, unit_price: 5000, discount_amount: 0 }),
      ],
      subtotal: 25000,
      discount_total: 2000,
      total: 23000,
    });
    const out = projectCartForDisplay(cart, { currency: 'COP' });
    expect(out.lines[0].discount).toBe(2000);
    expect(out.lines[1].discount).toBeNull();
    expect(out.discountTotal).toBe(2000);
    expect(out.discountLabel).toBeNull();
    expect(out.total).toBe(23000);
  });

  it('impuesto incluido: taxIncluded=true y el total no suma el impuesto aparte', () => {
    const cart = makeCart({
      tax_included: true,
      items: [makeItem({ id: 'l1', product_id: 10, quantity: 1, unit_price: 11900, tax_rate: 19, tax_amount: 1900, tax_included: true })],
      subtotal: 11900,
      tax_total: 1900,
      total: 11900,
    });
    const out = projectCartForDisplay(cart, { currency: 'COP' });
    expect(out.taxIncluded).toBe(true);
    expect(out.taxTotal).toBe(1900);
    expect(out.total).toBe(11900);
  });

  it('impuesto excluido: taxIncluded=false y el total lleva el impuesto sumado', () => {
    const cart = makeCart({
      tax_included: false,
      items: [makeItem({ id: 'l1', product_id: 10, quantity: 1, unit_price: 10000, tax_rate: 19, tax_amount: 1900, tax_included: false })],
      subtotal: 10000,
      tax_total: 1900,
      total: 11900,
    });
    const out = projectCartForDisplay(cart, { currency: 'COP' });
    expect(out.taxIncluded).toBe(false);
    expect(out.taxTotal).toBe(1900);
    expect(out.total).toBe(11900);
  });

  it('taxIncluded sale de las líneas, no de cart.tax_included (misma regla que calculateCartTotals, posService.ts:2407)', () => {
    const cart = makeCart({
      items: [
        makeItem({ id: 'l1', product_id: 10, tax_included: false }),
        makeItem({ id: 'l2', product_id: 11, tax_included: true }),
      ],
    });
    expect(projectCartForDisplay(cart, { currency: 'COP' }).taxIncluded).toBe(true);
    const cart2 = makeCart({ items: [makeItem({ id: 'l1', product_id: 10 })] });
    expect(projectCartForDisplay(cart2, { currency: 'COP' }).taxIncluded).toBe(false);
    // El flag del carrito puede quedar desfasado con el toggle por ítem: manda lo que calculó la caja.
    const cart3 = makeCart({ tax_included: true, items: [makeItem({ id: 'l1', product_id: 10, tax_included: false })] });
    expect(projectCartForDisplay(cart3, { currency: 'COP' }).taxIncluded).toBe(false);
  });

  it('carrito vacío: cart.tax_included solo sirve como etiqueta cuando no hay líneas', () => {
    expect(projectCartForDisplay(makeCart({ tax_included: true }), { currency: 'COP' }).taxIncluded).toBe(true);
    expect(projectCartForDisplay(makeCart({ tax_included: false }), { currency: 'COP' }).taxIncluded).toBe(false);
    expect(projectCartForDisplay(makeCart(), { currency: 'COP' }).taxIncluded).toBe(false);
  });

  it('line.total es qty × unitPrice (bruto) aunque calculateItemTaxes haya dejado item.total neto (impuesto incluido)', () => {
    // Estado real que deja calculateItemTaxes con IVA incluido y descuento:
    // item.total = taxableBase = 2 × 10000 − 2000 = 18000.
    const cart = makeCart({
      tax_included: true,
      items: [makeItem({ id: 'l1', product_id: 10, quantity: 2, unit_price: 10000, discount_amount: 2000, tax_included: true, tax_rate: 19, tax_amount: 2874, total: 18000 })],
      subtotal: 20000,
      discount_total: 2000,
      tax_total: 2874,
      total: 18000,
    });
    const out = projectCartForDisplay(cart, { currency: 'COP' });
    expect(out.lines[0].total).toBe(20000);
    expect(out.lines[0].discount).toBe(2000);
    expect(out.lines.reduce((sum, l) => sum + l.total, 0)).toBe(out.subtotal);
    expect(out.total).toBe(18000);
  });

  it('line.total no lleva el impuesto sumado aunque calculateItemTaxes lo haya dejado en item.total (impuesto excluido)', () => {
    // Impuesto excluido: item.total = taxableBase + tax = 10000 + 1900 = 11900.
    const cart = makeCart({
      tax_included: false,
      items: [makeItem({ id: 'l1', product_id: 10, quantity: 1, unit_price: 10000, tax_included: false, tax_rate: 19, tax_amount: 1900, total: 11900 })],
      subtotal: 10000,
      tax_total: 1900,
      total: 11900,
    });
    const out = projectCartForDisplay(cart, { currency: 'COP' });
    expect(out.lines[0].total).toBe(10000);
    expect(out.lines.reduce((sum, l) => sum + l.total, 0)).toBe(out.subtotal);
    expect(out.taxTotal).toBe(1900);
    expect(out.total).toBe(11900);
  });

  it('line.total no se redondea: misma aritmética que calculateCartTotals, así Σ líneas === subtotal con cantidades fraccionarias', () => {
    // Antes se redondeaba a 2 decimales y con productos por peso la suma de
    // líneas (3000) no cuadraba con el subtotal de la caja (2999.997).
    const items = [1, 2, 3].map((i) => makeItem({ id: `l${i}`, product_id: 10 + i, quantity: 0.3, unit_price: 3333.33 }));
    const subtotal = items.reduce((s, it) => s + it.quantity * it.unit_price, 0); // igual que posService
    const out = projectCartForDisplay(makeCart({ items, subtotal, total: subtotal }), { currency: 'COP' });
    expect(out.lines[0].total).toBe(0.3 * 3333.33);
    expect(out.lines.reduce((sum, l) => sum + l.total, 0)).toBe(out.subtotal);
  });

  it('lastChangedLineId solo se conserva si la línea existe en el carrito', () => {
    const cart = makeCart({ items: [makeItem({ id: 'l1', product_id: 10 })] });
    expect(projectCartForDisplay(cart, { currency: 'COP', lastChangedLineId: 'l1' }).lastChangedLineId).toBe('l1');
    expect(projectCartForDisplay(cart, { currency: 'COP', lastChangedLineId: 'borrada' }).lastChangedLineId).toBeNull();
    expect(projectCartForDisplay(cart, { currency: 'COP', lastChangedLineId: undefined }).lastChangedLineId).toBeNull();
  });

  it('valores no numéricos o ausentes se proyectan como 0, nunca NaN', () => {
    const item = makeItem({ id: 'l1', product_id: 10 });
    // Simula un carrito viejo de localStorage con campos corruptos.
    const corrupt = { ...item, total: undefined, discount_amount: Number.NaN } as unknown as CartItem;
    const cart = makeCart({ items: [corrupt], subtotal: Number.NaN, total: undefined as unknown as number });
    const out = projectCartForDisplay(cart, { currency: 'COP' });
    expect(out.lines[0].total).toBe(1000); // qty × unitPrice: `item.total` nunca se lee
    expect(out.lines[0].discount).toBeNull();
    expect(out.subtotal).toBe(0);
    expect(out.total).toBe(0);
    expect(JSON.stringify(out)).not.toContain('NaN');
  });

  it('es pura y determinista: mismo carrito → mismo resultado, y no muta la entrada', () => {
    const cart = makeCart({ items: [makeItem({ id: 'l1', product_id: 10, quantity: 3 })], subtotal: 3000, total: 3000 });
    const snapshot = JSON.stringify(cart);
    const a = projectCartForDisplay(cart, { currency: 'COP', lastChangedLineId: 'l1' });
    const b = projectCartForDisplay(cart, { currency: 'COP', lastChangedLineId: 'l1' });
    expect(a).toEqual(b);
    expect(JSON.stringify(cart)).toBe(snapshot);
  });

  it('200 líneas: proyecta todas, conserva el orden y pesa mucho menos que el carrito', () => {
    const items = Array.from({ length: 200 }, (_, i) =>
      makeItem({
        id: `l${i}`,
        product_id: 1000 + i,
        name: `Producto ${i}`,
        quantity: (i % 5) + 1,
        unit_price: 1000 + i,
        modifiers: i % 3 === 0 ? [{ groupId: 1, groupName: 'Extra', modifierId: i, name: `Extra ${i}`, extraPrice: 500 }] : undefined,
      }),
    );
    const subtotal = items.reduce((s, it) => s + it.total, 0);
    const cart = makeCart({ items, subtotal, total: subtotal });
    const out = projectCartForDisplay(cart, { currency: 'COP', lastChangedLineId: 'l199' });

    expect(out.lines).toHaveLength(200);
    expect(out.lines.map((l) => l.id)).toEqual(items.map((it) => it.id));
    expect(out.lines[199].qty).toBe(5);
    expect(out.lastChangedLineId).toBe('l199');
    expect(out.subtotal).toBe(subtotal);

    const projectedBytes = JSON.stringify(out).length;
    const cartBytes = JSON.stringify(cart).length;
    expect(projectedBytes).toBeLessThan(cartBytes / 2);
    expect(projectedBytes).toBeLessThan(60_000); // PLAN §13: ~30 KB con 200 líneas
  });
});
