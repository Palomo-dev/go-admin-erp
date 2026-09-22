/**
 * projectCartForDisplay: contrato que ve el cliente. No puede divergir del
 * recibo, así que aquí se fija qué se copia del carrito, qué se deriva y qué
 * se descarta. Suite única de la proyección (fusión de las rondas 1-7 de la
 * Parte A).
 *
 * Fixtures con organización ficticia (org 1). Sin nombres de clientes reales.
 */

import type { Cart, CartItem, Product } from '@/components/pos/types';
import { projectCartForDisplay, type DisplayTotalsOverride } from '@/lib/pos/display/projection';
import type { DisplayCart } from '@/lib/pos/display/protocol';

const TS = '2026-09-15T15:00:00.000Z';

function product(over: Partial<Product> & Record<string, unknown> = {}): Product {
  return {
    id: (over.id as number | undefined) ?? 1,
    organization_id: 1,
    sku: `SKU-${(over.id as number | undefined) ?? 1}`,
    name: (over.name as string | undefined) ?? `Producto ${(over.id as number | undefined) ?? 1}`,
    unit_code: 'UND',
    status: 'active',
    created_at: TS,
    updated_at: TS,
    description: 'descripción que no debe viajar a la pantalla',
    cost: 1234,
    ...over,
  } as Product;
}

function item(over: Partial<CartItem> & { product_id: number; name?: string }): CartItem {
  const { name, ...rest } = over;
  const quantity = rest.quantity ?? 1;
  const unit_price = rest.unit_price ?? 1000;
  return {
    id: rest.id ?? `l-${rest.product_id}`,
    cart_id: 'cart-1',
    product: product({ id: rest.product_id, name: name ?? `Producto ${rest.product_id}` }),
    quantity,
    unit_price,
    total: quantity * unit_price,
    discount_amount: 0,
    tax_amount: 0,
    tax_rate: 0,
    created_at: TS,
    updated_at: TS,
    ...rest,
  };
}

function cart(over: Partial<Cart> = {}): Cart {
  const items = over.items ?? [];
  // Los fixtures corruptos pueden traer null/primitivos dentro de items: se ignoran al sumar.
  const subtotal =
    over.subtotal ?? (Array.isArray(items) ? items.reduce((s, i) => s + (typeof i === 'object' && i !== null ? i.quantity * i.unit_price : 0), 0) : 0);
  return {
    id: 'cart-1',
    organization_id: 1,
    branch_id: 1,
    status: 'active',
    items,
    subtotal,
    tax_amount: 0,
    tax_total: over.tax_total ?? 0,
    discount_amount: 0,
    discount_total: over.discount_total ?? 0,
    total: over.total ?? subtotal,
    created_at: TS,
    updated_at: TS,
    ...over,
  };
}

