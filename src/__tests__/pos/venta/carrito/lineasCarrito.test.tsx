/**
 * @jest-environment jsdom
 *
 * Líneas del carrito con `CartLine` del kit (paso 6): cada control llama al
 * mismo handler de `CartView` que antes, la cantidad a 0 pide confirmar, en
 * espera todo queda bloqueado, los atajos de la línea con foco funcionan y
 * no disparan dentro del campo de la nota.
 *
 * El campo del descuento de la línea es el `CampoNumero` del kit (texto con
 * `inputMode="decimal"`): su rol es `textbox`, no `spinbutton` (auditoría POS
 * venta #24, 2026-09-28).
 */
import { fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { CartItem } from '@/components/pos/types';

jest.mock('@/components/pos/CachedProductImage', () => ({ CachedProductImage: () => null }));
jest.mock('@/components/pos/cocina/ChipsNotasRapidas', () => ({ ChipsNotasRapidas: () => null }));

import { LineasCarrito, type LineasCarritoProps } from '@/components/pos/venta/carrito/LineasCarrito';

const item = (id: string, extra: Partial<CartItem> = {}): CartItem =>
  ({
    id,
    product_id: Number(id.replace(/\D/g, '')) || 1,
    product: { id: 1, name: `Producto ${id}`, sku: `SKU-${id}`, unit_code: 'und' },
    quantity: 1,
    unit_price: 10000,
    total: 10000,
    tax_amount: 1900,
    tax_included: false,
    tax_excluded: false,
    ...extra,
  }) as unknown as CartItem;

function props(over: Partial<LineasCarritoProps> = {}): LineasCarritoProps {
  return {
    cartId: 'c1',
    branchId: 3,
    items: [item('a'), item('b', { quantity: 2, total: 20000, discount_amount: 500 })],
    moneda: { code: 'COP', decimals: 0, locale: 'es-CO' } as LineasCarritoProps['moneda'],
    formatear: (n: number) => `$ ${n}`,
    bloqueada: false,
    indicesSinImpuesto: new Set<number>(),
    estadoTicket: null,
    descuentosFrecuentes: { 1: [1000] },
    onCantidad: jest.fn(),
    onQuitar: jest.fn(),
    onExcluirImpuesto: jest.fn(),
    onIncluido: jest.fn(),
    nota: { itemId: null, destino: 'cocina', alergia: false, texto: '' },
    onNotaAbrir: jest.fn(),
    onNotaDestino: jest.fn(),
    onNotaAlergia: jest.fn(),
    onNotaTexto: jest.fn(),
    onNotaGuardar: jest.fn(),
    onNotaCancelar: jest.fn(),
    descuento: { itemId: null, texto: '' },
    onDescuentoAbrir: jest.fn(),
    onDescuentoTexto: jest.fn(),
    onDescuentoAplicar: jest.fn(),
    onDescuentoCancelar: jest.fn(),
    ...over,
  };
}

const linea = (nombre: string) => screen.getByRole('group', { name: nombre });

describe('LineasCarrito', () => {
  test('+, quitar, excluir impuesto e «Incluido» llaman a los handlers de siempre', () => {
    const p = props();
    renderConIdioma(<LineasCarrito {...p} />);
    const a = linea('Producto a');
    fireEvent.click(within(a).getByRole('button', { name: /Sumar|Aumentar|\+/i }));
    expect(p.onCantidad).toHaveBeenCalledWith('a', 2);
    fireEvent.click(within(a).getByRole('button', { name: /Quitar/ }));
    expect(p.onQuitar).toHaveBeenCalledWith('a');
    fireEvent.click(within(a).getByRole('button', { name: /impuesto/i }));
    expect(p.onExcluirImpuesto).toHaveBeenCalledWith('a');
    fireEvent.click(within(a).getByRole('checkbox'));
    expect(p.onIncluido).toHaveBeenCalledWith('a');
  });

  test('«−» con cantidad 1 pide confirmar y solo entonces manda cantidad 0', () => {
    const p = props();
    renderConIdioma(<LineasCarrito {...p} />);
    fireEvent.click(within(linea('Producto a')).getByRole('button', { name: /Restar|Disminuir|−|-/i }));
    expect(p.onCantidad).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    expect(p.onCantidad).toHaveBeenCalledWith('a', 0);
  });

  test('el descuento aplicado se ve y se edita; sin descuento se ofrece agregarlo', () => {
    const p = props();
    renderConIdioma(<LineasCarrito {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /Editar el descuento de Producto b/ }));
    expect(p.onDescuentoAbrir).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
    fireEvent.click(within(linea('Producto a')).getByRole('button', { name: /descuento/i }));
    expect(p.onDescuentoAbrir).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  test('editando el descuento: frecuentes y Enter aplican', () => {
    const p = props({ descuento: { itemId: 'b', texto: '700' } });
    renderConIdioma(<LineasCarrito {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /descuento frecuente de \$ 1000/ }));
    expect(p.onDescuentoAplicar).toHaveBeenCalledWith('b', 1000);
    fireEvent.keyDown(screen.getByRole('textbox', { name: /Descuento de Producto b/ }), { key: 'Enter' });
    expect(p.onDescuentoAplicar).toHaveBeenLastCalledWith('b', 700);
  });

  test('en espera los controles quedan deshabilitados', () => {
    const p = props({ bloqueada: true });
    renderConIdioma(<LineasCarrito {...p} />);
    const botones = within(linea('Producto a')).getAllByRole('button') as HTMLButtonElement[];
    expect(botones.every((b) => b.disabled || b.getAttribute('aria-disabled') === 'true')).toBe(true);
  });

  test('atajos de la línea con foco: + suma y Supr quita; dentro del campo de la nota no', () => {
    const p = props();
    const { rerender } = renderConIdioma(<LineasCarrito {...p} />);
    const a = linea('Producto a');
    a.focus();
    fireEvent.keyDown(document.activeElement!, { key: '+' });
    expect(p.onCantidad).toHaveBeenCalledWith('a', 2);
    fireEvent.keyDown(document.activeElement!, { key: 'Delete' });
    expect(p.onQuitar).toHaveBeenCalledWith('a');

    const p2 = props({ nota: { itemId: 'a', destino: 'cocina', alergia: false, texto: 'sin cebolla' } });
    rerender(<LineasCarrito {...p2} />);
    const campo = screen.getByRole('textbox', { name: /cocina/i });
    campo.focus();
    fireEvent.keyDown(campo, { key: 'T' });
    expect(p2.onExcluirImpuesto).not.toHaveBeenCalled();
  });

  test('en inglés: la confirmación sale traducida', () => {
    renderConIdioma(<LineasCarrito {...props()} />, { idioma: 'en' });
    fireEvent.click(within(linea('Producto a')).getByRole('button', { name: /Decrease|Remove one|−|-/i }));
    expect(screen.getByText('Remove Producto a from the cart?')).toBeTruthy();
  });
});
