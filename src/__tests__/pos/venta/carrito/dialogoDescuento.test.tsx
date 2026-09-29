/**
 * @jest-environment jsdom
 *
 * «Descuento · D» (paso 10): pestaña «A un producto» con el flujo de siempre
 * (onAplicar = updateCartItemDiscount de CartView), frecuentes, quitar, aviso
 * de tope, y «A toda la venta» deshabilitada (D5).
 *
 * El monto es el `CampoNumero` del kit (Figma `NumberInput` 290:35435): un
 * `<input type="text" inputMode="decimal">`, así que su rol es `textbox` y no
 * `spinbutton` (auditoría POS venta #23, 2026-09-28).
 */
import { act, fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { CartItem } from '@/components/pos/types';
import { DialogoDescuento } from '@/components/pos/venta/DialogoDescuento';

const items = [
  { id: 'a', product_id: 1, product: { name: 'Café' }, quantity: 2, unit_price: 3000, discount_amount: 0 },
  { id: 'b', product_id: 2, product: { name: 'Pan' }, quantity: 1, unit_price: 1000, discount_amount: 200 },
] as unknown as CartItem[];

function montar(onAplicar = jest.fn(async () => undefined)) {
  const onCargar = jest.fn();
  renderConIdioma(
    <DialogoDescuento abierto onAbiertoChange={jest.fn()} items={items} formatear={(n) => `$ ${n}`} frecuentes={{ 1: [500] }} onCargarFrecuentes={onCargar} onAplicar={onAplicar} />,
  );
  return { onAplicar, onCargar };
}

test('al abrir carga los frecuentes de cada producto', () => {
  const { onCargar } = montar();
  expect(onCargar).toHaveBeenCalledWith(1);
  expect(onCargar).toHaveBeenCalledWith(2);
});

test('escribir y Enter aplica; el frecuente aplica; quitar manda 0', async () => {
  const { onAplicar } = montar();
  const campo = screen.getByRole('textbox', { name: 'Descuento de Café' });
  fireEvent.change(campo, { target: { value: '700' } });
  await act(async () => {
    fireEvent.keyDown(campo, { key: 'Enter' });
  });
  expect(onAplicar).toHaveBeenCalledWith('a', 700);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /frecuente de \$ 500/ }));
  });
  expect(onAplicar).toHaveBeenCalledWith('a', 500);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Quitar' }));
  });
  expect(onAplicar).toHaveBeenCalledWith('b', 0);
});

test('más que cantidad × precio avisa del tope; «A toda la venta» está deshabilitada', () => {
  montar();
  fireEvent.change(screen.getByRole('textbox', { name: 'Descuento de Pan' }), { target: { value: '5000' } });
  expect(screen.getByText(/no puede superar \$ 1000/)).toBeTruthy();
  const venta = screen.getByRole('radio', { name: 'A toda la venta' }) as HTMLButtonElement;
  expect(venta.disabled || venta.getAttribute('aria-disabled') === 'true').toBe(true);
});
