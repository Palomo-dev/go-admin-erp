/**
 * @jest-environment jsdom
 *
 * CategoryFilterBar (paso 5): misma API de siempre (mesas la usa), dibujada con
 * `CategoryBar` del kit. Orden configurado, «Todas» = 'all', estrella que no
 * cambia el filtro.
 */
import { fireEvent, screen } from '@testing-library/react';
import { CategoryFilterBar } from '@/components/pos/CategoryFilterBar';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

const categorias = [
  { id: 2, name: 'Postres', display_order: 2 },
  { id: 1, name: 'Bebidas', display_order: 1, is_favorite: true },
];

describe('CategoryFilterBar sobre CategoryBar', () => {
  test('chips en el orden configurado; elegir manda el id y «Todas» manda all', () => {
    const onSelect = jest.fn();
    renderConIdioma(<CategoryFilterBar categories={categorias} selectedCategory="1" onSelectCategory={onSelect} mode="buttons" />);
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual([expect.stringMatching(/Todas/), expect.stringMatching(/Bebidas/), expect.stringMatching(/Postres/)]);
    expect(radios[1].getAttribute('aria-checked')).toBe('true');
    fireEvent.click(radios[2]);
    expect(onSelect).toHaveBeenLastCalledWith('2');
    fireEvent.click(radios[0]);
    expect(onSelect).toHaveBeenLastCalledWith('all');
  });

  test('la estrella marca la favorita sin cambiar el filtro', () => {
    const onSelect = jest.fn();
    const onFav = jest.fn();
    renderConIdioma(
      <CategoryFilterBar categories={categorias} selectedCategory="all" onSelectCategory={onSelect} mode="buttons" onToggleFavorite={onFav} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Postres/ }));
    expect(onFav).toHaveBeenCalledWith(2);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