/** Un valor corrupto, como puede dejarlo un localStorage de una versión vieja. */
function corrupt<T>(value: unknown): T {
  return value as T;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

const sumLines = (out: DisplayCart) => out.lines.reduce((s, l) => s + l.total, 0);

// ---------------------------------------------------------------------------
// Contrato básico
// ---------------------------------------------------------------------------

describe('proyección · contrato básico', () => {
  it('carrito vacío: sin líneas, totales en 0 y moneda de la organización', () => {
    expect(projectCartForDisplay(cart(), { currency: 'COP' })).toEqual({
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
      // F4: solo se PINTA con el ajuste `showCustomerName`; sin cliente, null.
      customerName: null,
    });
  });

  it('una línea: forma exacta de DisplayLine; nada del producto (costo, sku, descripción) viaja a la pantalla', () => {
    const c = cart({ items: [item({ id: 'l1', product_id: 10, name: 'Café americano', quantity: 2, unit_price: 4500 })] });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.lines[0]).toEqual({
      id: 'l1',
      name: 'Café americano',
      variant: null,
      qty: 2,
      unitPrice: 4500,
      total: 9000,
      modifiers: [],
      discount: null,
      note: null,
      taxExcluded: false,
      taxIncluded: false,
    });
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain('cost');
    expect(serialized).not.toContain('SKU-10');
    expect(serialized).not.toContain('descripción que no debe viajar');
    expect(serialized).not.toContain('product');
  });

  it('modificadores: nombre y extraPrice; el unitPrice ya los incluye (como posService.addItem); la nota se recorta', () => {
    const c = cart({
      items: [
        item({
          id: 'l1',
          product_id: 10,
          quantity: 2,
          unit_price: 4500 + 1500, // base + leche de almendras
          modifiers: [
            { groupId: 1, groupName: 'Leche', modifierId: 5, name: 'Leche de almendras', extraPrice: 1500 },
            { groupId: 2, groupName: 'Tamaño', modifierId: 9, name: 'Grande', extraPrice: 0 },
          ],
          notes: '  sin azúcar  ',
        }),
      ],
    });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.lines[0].unitPrice).toBe(6000);
    expect(out.lines[0].total).toBe(12000);
    expect(out.lines[0].modifiers).toEqual([
      { name: 'Leche de almendras', extraPrice: 1500 },
      { name: 'Grande', extraPrice: 0 },
    ]);
    expect(out.lines[0].note).toBe('sin azúcar');
  });

  it('modificador con extraPrice negativo (rebaja) se copia negativo; CartView solo muestra el «(+…)» cuando es > 0', () => {
    const c = cart({ items: [item({ product_id: 1, modifiers: [{ groupId: 1, groupName: 'Sin', modifierId: 1, name: 'Sin queso', extraPrice: -500 }] })] });
    expect(projectCartForDisplay(c, { currency: 'COP' }).lines[0].modifiers[0]).toEqual({ name: 'Sin queso', extraPrice: -500 });
  });

  it('descuento por línea y total se copian; discountLabel es null (Cart no guarda cupón/promoción)', () => {
    const c = cart({
      items: [item({ id: 'l1', product_id: 10, unit_price: 20000, discount_amount: 2000 }), item({ id: 'l2', product_id: 11, unit_price: 5000 })],
      discount_total: 2000,
      total: 23000,
    });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.lines[0].discount).toBe(2000);
    expect(out.lines[1].discount).toBeNull();
    expect(out.discountTotal).toBe(2000);
    expect(out.discountLabel).toBeNull();
    expect(out.total).toBe(23000);
  });

  it('descuento negativo o cero en la línea se proyecta como null; booleanos se coaccionan (Number(true) === 1)', () => {
    const c = cart({
      items: [
        item({ id: 'l1', product_id: 1, discount_amount: -10 }),
        item({ id: 'l2', product_id: 2, discount_amount: 0 }),
        item({ id: 'l3', product_id: 3, discount_amount: true as unknown as number }),
      ],
    });
    expect(projectCartForDisplay(c, { currency: 'COP' }).lines.map((l) => l.discount)).toEqual([null, null, 1]);
  });

  it('descuento mayor que el subtotal: se refleja el total negativo que dejó la caja (espejo, no calcula)', () => {
    // calculateCartTotals no clampa: total = subtotal + tax − discount puede ser < 0.
    const c = cart({ items: [item({ id: 'l1', product_id: 1, unit_price: 1000, discount_amount: 1500 })], discount_total: 1500, total: -500 });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.subtotal).toBe(1000);
    expect(out.discountTotal).toBe(1500);
    expect(out.lines[0].discount).toBe(1500);
    expect(out.lines[0].total).toBe(1000);
    expect(out.total).toBe(-500); // la Parte C decide cómo pintar un total negativo
  });

  it('notas: solo espacios → null; con texto se recortan los extremos y se conservan los saltos internos', () => {
    const c = cart({
      items: [
        item({ id: 'l1', product_id: 1, notes: '   ' }),
        item({ id: 'l2', product_id: 2, notes: ' bien caliente ' }),
        item({ id: 'l3', product_id: 3, notes: '  sin cebolla\n  bien caliente  ' }),
      ],
    });
    expect(projectCartForDisplay(c, { currency: 'COP' }).lines.map((l) => l.note)).toEqual([null, 'bien caliente', 'sin cebolla\n  bien caliente']);
  });

  it('lastChangedLineId solo se conserva si la línea existe; "" y undefined → null', () => {
    const c = cart({ items: [item({ id: 'l1', product_id: 10 })] });
    expect(projectCartForDisplay(c, { currency: 'COP', lastChangedLineId: 'l1' }).lastChangedLineId).toBe('l1');
    expect(projectCartForDisplay(c, { currency: 'COP', lastChangedLineId: 'borrada' }).lastChangedLineId).toBeNull();
    expect(projectCartForDisplay(c, { currency: 'COP', lastChangedLineId: undefined }).lastChangedLineId).toBeNull();
    expect(projectCartForDisplay(c, { currency: 'COP', lastChangedLineId: '' }).lastChangedLineId).toBeNull();
  });

  it('lastChangedLineId a la última de 200 líneas se conserva; a la 201 (inexistente) se anula', () => {
    const items = Array.from({ length: 200 }, (_, i) => item({ id: `l-${i}`, product_id: i + 1 }));
    const c = cart({ items });
    expect(projectCartForDisplay(c, { currency: 'COP', lastChangedLineId: 'l-199' }).lastChangedLineId).toBe('l-199');
    expect(projectCartForDisplay(c, { currency: 'COP', lastChangedLineId: 'l-200' }).lastChangedLineId).toBeNull();
  });

  it('dos ítems con el mismo id (carrito corrupto) producen dos líneas con la misma key; lastChangedLineId las resalta', () => {
    const c = cart({ items: [item({ id: 'dup', product_id: 1 }), item({ id: 'dup', product_id: 2 })] });
    const out = projectCartForDisplay(c, { currency: 'COP', lastChangedLineId: 'dup' });
    expect(out.lines.map((l) => l.id)).toEqual(['dup', 'dup']);
    expect(out.lastChangedLineId).toBe('dup');
  });

  it('es pura y determinista: mismo carrito (deep-freeze) → mismo resultado y misma serialización; no muta la entrada', () => {
    const items = Array.from({ length: 200 }, (_, i) =>
      item({
        product_id: i + 1,
        quantity: (i % 5) + 1,
        unit_price: 1000 + i,
        discount_amount: i % 7 === 0 ? 50 : 0,
        notes: i % 3 === 0 ? `nota ${i}` : undefined,
        modifiers: i % 2 === 0 ? [{ groupId: 1, groupName: 'Extras', modifierId: i, name: `Extra ${i}`, extraPrice: 200 }] : undefined,
      }),
    );
    const c = deepFreeze(cart({ items, tax_total: 1234, discount_total: 1450 }));
    const snapshot = JSON.stringify(c);
    const a = projectCartForDisplay(c, { currency: 'COP', lastChangedLineId: 'l-100' });
    const b = projectCartForDisplay(c, { currency: 'COP', lastChangedLineId: 'l-100' });
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(c)).toBe(snapshot);
    expect(a.lines).toHaveLength(200);
    expect(a.lastChangedLineId).toBe('l-100');
    expect(a.subtotal).toBeCloseTo(c.subtotal, 6);
  });

  it('la salida no comparte referencias con la entrada: mutar el DisplayCart no toca el Cart ni sus modificadores', () => {
    const mods = [{ groupId: 1, groupName: 'g', modifierId: 1, name: 'Grande', extraPrice: 500 }];
    const c = cart({ items: [item({ id: 'l1', product_id: 1, modifiers: mods })] });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    out.lines[0].modifiers[0].name = 'Pisado';
    out.lines[0].name = 'Pisado';
    expect(mods[0].name).toBe('Grande');
    expect(c.items[0].product.name).toBe('Producto 1');
    expect(out.lines[0].modifiers).not.toBe(mods);
  });

  it('la salida sobrevive a structuredClone y a JSON (lo que exigen BroadcastChannel y Realtime)', () => {
    const c = cart({
      items: [item({ id: 'l1', product_id: 1, notes: 'x', modifiers: [{ groupId: 1, groupName: 'g', modifierId: 1, name: 'M', extraPrice: 5 }] })],
    });
    const out = projectCartForDisplay(c, { currency: 'COP', lastChangedLineId: 'l1' });
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
    expect(structuredClone(out)).toEqual(out);
  });

  it('200 líneas: proyecta todas, conserva el orden y pesa mucho menos que el carrito (PLAN §13: ~30 KB)', () => {
    const items = Array.from({ length: 200 }, (_, i) =>
      item({
        id: `l${i}`,
        product_id: 1000 + i,
        name: `Producto ${i}`,
        quantity: (i % 5) + 1,
        unit_price: 1000 + i,
        modifiers: i % 3 === 0 ? [{ groupId: 1, groupName: 'Extra', modifierId: i, name: `Extra ${i}`, extraPrice: 500 }] : undefined,
      }),
    );
    const c = cart({ items });
    const out = projectCartForDisplay(c, { currency: 'COP', lastChangedLineId: 'l199' });
    expect(out.lines).toHaveLength(200);
    expect(out.lines.map((l) => l.id)).toEqual(items.map((it) => it.id));
    expect(out.lines[199].qty).toBe(5);
    expect(out.lastChangedLineId).toBe('l199');
    expect(out.subtotal).toBe(c.subtotal);
    const projectedBytes = JSON.stringify(out).length;
    expect(projectedBytes).toBeLessThan(JSON.stringify(c).length / 2);
    expect(projectedBytes).toBeLessThan(60_000);
  });

  it('200 líneas con 5 modificadores cada una pesan < 100 KB y se proyectan en menos de 50 ms', () => {
    const items = Array.from({ length: 200 }, (_, i) =>
      item({
        id: `l${i}`,
        product_id: i + 1,
        quantity: 2,
        unit_price: 1000 + i,
        notes: `n${i}`,
        modifiers: Array.from({ length: 5 }, (_, m) => ({ groupId: m, groupName: `g${m}`, modifierId: m, name: `Mod ${m}`, extraPrice: 100 })),
      }),
    );
    const c = cart({ items });
    const out = projectCartForDisplay(c, { currency: 'COP', lastChangedLineId: 'l199' });
    expect(out.lines).toHaveLength(200);
    expect(JSON.stringify(out).length).toBeLessThan(100_000);
    const t0 = performance.now();
    for (let k = 0; k < 20; k += 1) projectCartForDisplay(c, { currency: 'COP', lastChangedLineId: 'l199' });
    expect((performance.now() - t0) / 20).toBeLessThan(50);
  });
});

