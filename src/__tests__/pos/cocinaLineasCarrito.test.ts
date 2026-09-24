/**
 * Notas de la línea del carrito y estado en cocina (POS-CARRITO-LINEAS-NOTAS.md,
 * N1, N2, N5, N11). Lógica pura de `src/lib/pos/cocina/lineasCarrito.ts`:
 *   - la nota tiene destino (cocina / cliente) y la alergia exige nota de cocina;
 *   - el editor de mesa entrega HTML: se guarda texto plano de 140 caracteres;
 *   - «Enviar a cocina» manda TODAS las líneas con su id estable (la base
 *     decide el delta) y el carrito guarda lo que devolvió la ronda;
 *   - el ticket impreso de un ajuste dice qué cambió; los ítems anulados no
 *     se imprimen y la copia del ítem manda sobre la línea de la venta.
 */

import {
  aplicarNotaALinea,
  aplicarRondaAlCarrito,
  estadoCocinaLinea,
  itemsParaImprimir,
  lineaParaRonda,
  NOTA_MAX,
  normalizarNota,
  ticketRondaDesdeRegistro,
  type RespuestaRonda,
  type TextosAjusteImpreso,
  type TicketRonda,
} from '@/lib/pos/cocina/lineasCarrito';
import type { Cart, CartItem } from '@/components/pos/types';

function linea(extra: Partial<CartItem> = {}): CartItem {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    cart_id: 'c1',
    product_id: 7,
    product: { id: 7, name: 'Hamburguesa' } as never,
    quantity: 1,
    unit_price: 20000,
    total: 20000,
    created_at: '2026-09-23T12:00:00.000Z',
    updated_at: '2026-09-23T12:00:00.000Z',
    ...extra,
  };
}

const TEXTOS: TextosAjusteImpreso = {
  mesa: 'POS',
  ajuste: (id) => `AJUSTE de #${id}`,
  mas: (n) => `+${n}`,
  menos: (n) => `-${n}`,
  anular: 'ANULAR',
  notaCambiada: 'NOTA',
  alergia: 'ALERGIA',
};

describe('normalizarNota', () => {
  it('quita etiquetas, espacios repetidos y recorta a 140', () => {
    expect(normalizarNota('<p>sin <b>cebolla</b></p>')).toBe('sin cebolla');
    expect(normalizarNota('  bien   asada \n')).toBe('bien asada');
    expect(normalizarNota('x'.repeat(200))).toHaveLength(NOTA_MAX);
  });
  it('vacía o no texto → undefined', () => {
    expect(normalizarNota('   ')).toBeUndefined();
    expect(normalizarNota('<br>')).toBeUndefined();
    expect(normalizarNota(null)).toBeUndefined();
  });
});

describe('aplicarNotaALinea: destino y alergia', () => {
  it('la nota de cocina y la del cliente son campos distintos', () => {
    const a = aplicarNotaALinea(linea(), { cocina: 'sin cebolla' });
    const b = aplicarNotaALinea(a, { cliente: 'empacar aparte' });
    expect(b.notes).toBe('sin cebolla');
    expect(b.customer_note).toBe('empacar aparte');
  });
  it('alergia solo con nota de cocina; borrar la nota quita la alergia', () => {
    expect(aplicarNotaALinea(linea(), { cocina: '', alergia: true }).is_allergy).toBeUndefined();
    const con = aplicarNotaALinea(linea(), { cocina: 'maní', alergia: true });
    expect(con.is_allergy).toBe(true);
    const sin = aplicarNotaALinea(con, { cocina: null });
    expect(sin.notes).toBeUndefined();
    expect(sin.is_allergy).toBeUndefined();
  });
  it('cambiar la nota del cliente no toca la de cocina ni la alergia', () => {
    const con = aplicarNotaALinea(linea(), { cocina: 'maní', alergia: true });
    const otra = aplicarNotaALinea(con, { cliente: 'regalo' });
    expect(otra).toMatchObject({ notes: 'maní', is_allergy: true, customer_note: 'regalo' });
  });
  it('no toca importes ni «Excluir impuesto»', () => {
    const l = linea({ tax_excluded: true, tax_included: true, total: 123 });
    const n = aplicarNotaALinea(l, { cocina: 'x' });
    expect(n).toMatchObject({ tax_excluded: true, tax_included: true, total: 123, quantity: 1, unit_price: 20000 });
  });
});

describe('estadoCocinaLinea', () => {
  it('sin enviar → enviada → cambio pendiente (cantidad, nota o alergia)', () => {
    expect(estadoCocinaLinea(linea())).toBe('sin_enviar');
    const enviada = linea({ quantity: 2, notes: 'sin cebolla', kitchen_sent_qty: 2, kitchen_sent_note: 'sin cebolla' });
    expect(estadoCocinaLinea(enviada)).toBe('enviada');
    expect(estadoCocinaLinea({ ...enviada, quantity: 3 })).toBe('cambio_pendiente');
    expect(estadoCocinaLinea({ ...enviada, notes: 'bien asada' })).toBe('cambio_pendiente');
    expect(estadoCocinaLinea({ ...enviada, is_allergy: true })).toBe('cambio_pendiente');
  });
});

