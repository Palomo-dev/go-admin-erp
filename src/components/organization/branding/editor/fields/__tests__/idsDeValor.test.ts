/**
 * La casilla de categoría de un banner guarda un id suelto, no una lista.
 * `idsDeValor` tiene que reconocerlo igual.
 */
import { idsDeValor } from '../idsDeValor';

describe('idsDeValor', () => {
  test('un id suelto cuenta como seleccionado', () => {
    expect(idsDeValor(12, false)).toEqual([12]);
    expect(idsDeValor('12', false)).toEqual([12]);
  });

  test('vacío no selecciona nada', () => {
    expect(idsDeValor(null, false)).toEqual([]);
    expect(idsDeValor('', false)).toEqual([]);
    expect(idsDeValor(undefined, false)).toEqual([]);
  });

  test('en múltiple solo acepta una lista de enteros', () => {
    expect(idsDeValor([1, '2', 'x', 3.5], true)).toEqual([1, 2]);
    expect(idsDeValor(4, true)).toEqual([]);
  });
});
