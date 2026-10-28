/**
 * @jest-environment jsdom
 *
 * Estilo de tarjeta › Etiquetas › «Etiquetas propias»: lista (agregar, editar, ordenar, quitar).
 */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { InspectorTarjetaProducto } from '../inspector/InspectorTarjetaProducto';

const abrir = (guardado: unknown, heredado: unknown = null) => {
  const onCambiar = jest.fn();
  renderConIdioma(<InspectorTarjetaProducto guardado={guardado} heredado={heredado} onCambiar={onCambiar} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Etiquetas' }));
  return onCambiar;
};
const ultimo = (f: jest.Mock) => f.mock.calls.at(-1)![0];

describe('Etiquetas propias', () => {
  test('agregar crea una etiqueta y conserva vendidos', () => {
    const f = abrir({ show_sales_count: true });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar etiqueta' }));
    expect(ultimo(f)).toEqual({ show_sales_count: true, labels_custom: [{ id: 'et1', label: 'Nueva etiqueta' }] });
  });
  test('editar el texto', () => {
    const f = abrir({ labels_custom: [{ id: 'o', label: 'Nueva etiqueta' }] });
    fireEvent.click(screen.getByText('Nueva etiqueta'));
    fireEvent.change(screen.getByLabelText('Texto de la etiqueta'), { target: { value: 'Originales' } });
    expect(ultimo(f).labels_custom[0].label).toBe('Originales');
  });
  test('sin etiquetas propias no hay lista; con dos se ven en orden', () => {
    abrir({ labels_custom: [{ id: 'a', label: 'Originales' }, { id: 'b', label: 'Garantía' }] });
    const lista = screen.getByRole('list', { name: 'Etiquetas propias' });
    expect(lista.textContent).toMatch(/Originales.*Garantía/);
  });
});