describe('lineaParaRonda', () => {
  it('id estable de la línea, nota de cocina normalizada; nunca la del cliente', () => {
    const l = linea({ quantity: 2, notes: ' sin  cebolla ', customer_note: 'regalo', is_allergy: true });
    const r = lineaParaRonda(l, 'hot_kitchen', { Término: 'medio' });
    expect(r).toEqual({
      line_id: l.id,
      product_name: 'Hamburguesa',
      quantity: 2,
      station: 'hot_kitchen',
      notes: 'sin cebolla',
      is_allergy: true,
      variant_data: { Término: 'medio' },
      modifiers: null,
    });
    expect(JSON.stringify(r)).not.toContain('regalo');
  });
});

describe('aplicarRondaAlCarrito', () => {
  it('guarda la comanda del carrito, lo enviado por línea y suelta la llave de la ronda', () => {
    const l1 = linea();
    const l2 = linea({ id: '22222222-2222-4222-8222-222222222222' });
    const cart = { id: 'c1', items: [l1, l2], kitchen_round_key: 'k-1', kitchen_ticket_id: null } as unknown as Cart;
    const respuesta: RespuestaRonda = {
      replayed: false,
      first_ticket_id: 208,
      tickets: [],
      lines: [{ line_id: l1.id, sent_qty: 2, sent_note: 'sin cebolla', sent_allergy: false }],
    };
    const out = aplicarRondaAlCarrito(cart, respuesta);
    expect(out.kitchen_ticket_id).toBe(208);
    expect(out.kitchen_round_key).toBeNull();
    expect(out.items[0]).toMatchObject({ kitchen_sent_qty: 2, kitchen_sent_note: 'sin cebolla', kitchen_sent_allergy: false });
    expect(out.items[1].kitchen_sent_qty).toBeUndefined();
  });
});

describe('itemsParaImprimir', () => {
  const ajuste: TicketRonda = {
    id: 210,
    ticket_type: 'adjustment',
    adjusts_ticket_id: 208,
    created_at: '2026-09-23T12:05:00.000Z',
    has_allergy: true,
    items: [
      { id: 1, cart_line_id: 'l1', product_name: 'Hamburguesa', quantity: 1, quantity_delta: 1, adjustment_kind: 'increase', adjustment_reason: null, notes: 'sin cebolla', is_allergy: false, station: 'hot_kitchen', variant_data: null, modifiers: null },
      { id: 2, cart_line_id: 'l2', product_name: 'Limonada', quantity: 2, quantity_delta: -2, adjustment_kind: 'void', adjustment_reason: 'Retirado del carrito', notes: 'maní', is_allergy: true, station: null, variant_data: null, modifiers: [{ name: 'Sin hielo' }] },
      { id: 3, cart_line_id: 'l3', product_name: 'Papas', quantity: 1, quantity_delta: 0, adjustment_kind: 'note', adjustment_reason: null, notes: 'bien doradas', is_allergy: false, station: null, variant_data: null, modifiers: null },
    ],
  };
  it('un ajuste dice qué cambió y la alergia va primero en la nota', () => {
    const items = itemsParaImprimir(ajuste, TEXTOS);
    expect(items.map((i) => i.productName)).toEqual(['+1 Hamburguesa', 'ANULAR Limonada', 'NOTA Papas']);
    expect(items[1].notes).toBe('ALERGIA · maní · Retirado del carrito');
    expect(items[1].modifiers).toEqual([{ name: 'Sin hielo', extraPrice: 0 }]);
  });
  it('una comanda normal imprime el nombre tal cual', () => {
    const normal = { ...ajuste, ticket_type: 'order' as const, items: [{ ...ajuste.items[0], adjustment_kind: null, quantity_delta: null }] };
    expect(itemsParaImprimir(normal, TEXTOS)[0].productName).toBe('Hamburguesa');
  });
});

describe('ticketRondaDesdeRegistro', () => {
  it('la copia del ítem manda; las filas viejas de mesa leen la venta; lo anulado no se imprime', () => {
    const t = ticketRondaDesdeRegistro({
      id: 5,
      created_at: '2026-09-23T12:00:00.000Z',
      ticket_type: null,
      kitchen_ticket_items: [
        { id: 1, product_name: 'Bandeja', quantity: 2, sale_items: { quantity: 3, products: { name: 'Bandeja paisa' } } },
        { id: 2, product_name: null, quantity: 1, sale_items: { quantity: 4, notes: { modifiers: [{ name: 'Extra huevo', extraPrice: 2000 }] }, products: { name: 'Sopa' } } },
        { id: 3, product_name: 'Jugo', quantity: 1, status: 'cancelled' },
      ],
    });
    expect(t.ticket_type).toBe('order');
    expect(t.items.map((i) => [i.product_name, i.quantity])).toEqual([['Bandeja', 2], ['Sopa', 4]]);
    expect(t.items[1].modifiers).toEqual([{ name: 'Extra huevo', extraPrice: 2000 }]);
  });
});
