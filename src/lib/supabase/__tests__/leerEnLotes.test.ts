import { leerEnLotes } from '../leerEnLotes';

/** Simula PostgREST: devuelve el tramo pedido de `total` filas, nunca más de 1.000. */
function fuente(total: number) {
  const filas = Array.from({ length: total }, (_, i) => ({ id: i }));
  const pedidos: Array<[number, number]> = [];
  const construir = (desde: number, hasta: number) => {
    pedidos.push([desde, hasta]);
    const fin = Math.min(hasta + 1, desde + 1000);
    return Promise.resolve({ data: filas.slice(desde, fin), error: null });
  };
  return { construir, pedidos };
}

describe('leerEnLotes', () => {
  it('trae más de 1.000 filas pidiendo lote tras lote (org con 1.573 pedidos)', async () => {
    const { construir, pedidos } = fuente(1573);
    const filas = await leerEnLotes(construir);
    expect(filas).toHaveLength(1573);
    expect(new Set(filas.map((f) => f.id)).size).toBe(1573);
    expect(pedidos).toEqual([[0, 999], [1000, 1999]]);
  });

  it('con menos de un lote hace una sola petición', async () => {
    const { construir, pedidos } = fuente(12);
    expect(await leerEnLotes(construir)).toHaveLength(12);
    expect(pedidos).toHaveLength(1);
  });

  it('con un múltiplo exacto pide un lote más y termina con el vacío', async () => {
    const { construir, pedidos } = fuente(2000);
    expect(await leerEnLotes(construir)).toHaveLength(2000);
    expect(pedidos).toHaveLength(3);
  });

  it('respeta el tope de seguridad', async () => {
    const { construir } = fuente(5000);
    expect(await leerEnLotes(construir, { tope: 2500 })).toHaveLength(2500);
  });

  it('propaga el error de Supabase', async () => {
    const error = { message: 'falló' };
    await expect(leerEnLotes(() => Promise.resolve({ data: null, error }))).rejects.toBe(error);
  });
});
