/**
 * Memoria corta del POS (`src/lib/pos/venta/memoriaCorta.ts`): lo que protege
 * de cobrar mal por culpa de un dato guardado.
 */
import { crearMemoriaCorta } from '@/lib/pos/venta/memoriaCorta';

function reloj(inicio = 1_000) {
  let t = inicio;
  return { ahora: () => t, avanzar: (ms: number) => (t += ms) };
}

describe('memoria corta', () => {
  test('dentro de la vigencia no vuelve a cargar; vencida, sí', async () => {
    const r = reloj();
    const m = crearMemoriaCorta<number>(60_000, r.ahora);
    const cargar = jest.fn(async () => 19);
    expect(await m.obtener('iva', cargar)).toBe(19);
    r.avanzar(59_999);
    expect(await m.obtener('iva', cargar)).toBe(19);
    expect(cargar).toHaveBeenCalledTimes(1);
    r.avanzar(1);
    expect(await m.obtener('iva', cargar)).toBe(19);
    expect(cargar).toHaveBeenCalledTimes(2);
  });

  test('un fallo NO se guarda: el siguiente pedido vuelve a intentar', async () => {
    const m = crearMemoriaCorta<string[]>(60_000);
    const cargar = jest
      .fn<Promise<string[]>, []>()
      .mockRejectedValueOnce(new Error('sin red'))
      .mockResolvedValueOnce(['IVA 19 %']);
    await expect(m.obtener('org-1', cargar)).rejects.toThrow('sin red');
    expect(await m.obtener('org-1', cargar)).toEqual(['IVA 19 %']);
    expect(cargar).toHaveBeenCalledTimes(2);
  });

  test('dos pedidos iguales a la vez hacen un solo viaje', async () => {
    const m = crearMemoriaCorta<number>(60_000);
    let soltar: (v: number) => void = () => undefined;
    const cargar = jest.fn(() => new Promise<number>((res) => (soltar = res)));
    const a = m.obtener('p-7', cargar);
    const b = m.obtener('p-7', cargar);
    soltar(8);
    expect(await Promise.all([a, b])).toEqual([8, 8]);
    expect(cargar).toHaveBeenCalledTimes(1);
  });

  test('claves distintas no se mezclan', async () => {
    const m = crearMemoriaCorta<string>(60_000);
    expect(await m.obtener('org-1|p-1', async () => 'uno')).toBe('uno');
    expect(await m.obtener('org-2|p-1', async () => 'dos')).toBe('dos');
    expect(await m.obtener('org-1|p-1', async () => 'otro')).toBe('uno');
  });

  test('`fresco` se salta lo guardado y deja el dato nuevo para los siguientes', async () => {
    const m = crearMemoriaCorta<number>(60_000);
    await m.obtener('promos', async () => 1);
    expect(await m.obtener('promos', async () => 2, { fresco: true })).toBe(2);
    expect(await m.obtener('promos', async () => 3)).toBe(2);
  });

  test('`olvidar` borra una clave o todo', async () => {
    const m = crearMemoriaCorta<number>(60_000);
    await m.obtener('a', async () => 1);
    await m.obtener('b', async () => 1);
    m.olvidar('a');
    expect(await m.obtener('a', async () => 2)).toBe(2);
    expect(await m.obtener('b', async () => 2)).toBe(1);
    m.olvidar();
    expect(await m.obtener('b', async () => 3)).toBe(3);
  });

  test('una lectura que venía en camino no revive el dato después de `olvidar`', async () => {
    const m = crearMemoriaCorta<string>(60_000);
    let soltar: (v: string) => void = () => undefined;
    const vieja = m.obtener('impuestos', () => new Promise<string>((res) => (soltar = res)));
    m.olvidar();
    soltar('viejo');
    expect(await vieja).toBe('viejo');
    expect(await m.obtener('impuestos', async () => 'nuevo')).toBe('nuevo');
  });
});
