/// <reference types="jest" />
import { leerPorLotes } from '../leerPorLotes';

/**
 * Un lote de ids cuyas filas pasan de 1.000. Sin paginar, PostgREST
 * devolvería solo las primeras 1.000 y el resto se perdería.
 */
describe('leerPorLotes', () => {
  type Fila = { id: number; product_id: number; storage_path: string };
  const ids = Array.from({ length: 200 }, (_, i) => i + 1);
  const filas: Fila[] = Array.from({ length: 1200 }, (_, i) => ({ id: i + 1, product_id: (i % 200) + 1, storage_path: `products/${i + 1}.jpg` }));

  function consulta(registradas: Array<[number, number]>) {
    return async (lote: readonly number[], desde: number, hasta: number) => {
      registradas.push([desde, hasta]);
      const delLote = filas.filter((f) => lote.includes(f.product_id));
      return { data: delLote.slice(desde, hasta + 1), error: null };
    };
  }

  it('un lote de más de 1.000 filas devuelve todas, y la segunda corrida es igual', async () => {
    const rangos: Array<[number, number]> = [];
    const primera = await leerPorLotes<Fila>(ids, consulta(rangos), { lote: 200, pagina: 1000 });
    const segunda = await leerPorLotes<Fila>(ids, consulta([]), { lote: 200, pagina: 1000 });

    expect(rangos).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(primera).toHaveLength(1200);
    expect(primera.map((f) => f.id)).toEqual(filas.map((f) => f.id));
    expect(new Set(primera.map((f) => f.product_id)).size).toBe(200);
    expect(segunda).toEqual(primera);
  });

  it('sin ids no consulta', async () => {
    const consultaVacia = jest.fn();
    await expect(leerPorLotes([], consultaVacia)).resolves.toEqual([]);
    expect(consultaVacia).not.toHaveBeenCalled();
  });

  it('propaga el error de la consulta', async () => {
    await expect(
      leerPorLotes([1], async () => ({ data: null, error: { message: 'falló la lectura' } })),
    ).rejects.toMatchObject({ message: 'falló la lectura' });
  });

  it('corta si el rango no avanza, para no repetir la misma página', async () => {
    const atascada = Array.from({ length: 1000 }, (_, i) => ({ id: i + 1 }));
    await expect(
      leerPorLotes([1], async () => ({ data: atascada, error: null }), { lote: 1, pagina: 1000 }),
    ).rejects.toThrow('no avanzó de página');
  });
});
