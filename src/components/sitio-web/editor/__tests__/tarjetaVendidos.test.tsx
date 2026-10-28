/**
 * @jest-environment jsdom
 *
 * Tarjeta de producto › Etiquetas: «Unidades vendidas» es un solo interruptor (`show_sales_count`).
 */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { InspectorTarjetaProducto } from '../inspector/InspectorTarjetaProducto';

const abrir = (guardado: unknown, heredado: unknown = null) => {
  const onCambiar = jest.fn();
  renderConIdioma(<InspectorTarjetaProducto guardado={guardado} heredado={heredado} onCambiar={onCambiar} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Etiquetas' }));
  return { onCambiar, sw: screen.getByRole('switch', { name: /Unidades vendidas/ }) };
};

describe('Unidades vendidas', () => {
  test('apagada por defecto; prenderla guarda solo show_sales_count: true', () => {
    const { onCambiar, sw } = abrir(null);
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(screen.getAllByRole('switch', { name: /Unidades vendidas/ })).toHaveLength(1);
    fireEvent.click(sw);
    expect(onCambiar).toHaveBeenLastCalledWith({ show_sales_count: true });
  });
  test('prendida: apagarla borra la clave (vuelve a como hoy)', () => {
    const { onCambiar, sw } = abrir({ show_sales_count: true, card_radius: 8 });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw);
    expect(onCambiar.mock.calls.at(-1)![0]).toEqual({ card_radius: 8 });
  });
  test('una sección ve la del sitio', () => {
    expect(abrir(null, { show_sales_count: true }).sw.getAttribute('aria-checked')).toBe('true');
  });
});