// ---------------------------------------------------------------------------
// D1 · totales: subtotal = Σ líneas brutas; el resto, del motor del recibo
// ---------------------------------------------------------------------------

describe('proyección · subtotal es siempre Σ line.total (bruto)', () => {
  it('ignora cart.subtotal aunque venga: la suma de líneas manda', () => {
    const c = cart({ items: [item({ id: 'l1', product_id: 1, quantity: 2, unit_price: 500 })], subtotal: 999_999, total: 1000 });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.subtotal).toBe(1000);
    expect(out.total).toBe(1000);
  });

  it('line.total es qty × unitPrice aunque calculateItemTaxes haya dejado item.total neto (impuesto incluido con descuento)', () => {
    // Estado real que deja calculateItemTaxes con IVA incluido y descuento:
    // item.total = taxableBase = 2 × 10000 − 2000 = 18000.
    const c = cart({
      tax_included: true,
      items: [item({ id: 'l1', product_id: 10, quantity: 2, unit_price: 10000, discount_amount: 2000, tax_included: true, tax_rate: 19, tax_amount: 2874, total: 18000 })],
      subtotal: 20000,
      discount_total: 2000,
      tax_total: 2874,
      total: 18000,
    });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.lines[0].total).toBe(20000);
    expect(out.lines[0].discount).toBe(2000);
    expect(sumLines(out)).toBe(out.subtotal);
    expect(out.total).toBe(18000);
  });

  it('line.total no lleva el impuesto sumado aunque item.total sí (impuesto excluido)', () => {
    // Impuesto excluido: item.total = taxableBase + tax = 10000 + 1900 = 11900.
    const c = cart({
      tax_included: false,
      items: [item({ id: 'l1', product_id: 10, unit_price: 10000, tax_included: false, tax_rate: 19, tax_amount: 1900, total: 11900 })],
      subtotal: 10000,
      tax_total: 1900,
      total: 11900,
    });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.lines[0].total).toBe(10000);
    expect(out.subtotal).toBe(10000);
    expect(out.taxTotal).toBe(1900);
    expect(out.total).toBe(11900);
  });

  it('sin redondeo por línea: con 3 × (0.3 × 3333.33) el subtotal es 2999.997, la misma aritmética que calculateCartTotals', () => {
    const items = [1, 2, 3].map((i) => item({ id: `l${i}`, product_id: 10 + i, quantity: 0.3, unit_price: 3333.33 }));
    const out = projectCartForDisplay(cart({ items }), { currency: 'COP' });
    expect(out.lines[0].total).toBe(0.3 * 3333.33);
    expect(out.subtotal).toBeCloseTo(2999.997, 3);
    expect(out.subtotal).toBe(items.reduce((s, it) => s + it.quantity * it.unit_price, 0));
  });

  it('cantidad 0, negativa (devolución), fraccionaria, NaN o Infinity: qty finita y total = qty × unitPrice, nunca NaN', () => {
    const c = cart({
      items: [
        item({ id: 'a', product_id: 1, quantity: 0, unit_price: 1000 }),
        item({ id: 'b', product_id: 2, quantity: -2, unit_price: 100 }),
        item({ id: 'c', product_id: 3, quantity: 0.5, unit_price: 1000 }),
        item({ id: 'd', product_id: 4, quantity: NaN, unit_price: 1000 }),
        item({ id: 'e', product_id: 5, quantity: Infinity, unit_price: 1000 }),
      ],
    });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.lines.map((l) => l.qty)).toEqual([0, -2, 0.5, 0, 0]);
    expect(out.lines.map((l) => l.total)).toEqual([0, -200, 500, 0, 0]);
    expect(out.subtotal).toBe(300);
    expect(JSON.stringify(out)).not.toContain('NaN');
  });
});

