/**
 * @jest-environment jsdom
 *
 * ProductCard: el toque sobre una tarjeta que no se puede elegir avisa por
 * qué (`onNoDisponible`) y un padre con variantes sin precio propio se elige
 * igual (`elegibleSinPrecio`, el precio lo pone el diálogo).
 */
import { fireEvent, screen } from '@testing-library/react';
import { ProductCard } from '../ProductCard';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

describe('ProductCard: no disponible y sin precio', () => {
  test('agotado: no elige y avisa con el motivo', () => {
    const onElegir = jest.fn();
    const onNoDisponible = jest.fn();
    renderConIdioma(
      <ProductCard producto={{ id: 1, nombre: 'Café', precio: 3000, agotado: true }} moneda="COP" onElegir={onElegir} onNoDisponible={onNoDisponible} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Café/ }));
    expect(onElegir).not.toHaveBeenCalled();
    expect(onNoDisponible).toHaveBeenCalledWith('agotado');
  });

  test('sin precio: avisa; con elegibleSinPrecio se elige y no pinta «Sin precio»', () => {
    const onElegir = jest.fn();
    const onNoDisponible = jest.fn();
    const { rerender } = renderConIdioma(
      <ProductCard producto={{ id: 2, nombre: 'Camisa', precio: null }} moneda="COP" onElegir={onElegir} onNoDisponible={onNoDisponible} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Camisa/ }));
    expect(onNoDisponible).toHaveBeenCalledWith('sinPrecio');
    rerender(<ProductCard producto={{ id: 2, nombre: 'Camisa', precio: null }} moneda="COP" onElegir={onElegir} elegibleSinPrecio />);
    fireEvent.click(screen.getByRole('button', { name: /Camisa/ }));
    expect(onElegir).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Sin precio')).toBeNull();
  });
});
