/**
 * TESTER ronda 3 — proyección y protocolo: carritos corruptos de localStorage,
 * bordes numéricos y lo que atraviesa un round-trip JSON.
 *
 * Ronda 4 (cierre): los `it.failing` de la ronda 3 pasaron a `it` y ahora
 * fijan el contrato (entradas nulas se filtran; id derivado si falta).
 *
 * Fixtures con organización ficticia (org 1). Sin nombres de clientes reales.
 */

import type { Cart, CartItem, Product } from '@/components/pos/types';
import { projectCartForDisplay } from '@/lib/pos/display/projection';
import { isDownMessage, isUpMessage, type DisplayState } from '@/lib/pos/display/protocol';

const TS = '2026-09-15T15:00:00.000Z';
const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const INSTANCE = '11111111-1111-4111-8111-111111111111';

function product(id: number, name = `Producto ${id}`): Product {
  return { id, organization_id: 1, sku: `SKU-${id}`, name, unit_code: 'UND', status: 'active', created_at: TS, updated_at: TS };
}
function item(over: Partial<CartItem> & { id: string; product_id: number }): CartItem {
  const quantity = over.quantity ?? 1;
  const unit_price = over.unit_price ?? 1000;
  return {
    cart_id: 'cart-1', product: product(over.product_id), quantity, unit_price,
    total: quantity * unit_price, discount_amount: 0, tax_amount: 0, tax_rate: 0, created_at: TS, updated_at: TS, ...over,
  };
}
function cart(over: Partial<Cart> = {}): Cart {
  return {
    id: 'cart-1', organization_id: 1, branch_id: 1, status: 'active', items: [],
    subtotal: 0, tax_amount: 0, tax_total: 0, discount_amount: 0, discount_total: 0, total: 0,
    created_at: TS, updated_at: TS, ...over,
  };
}
/** Un carrito con elementos corruptos, como puede dejarlo un localStorage de una versión vieja. */
function corrupt<T>(value: unknown): T {
  return value as T;
}

describe('TESTER proyección: elementos nulos dentro del carrito', () => {
  /**
   * projectCartForDisplay tolera `items` no-array, NaN, product ausente y
   * modifiers no-array; un `null` DENTRO de `modifiers` o de `items` se
   * filtra. La Parte B la llama tras cada mutación del carrito: un throw
   * aquí rompería la venta por culpa de la pantalla (PLAN §5.5).
   */
  it('un modificador null (o primitivo) dentro de modifiers no hace lanzar: se omite', () => {
    const c = cart({ items: [item({ id: 'l1', product_id: 1, modifiers: corrupt([{ groupId: 1, groupName: 'g', modifierId: 1, name: 'Ok', extraPrice: 500 }, null, 5]) })] });
    expect(() => projectCartForDisplay(c, { currency: 'COP' })).not.toThrow();
    expect(projectCartForDisplay(c, { currency: 'COP' }).lines[0].modifiers).toEqual([{ name: 'Ok', extraPrice: 500 }]);
  });

  it('un ítem null o undefined dentro de items no hace lanzar: se omite', () => {
    const c = cart({ items: corrupt([item({ id: 'l1', product_id: 1 }), null, undefined]) });
    expect(() => projectCartForDisplay(c, { currency: 'COP' })).not.toThrow();
    expect(projectCartForDisplay(c, { currency: 'COP' }).lines.map((l) => l.id)).toEqual(['l1']);
  });
});

