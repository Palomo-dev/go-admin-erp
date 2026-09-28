/**
 * @jest-environment jsdom
 *
 * Barra fija del celular (paso 15; POS-UX-V2 D3c): total y unidades abren la
 * hoja del carrito; «Cobrar · F4» cobra, sin caja pasa a «Abrir caja para
 * cobrar» y vacío o en espera queda deshabilitado.
 */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { BarraCobroMovil } from '@/components/pos/venta/BarraCobroMovil';

function montar(estado: 'listo' | 'sin-caja' | 'vacio' | 'bloqueado') {
  const p = { onVerCarrito: jest.fn(), onCobrar: jest.fn(), onAbrirCaja: jest.fn() };
  renderConIdioma(<BarraCobroMovil unidades={3} total="$ 12.000" estado={estado} {...p} />);
  return p;
}

test('listo: el total abre la hoja y «Cobrar» cobra', () => {
  const p = montar('listo');
  fireEvent.click(screen.getByRole('button', { name: 'Ver carrito: 3 unidades, $ 12.000' }));
  expect(p.onVerCarrito).toHaveBeenCalled();
  const cobrar = screen.getByRole('button', { name: /^Cobrar/ });
  expect(cobrar.getAttribute('aria-keyshortcuts')).toBe('F4');
  fireEvent.click(cobrar);
  expect(p.onCobrar).toHaveBeenCalled();
});

test('sin caja: «Abrir caja para cobrar» abre la caja', () => {
  const p = montar('sin-caja');
  fireEvent.click(screen.getByRole('button', { name: /Abrir caja para cobrar/ }));
  expect(p.onAbrirCaja).toHaveBeenCalled();
  expect(p.onCobrar).not.toHaveBeenCalled();
});

test('vacío o en espera: «Cobrar» deshabilitado', () => {
  montar('vacio');
  expect((screen.getByRole('button', { name: /^Cobrar/ }) as HTMLButtonElement).disabled).toBe(true);
});
