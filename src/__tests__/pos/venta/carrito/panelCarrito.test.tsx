/**
 * @jest-environment jsdom
 *
 * PanelCarrito (paso 9): «Elige la sucursal para vender» con «Todas las
 * sucursales»; si no, pestañas · cliente · carrito en ese orden, con los
 * atajos apagados cuando el cobro está abierto.
 */
import { screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { Cart } from '@/components/pos/types';

const recibidas: Record<string, unknown>[] = [];
jest.mock('@/components/pos/CartTabs', () => ({ CartTabs: (p: Record<string, unknown>) => (recibidas.push({ pieza: 'pestanas', ...p }), <div>pestanas</div>) }));
jest.mock('@/components/pos/CustomerSelector', () => ({ CustomerSelector: (p: Record<string, unknown>) => (recibidas.push({ pieza: 'cliente', ...p }), <div>cliente</div>) }));
jest.mock('@/components/pos/CartView', () => ({ CartView: (p: Record<string, unknown>) => (recibidas.push({ pieza: 'carrito', ...p }), <div>carrito</div>) }));

import { PanelCarrito, type PanelCarritoProps } from '@/components/pos/venta/PanelCarrito';

const cart = { id: 'c1', status: 'active', items: [], total: 0 } as unknown as Cart;
const base: PanelCarritoProps = {
  carts: [cart],
  activeCart: cart,
  activeCartId: 'c1',
  onCartSelect: jest.fn(),
  onNewCart: jest.fn(),
  onRemoveCart: jest.fn(),
  sinSucursal: false,
  onClienteSelect: jest.fn(),
  clienteAbierto: false,
  onClienteAbiertoChange: jest.fn(),
  carrito: { onCartUpdate: jest.fn(), onCheckout: jest.fn(), onHold: jest.fn() },
  atajosActivos: false,
};

beforeEach(() => (recibidas.length = 0));

test('sin sucursal concreta: pide elegirla y no monta el carrito', () => {
  renderConIdioma(<PanelCarrito {...base} sinSucursal />);
  expect(screen.getByText('Elige la sucursal para vender')).toBeTruthy();
  expect(screen.queryByText('carrito')).toBeNull();
});

test('pestañas, cliente y carrito en orden; atajos apagados llegan a pestañas y carrito', () => {
  renderConIdioma(<PanelCarrito {...base} />);
  expect(recibidas.map((r) => r.pieza)).toEqual(['pestanas', 'cliente', 'carrito']);
  expect(recibidas.find((r) => r.pieza === 'pestanas')?.atajosActivos).toBe(false);
  expect(recibidas.find((r) => r.pieza === 'carrito')).toMatchObject({ cart, atajosActivos: false });
  expect(recibidas.find((r) => r.pieza === 'cliente')?.atajo).toBe('F2');
});