describe('TESTER proyección: bordes numéricos y de forma', () => {
  it('cantidad 0 → total 0 y la línea se conserva (la caja decide si la muestra)', () => {
    const out = projectCartForDisplay(cart({ items: [item({ id: 'l1', product_id: 1, quantity: 0, unit_price: 500 })] }), { currency: 'COP' });
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0]).toMatchObject({ qty: 0, total: 0, unitPrice: 500 });
  });

  it('descuento mayor que el subtotal: se copian los totales negativos de la caja sin acotar (espejo, no calcula)', () => {
    const c = cart({ items: [item({ id: 'l1', product_id: 1, unit_price: 1000, discount_amount: 5000 })], subtotal: 1000, discount_total: 5000, total: -4000 });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.lines[0].discount).toBe(5000);
    expect(out.discountTotal).toBe(5000);
    expect(out.total).toBe(-4000); // la Parte C debe decidir cómo pintar un total negativo
  });

  it('cantidad negativa (devolución en carrito) produce total negativo por línea, no NaN', () => {
    const out = projectCartForDisplay(cart({ items: [item({ id: 'l1', product_id: 1, quantity: -2, unit_price: 100 })] }), { currency: 'COP' });
    expect(out.lines[0].total).toBe(-200);
  });

  it('descuento negativo o cero se proyecta como null', () => {
    const c = cart({ items: [item({ id: 'l1', product_id: 1, discount_amount: -10 }), item({ id: 'l2', product_id: 2, discount_amount: 0 })] });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.lines.map((l) => l.discount)).toEqual([null, null]);
  });

  it('modificador con extraPrice string o ausente → número (0 si ausente); nombre no string → ""', () => {
    const c = cart({
      items: [item({ id: 'l1', product_id: 1, modifiers: corrupt([{ name: 'Con precio', extraPrice: '1500' }, { name: 'Sin precio' }, { name: 42, extraPrice: 1 }]) })],
    });
    expect(projectCartForDisplay(c, { currency: 'COP' }).lines[0].modifiers).toEqual([
      { name: 'Con precio', extraPrice: 1500 },
      { name: 'Sin precio', extraPrice: 0 },
      { name: '', extraPrice: 1 },
    ]);
  });

  it('modifiers que no es array (objeto suelto) → []', () => {
    const c = cart({ items: [item({ id: 'l1', product_id: 1, modifiers: corrupt({ name: 'x', extraPrice: 1 }) })] });
    expect(projectCartForDisplay(c, { currency: 'COP' }).lines[0].modifiers).toEqual([]);
  });

  it('items undefined o null → sin líneas y sin lanzar', () => {
    expect(projectCartForDisplay(cart({ items: corrupt(undefined) }), { currency: 'COP' }).lines).toEqual([]);
    expect(projectCartForDisplay(cart({ items: corrupt(null) }), { currency: 'COP' }).lines).toEqual([]);
  });

  it('ítem sin id se proyecta con un id derivado estable (product_id + posición): la Parte C siempre tiene key', () => {
    const noId = item({ id: 'l1', product_id: 7 });
    delete (noId as Partial<CartItem>).id;
    const out = projectCartForDisplay(cart({ items: [item({ id: 'l0', product_id: 1 }), noId] }), { currency: 'COP', lastChangedLineId: corrupt(undefined) });
    expect(out.lines[1].id).toBe('linea:7:1');
    expect(JSON.parse(JSON.stringify(out)).lines[1]).toHaveProperty('id', 'linea:7:1');
  });

  it('lastChangedLineId "" no coincide con ninguna línea → null', () => {
    const out = projectCartForDisplay(cart({ items: [item({ id: 'l1', product_id: 1 })] }), { currency: 'COP', lastChangedLineId: '' });
    expect(out.lastChangedLineId).toBeNull();
  });

  it('notas: solo espacios → null; con texto se recorta', () => {
    const c = cart({ items: [item({ id: 'l1', product_id: 1, notes: '   ' }), item({ id: 'l2', product_id: 2, notes: ' bien caliente ' })] });
    expect(projectCartForDisplay(c, { currency: 'COP' }).lines.map((l) => l.note)).toEqual([null, 'bien caliente']);
  });

  it('producto ausente → name ""; modifiers y note siguen saliendo', () => {
    const noProduct = item({ id: 'l1', product_id: 1, notes: 'n' });
    (noProduct as { product?: Product }).product = undefined;
    const line = projectCartForDisplay(cart({ items: [noProduct] }), { currency: 'COP' }).lines[0];
    expect(line.name).toBe('');
    expect(line.note).toBe('n');
  });

  it('mezcla de líneas con y sin impuesto incluido → taxIncluded=true y taxTotal copiado (misma regla que calculateCartTotals)', () => {
    // La caja calcula: hasAnyTaxIncluded=true; tax_total suma AMBOS impuestos; total = subtotal + extraTax(excluidos) − descuento.
    const c = cart({
      items: [
        item({ id: 'l1', product_id: 1, unit_price: 11900, tax_included: true, tax_rate: 19, tax_amount: 1900 }),
        item({ id: 'l2', product_id: 2, unit_price: 10000, tax_included: false, tax_rate: 19, tax_amount: 1900 }),
      ],
      subtotal: 21900, tax_total: 3800, total: 23800,
    });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.taxIncluded).toBe(true);
    expect(out.taxTotal).toBe(3800); // la etiqueta "IVA incluido 3.800" es lo que dice la caja; la pantalla no lo corrige
    expect(out.total).toBe(23800);
  });

  it('currency se copia tal cual, incluso vacía (no se valida: la organización la define)', () => {
    expect(projectCartForDisplay(cart(), { currency: '' }).currency).toBe('');
  });

  it('200 líneas con modificadores se proyectan en menos de 50 ms', () => {
    const items = Array.from({ length: 200 }, (_, i) =>
      item({ id: `l${i}`, product_id: i, quantity: 2, unit_price: 1000 + i, modifiers: [{ groupId: 1, groupName: 'g', modifierId: i, name: `M${i}`, extraPrice: 10 }], notes: `n${i}` }),
    );
    const c = cart({ items });
    const t0 = performance.now();
    for (let k = 0; k < 20; k += 1) projectCartForDisplay(c, { currency: 'COP', lastChangedLineId: 'l199' });
    const perCall = (performance.now() - t0) / 20;
    expect(perCall).toBeLessThan(50);
  });
});

