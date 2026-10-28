/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
jest.mock('@/components/sitio-web/ui/ColorField', () => ({ ColorField: () => null }));
import { opcionesDeHijos, SelectKit } from '../inspector/controlesKit';

describe('controlesKit', () => {
  it('la opción vacía gemela no se duplica', () => {
    const r = opcionesDeHijos([<option key="a" value="">Cubrir</option>, <option key="b" value="cover">Cubrir</option>, <option key="c" value="contain">Contener</option>]);
    expect(r.opciones.map((o) => o.valor)).toEqual(['cover', 'contain']);
    expect(r.vacioEs).toBe('cover');
  });
  it('SelectKit pinta chips y devuelve e.target.value', () => {
    const onChange = jest.fn();
    render(
      <SelectKit value="" onChange={onChange}>
        <option value="">Como hoy</option>
        <option value="full">Completo</option>
      </SelectKit>,
    );
    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.click(screen.getByText('Completo'));
    expect(onChange).toHaveBeenCalledWith({ target: { value: 'full' } });
  });
});