describe('proyección · override de totales (motor del recibo) y campos del carrito', () => {
  const excluida = () =>
    cart({
      items: [item({ id: 'l1', product_id: 1, unit_price: 10000, tax_excluded: true, tax_amount: 1900, tax_rate: 19, tax_included: false, total: 11900 })],
      tax_total: 1900,
      total: 11900,
    });

  it('sin override (ausente, undefined o null) se copian discount_total, tax_total y total del carrito', () => {
    for (const totals of [undefined, null]) {
      const out = projectCartForDisplay(excluida(), { currency: 'COP', totals });
      expect(out.subtotal).toBe(10000);
      expect(out.taxTotal).toBe(1900);
      expect(out.total).toBe(11900);
      expect(out.taxIncluded).toBe(false);
      expect(out.lines[0].taxExcluded).toBe(true);
    }
    expect(projectCartForDisplay(excluida(), { currency: 'COP' }).total).toBe(11900);
  });

  it('con override, discountTotal/taxTotal/total son los del motor del recibo; el subtotal sigue siendo Σ líneas', () => {
    // CartView.handleToggleTax marca `tax_excluded` y NO recalcula, así que
    // cart.total conserva el impuesto (11.900); TaxSummary muestra 10.000.
    const totals: DisplayTotalsOverride = { discountTotal: 0, taxTotal: 0, total: 10000 };
    const out = projectCartForDisplay(excluida(), { currency: 'COP', totals });
    expect(out.subtotal).toBe(10000);
    expect(out.discountTotal).toBe(0);
    expect(out.taxTotal).toBe(0);
    expect(out.total).toBe(10000);
    expect(out.lines[0].total).toBe(10000); // las líneas no cambian con el override
  });

  it('el override no puede tocar el subtotal: un override parcial ({ total }) deja taxTotal en 0 pero el subtotal intacto', () => {
    const c = cart({ items: [item({ product_id: 1 })], tax_total: 190, total: 1190 });
    const parcial = { total: 999 } as unknown as DisplayTotalsOverride;
    const out = projectCartForDisplay(c, { currency: 'COP', totals: parcial });
    expect(out.subtotal).toBe(1000);
    expect(out.total).toBe(999);
    expect(out.taxTotal).toBe(0);
    expect(out.discountTotal).toBe(0);
  });

  it('el override se normaliza como el carrito: NaN → 0, string → número, descuento negativo → 0', () => {
    const out = projectCartForDisplay(excluida(), {
      currency: 'COP',
      totals: { discountTotal: -1, taxTotal: '19' as unknown as number, total: Number.NaN },
    });
    expect(out.discountTotal).toBe(0);
    expect(out.taxTotal).toBe(19);
    expect(out.total).toBe(0);
    expect(out.subtotal).toBe(10000);
  });

  it('el override no rompe la pureza: misma entrada → misma salida, y no muta el carrito', () => {
    const c = excluida();
    const totals: DisplayTotalsOverride = { discountTotal: 2, taxTotal: 3, total: 4 };
    expect(projectCartForDisplay(c, { currency: 'COP', totals })).toEqual(projectCartForDisplay(c, { currency: 'COP', totals }));
    expect(c.total).toBe(11900);
  });

  it('importes del carrito como string ("1500") se proyectan como número; NaN/undefined → 0', () => {
    const c = cart({ items: [item({ product_id: 1, unit_price: 1500 })], tax_total: '190' as unknown as number, total: '1690' as unknown as number });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.taxTotal).toBe(190);
    expect(out.total).toBe(1690);
    const c2 = cart({ items: [item({ product_id: 1 })], tax_total: Number.NaN, total: undefined as unknown as number });
    const out2 = projectCartForDisplay(c2, { currency: 'COP' });
    expect(out2.taxTotal).toBe(0);
    expect(out2.total).toBe(0);
    expect(JSON.stringify(out2)).not.toContain('NaN');
  });

  it('discountTotal: -500 → 0 (un descuento negativo es un bug de la caja, no un descuento); 500, 0, NaN, "250", -0 → 500, 0, 0, 250, 0', () => {
    const out = projectCartForDisplay(cart({ items: [item({ product_id: 1 })], discount_total: -500, total: 1500 }), { currency: 'COP' });
    expect(out.discountTotal).toBe(0);
    expect(out.total).toBe(1500);
    const proj = (discount_total: number) => projectCartForDisplay(cart({ discount_total }), { currency: 'COP' }).discountTotal;
    expect(proj(500)).toBe(500);
    expect(proj(0)).toBe(0);
    expect(proj(Number.NaN)).toBe(0);
    expect(proj('250' as unknown as number)).toBe(250);
    expect(proj(-0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Impuesto: por línea y por carrito
// ---------------------------------------------------------------------------

describe('proyección · taxIncluded / taxExcluded', () => {
  it('impuesto incluido: taxIncluded=true y el total no suma el impuesto aparte', () => {
    const c = cart({
      tax_included: true,
      items: [item({ id: 'l1', product_id: 10, unit_price: 11900, tax_rate: 19, tax_amount: 1900, tax_included: true })],
      tax_total: 1900,
      total: 11900,
    });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.taxIncluded).toBe(true);
    expect(out.lines[0].taxIncluded).toBe(true);
    expect(out.taxTotal).toBe(1900);
    expect(out.total).toBe(11900);
  });

  it('impuesto excluido: taxIncluded=false y el total lleva el impuesto sumado', () => {
    const c = cart({
      tax_included: false,
      items: [item({ id: 'l1', product_id: 10, unit_price: 10000, tax_rate: 19, tax_amount: 1900, tax_included: false })],
      tax_total: 1900,
      total: 11900,
    });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.taxIncluded).toBe(false);
    expect(out.lines[0].taxIncluded).toBe(false);
    expect(out.taxTotal).toBe(1900);
    expect(out.total).toBe(11900);
  });

  it('DisplayCart.taxIncluded sale de las líneas, no de cart.tax_included (misma regla que calculateCartTotals, posService.ts:2407)', () => {
    const c = cart({ items: [item({ id: 'l1', product_id: 10, tax_included: false }), item({ id: 'l2', product_id: 11, tax_included: true })] });
    expect(projectCartForDisplay(c, { currency: 'COP' }).taxIncluded).toBe(true);
    expect(projectCartForDisplay(cart({ items: [item({ id: 'l1', product_id: 10 })] }), { currency: 'COP' }).taxIncluded).toBe(false);
    // El flag del carrito puede quedar desfasado con el toggle por ítem: manda lo que calculó la caja.
    const c3 = cart({ tax_included: true, items: [item({ id: 'l1', product_id: 10, tax_included: false })] });
    expect(projectCartForDisplay(c3, { currency: 'COP' }).taxIncluded).toBe(false);
    const c4 = cart({ tax_included: false, items: [item({ id: 'l1', product_id: 1, tax_included: true }), item({ id: 'l2', product_id: 2, tax_included: false })] });
    expect(projectCartForDisplay(c4, { currency: 'COP' }).taxIncluded).toBe(true);
  });

  it('carrito sin líneas: cart.tax_included solo sirve como etiqueta', () => {
    expect(projectCartForDisplay(cart({ tax_included: true }), { currency: 'COP' }).taxIncluded).toBe(true);
    expect(projectCartForDisplay(cart({ tax_included: false }), { currency: 'COP' }).taxIncluded).toBe(false);
    expect(projectCartForDisplay(cart(), { currency: 'COP' }).taxIncluded).toBe(false);
    expect(projectCartForDisplay(cart({ items: corrupt([null]), tax_included: false }), { currency: 'COP' }).taxIncluded).toBe(false);
  });

  it('truthy no booleano (1, "true" desde localStorage) cuenta como incluido/excluido, igual que lo tratan calculateCartTotals y calculateCartTaxes', () => {
    const c = cart({
      items: [item({ id: 'l1', product_id: 1, tax_included: 1 as unknown as boolean }), item({ id: 'l2', product_id: 2, tax_excluded: 'true' as unknown as boolean })],
    });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.taxIncluded).toBe(true);
    expect(out.lines.map((l) => [l.taxIncluded, l.taxExcluded])).toEqual([
      [true, false],
      [false, true],
    ]);
  });

  it('carrito mixto (una línea incluida, otra no): taxIncluded=true en el carrito y cada línea dice lo suyo; total y taxTotal se copian de la caja', () => {
    // Cifras tal como las deja posService.calculateCartTotals: tax_total = Σ
    // tax_amount de TODAS las líneas, total = subtotal + impuesto de las NO
    // incluidas − descuento. Un solo booleano no lo expresa: la Parte C mira las líneas.
    const c = cart({
      items: [
        item({ id: 'inc', product_id: 1, unit_price: 11900, tax_included: true, tax_rate: 19, tax_amount: 1900 }),
        item({ id: 'exc', product_id: 2, unit_price: 10000, tax_included: false, tax_rate: 19, tax_amount: 1900 }),
      ],
      tax_total: 3800,
      total: 23800,
    });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.taxIncluded).toBe(true);
    expect(out.lines.map((l) => l.taxIncluded)).toEqual([true, false]);
    expect(out.subtotal).toBe(21900);
    expect(out.taxTotal).toBe(3800);
    expect(out.total).toBe(23800);
    expect(out.total).not.toBe(out.subtotal - out.discountTotal);
  });
});

// ---------------------------------------------------------------------------
// D2 · variantes
// ---------------------------------------------------------------------------

describe('proyección · variantes (product.variant_data)', () => {
  it('con variant_data: name es product.name y variant trae los pares con valor, en el orden de la BD', () => {
    const variante = product({ id: 9, name: 'Camiseta - Variante 2', variant_data: { Talla: 'M', Color: 'Azul' } });
    const out = projectCartForDisplay(cart({ items: [item({ product_id: 9, product: variante })] }), { currency: 'COP' });
    expect(out.lines[0].name).toBe('Camiseta - Variante 2');
    expect(out.lines[0].variant).toEqual([
      { attr: 'Talla', value: 'M' },
      { attr: 'Color', value: 'Azul' },
    ]);
  });

  it('sin variant_data (o vacío, null, no objeto): variant es null', () => {
    const casos = [product({ id: 1 }), product({ id: 2, variant_data: {} }), product({ id: 3, variant_data: null }), product({ id: 4, variant_data: 'M' }), product({ id: 5, variant_data: ['M'] })];
    const c = cart({ items: casos.map((p) => item({ product_id: p.id, product: p })) });
    expect(projectCartForDisplay(c, { currency: 'COP' }).lines.map((l) => l.variant)).toEqual([null, null, null, null, null]);
  });

  it('valores vacíos, nulos o no textuales se omiten (como el filtro `!!v` de CartView); números finitos se convierten a texto', () => {
    const p = product({ id: 9, name: 'Zapato', variant_data: { Talla: 38, Color: '', Material: null, Ancho: '  ', Corte: 'Bajo' } });
    const out = projectCartForDisplay(cart({ items: [item({ product_id: 9, product: p })] }), { currency: 'COP' });
    expect(out.lines[0].variant).toEqual([
      { attr: 'Talla', value: '38' },
      { attr: 'Corte', value: 'Bajo' },
    ]);
    const soloVacios = product({ id: 10, variant_data: { Talla: '', Color: null } });
    expect(projectCartForDisplay(cart({ items: [item({ product_id: 10, product: soloVacios })] }), { currency: 'COP' }).lines[0].variant).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// D5 · entradas ausentes o inválidas: nunca lanza
// ---------------------------------------------------------------------------

describe('proyección · sin carrito y moneda inválida', () => {
  it('cart null/undefined → DisplayCart vacío con la moneda de opts, sin lanzar (la Parte B debe emitir idle con cart null)', () => {
    for (const sinCarrito of [null, undefined]) {
      expect(projectCartForDisplay(sinCarrito, { currency: 'USD', lastChangedLineId: 'l1' })).toEqual({
        id: '',
        currency: 'USD',
        lines: [],
        subtotal: 0,
        discountTotal: 0,
        discountLabel: null,
        taxTotal: 0,
        taxIncluded: false,
        total: 0,
        lastChangedLineId: null,
        customerName: null,
      });
    }
  });

  it('un primitivo colado como carrito (string, número) tampoco lanza', () => {
    expect(() => projectCartForDisplay('cart' as unknown as Cart, { currency: 'COP' })).not.toThrow();
    expect(projectCartForDisplay(42 as unknown as Cart, { currency: 'COP' }).lines).toEqual([]);
  });

  it('un carrito vacío de verdad (items: []) proyecta su id y su flag de impuesto, no el vacío genérico; cart.id no string → ""', () => {
    const out = projectCartForDisplay(cart({ id: 'c-vacio', tax_included: true }), { currency: 'COP' });
    expect(out.id).toBe('c-vacio');
    expect(out.taxIncluded).toBe(true);
    expect(projectCartForDisplay(cart({ id: undefined as unknown as string }), { currency: 'COP' }).id).toBe('');
  });

  it('currency que no es string no vacío ("", undefined) → "COP" y un único console.warn por carga', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(projectCartForDisplay(cart(), { currency: '' }).currency).toBe('COP');
      expect(projectCartForDisplay(cart({ items: [item({ product_id: 1 })] }), { currency: undefined as unknown as string }).currency).toBe('COP');
      expect(projectCartForDisplay(null, { currency: 7 as unknown as string }).currency).toBe('COP');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('[pos-display]');
      // Una moneda válida se copia tal cual.
      expect(projectCartForDisplay(cart(), { currency: 'USD' }).currency).toBe('USD');
    } finally {
      warn.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// Carritos viejos o corruptos de localStorage
// ---------------------------------------------------------------------------

describe('proyección · carritos corruptos de localStorage', () => {
  it('cart.items no es array (null, undefined, objeto) → sin líneas, subtotal 0, no lanza', () => {
    for (const items of [null, undefined, { a: 1 }]) {
      const broken = { ...cart({ tax_included: true }), items } as unknown as Cart;
      expect(() => projectCartForDisplay(broken, { currency: 'COP' })).not.toThrow();
      const out = projectCartForDisplay(broken, { currency: 'COP' });
      expect(out.lines).toEqual([]);
      expect(out.subtotal).toBe(0);
    }
    expect(projectCartForDisplay({ ...cart(), items: null } as unknown as Cart, { currency: 'COP' }).taxIncluded).toBe(false);
  });

  it('items con null, undefined y primitivos → solo las entradas objeto se proyectan, en su orden; los nulos no cuentan para taxIncluded', () => {
    const c = cart({ items: corrupt([null, item({ id: 'l1', product_id: 1 }), undefined, 7, 'x', item({ id: 'l2', product_id: 2, tax_included: true })]) });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.lines.map((l) => l.id)).toEqual(['l1', 'l2']);
    expect(out.taxIncluded).toBe(true);
    expect(out.subtotal).toBe(2000);
  });

  it('modifiers con null y primitivos → solo los objeto; extraPrice ausente/null/string → número; nombre no string → ""', () => {
    const mods = corrupt<CartItem['modifiers']>([
      null,
      { groupId: 1, groupName: 'g', modifierId: 1, name: 'Sin precio', extraPrice: undefined },
      0,
      { groupId: 1, groupName: 'g', modifierId: 2, name: 'Nulo', extraPrice: null },
      false,
      { groupId: 1, groupName: 'g', modifierId: 3, name: 'Texto', extraPrice: '300' },
      { groupId: 1, groupName: 'g', modifierId: 4, name: 42, extraPrice: 100 },
      { name: 'x'.repeat(500), extraPrice: 0 },
    ]);
    const c = cart({ items: [item({ id: 'l1', product_id: 1, notes: 'sin sal', modifiers: mods })] });
    const line = projectCartForDisplay(c, { currency: 'COP' }).lines[0];
    expect(line.modifiers).toEqual([
      { name: 'Sin precio', extraPrice: 0 },
      { name: 'Nulo', extraPrice: 0 },
      { name: 'Texto', extraPrice: 300 },
      { name: '', extraPrice: 100 },
      { name: 'x'.repeat(500), extraPrice: 0 },
    ]);
    expect(line.note).toBe('sin sal');
  });

  it('modifiers que no es array (objeto suelto) → []', () => {
    const c = cart({ items: [item({ id: 'l1', product_id: 1, modifiers: corrupt({ name: 'x', extraPrice: 1 }) })] });
    expect(projectCartForDisplay(c, { currency: 'COP' }).lines[0].modifiers).toEqual([]);
  });

  it('producto ausente → name "" y variant null; modifiers y note siguen saliendo; product.name no string → ""', () => {
    const sinProducto = { ...item({ id: 'l1', product_id: 1, notes: 'n' }), product: undefined } as unknown as CartItem;
    const line = projectCartForDisplay(cart({ items: [sinProducto] }), { currency: 'COP' }).lines[0];
    expect(line.name).toBe('');
    expect(line.variant).toBeNull();
    expect(line.note).toBe('n');
    const nombreRoto = item({ id: 'l2', product_id: 2 });
    (nombreRoto.product as unknown as { name: unknown }).name = 42;
    expect(projectCartForDisplay(cart({ items: [nombreRoto] }), { currency: 'COP' }).lines[0].name).toBe('');
  });

  it('cantidad y precio como string (CartView hace parseFloat) se proyectan como número; coma decimal ("1,5") → 0 como en la caja', () => {
    const c = cart({ items: [item({ id: 'l1', product_id: 1, quantity: '2' as unknown as number, unit_price: '1500.5' as unknown as number })] });
    const line = projectCartForDisplay(c, { currency: 'COP' }).lines[0];
    expect(line.qty).toBe(2);
    expect(line.unitPrice).toBe(1500.5);
    expect(line.total).toBe(3001);
    const coma = cart({ items: [item({ id: 'l1', product_id: 1, quantity: '1,5' as unknown as number })] });
    const out = projectCartForDisplay(coma, { currency: 'COP' });
    expect(out.lines[0].qty).toBe(0);
    expect(out.lines[0].total).toBe(0);
    expect(out.subtotal).toBe(0);
  });

  it('ítem sin id → id derivado estable (linea:<product_id>:<posición entre las proyectadas>); sin product_id → "x"', () => {
    const noId1 = item({ id: '', product_id: 5 });
    const noId2 = item({ id: corrupt(undefined), product_id: 6 });
    const c = cart({ items: corrupt([null, noId1, item({ id: 'l', product_id: 1 }), noId2]) });
    const a = projectCartForDisplay(c, { currency: 'COP' });
    expect(a.lines.map((l) => l.id)).toEqual(['linea:5:0', 'l', 'linea:6:2']);
    expect(a).toEqual(projectCartForDisplay(c, { currency: 'COP' }));
    expect(JSON.parse(JSON.stringify(a)).lines[0]).toHaveProperty('id', 'linea:5:0');
    const sinProductId = cart({ items: [item({ id: '', product_id: corrupt(undefined) })] });
    expect(projectCartForDisplay(sinProductId, { currency: 'COP' }).lines[0].id).toBe('linea:x:0');
  });

  it('lastChangedLineId puede apuntar a un id derivado', () => {
    const c = cart({ items: [item({ id: '', product_id: 9 })] });
    const out = projectCartForDisplay(c, { currency: 'COP', lastChangedLineId: 'linea:9:0' });
    expect(out.lines[0].id).toBe('linea:9:0');
    expect(out.lastChangedLineId).toBe('linea:9:0');
  });
});