describe('TESTER protocolo: round-trip JSON y guards', () => {
  const empty: DisplayState = { mode: 'idle', cart: null, payment: null, tip: null, thanks: null };
  const down = (extra: Record<string, unknown>) => ({ v: 1, seq: 1, terminalId: TERMINAL, instanceId: INSTANCE, ...extra });

  it('un state con carrito proyectado sobrevive JSON.parse(JSON.stringify()) y pasa el guard (Fase 3: Realtime serializa a JSON)', () => {
    const projected = projectCartForDisplay(
      cart({ items: [item({ id: 'l1', product_id: 1, notes: 'x', modifiers: [{ groupId: 1, groupName: 'g', modifierId: 1, name: 'M', extraPrice: 5 }] })], subtotal: 1000, total: 1000 }),
      { currency: 'COP', lastChangedLineId: 'l1' },
    );
    const msg = down({ t: 'state', state: { ...empty, mode: 'order', cart: projected } });
    const roundTrip: unknown = JSON.parse(JSON.stringify(msg));
    expect(isDownMessage(roundTrip)).toBe(true);
    expect(roundTrip).toEqual(msg);
  });

  it('isDownMessage e isUpMessage devuelven siempre boolean estricto (nunca undefined)', () => {
    for (const t of ['hello', 'state', 'heartbeat', 'bye', 'need_snapshot', 'tip_selected', 'qr_paid_claim', 'rating', 'otro', '']) {
      expect(typeof isDownMessage(down({ t }))).toBe('boolean');
      expect(typeof isUpMessage({ v: 1, terminalId: TERMINAL, t })).toBe('boolean');
    }
  });

  it('need_snapshot con toInstanceId válido pasa; con toInstanceId null se rechaza (null no es "ausente")', () => {
    const base = { v: 1, t: 'need_snapshot', terminalId: TERMINAL, capabilities: { touch: true, width: 1, height: 1 } };
    expect(isUpMessage({ ...base, toInstanceId: INSTANCE })).toBe(true);
    expect(isUpMessage({ ...base, toInstanceId: null })).toBe(false);
  });

  it('tip_selected: value -0 y 0 pasan; -1, Infinity y string no', () => {
    const base = { v: 1, t: 'tip_selected', terminalId: TERMINAL, cartId: 'c1', kind: 'percent' };
    expect(isUpMessage({ ...base, value: -0 })).toBe(true);
    expect(isUpMessage({ ...base, value: 0 })).toBe(true);
    expect(isUpMessage({ ...base, value: -1 })).toBe(false);
    expect(isUpMessage({ ...base, value: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isUpMessage({ ...base, value: '10' })).toBe(false);
  });

  it('rating: 5.0 pasa (es entero), 4.5 y 0 no; saleId "" se rechaza', () => {
    const base = { v: 1, t: 'rating', terminalId: TERMINAL, saleId: null };
    expect(isUpMessage({ ...base, rating: 5.0 })).toBe(true);
    expect(isUpMessage({ ...base, rating: 4.5 })).toBe(false);
    expect(isUpMessage({ ...base, rating: 0 })).toBe(false);
    expect(isUpMessage({ ...base, rating: 3, saleId: '' })).toBe(false);
  });

  it('state: cart.lines con 200 elementos arbitrarios pasa (el guard no valida líneas)', () => {
    const lines = Array.from({ length: 200 }, () => 'no-es-linea');
    expect(isDownMessage(down({ t: 'state', state: { ...empty, mode: 'order', cart: { lines } } }))).toBe(true);
  });

  it('state: tip.selected con cualquier forma pasa (no se re-valida como UpMessage)', () => {
    expect(isDownMessage(down({ t: 'state', state: { ...empty, mode: 'tip', tip: { presets: [5], allowCustom: true, selected: 'basura' } } }))).toBe(true);
  });

  it('hello: cashier como string o array se rechaza', () => {
    expect(isDownMessage(down({ t: 'hello', cashier: 'Andrea', sessionOpen: true }))).toBe(false);
    expect(isDownMessage(down({ t: 'hello', cashier: ['Andrea'], sessionOpen: true }))).toBe(false);
  });

  it('mensaje con t correcto pero campo t no string (número) se rechaza', () => {
    expect(isDownMessage(down({ t: 1 }))).toBe(false);
    expect(isUpMessage({ v: 1, terminalId: TERMINAL, t: ['bye'] })).toBe(false);
  });
});
