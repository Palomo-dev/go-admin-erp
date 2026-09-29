/**
 * B7 — recuento de la importación (PARIDAD-ORGANIZACION-COMPRAS-IMPORT D5):
 * Importados · Omitidos · Fallidos · Sin intentar, que siempre suman lo
 * seleccionado.
 */
import { recuentoImportacion } from '../importar/recuentoImportacion';

const suma = (r: ReturnType<typeof recuentoImportacion>) => r.importados + r.omitidos + r.fallidos + r.sinIntentar;

describe('recuentoImportacion', () => {
  it('resultado limpio: 42 = 39 importados + 3 omitidos', () => {
    const r = recuentoImportacion({ total: 42, procesadas: 42, creados: 30, actualizados: 9, omitidos: 3, fallidos: 0 });
    expect(r).toMatchObject({ seleccionados: 42, importados: 39, omitidos: 3, fallidos: 0, sinIntentar: 0 });
    expect(suma(r)).toBe(42);
  });

  it('detenido: lo que no se envió queda «sin intentar»', () => {
    const r = recuentoImportacion({ total: 42, procesadas: 41, creados: 36, actualizados: 0, omitidos: 3, fallidos: 2 });
    expect(r).toMatchObject({ importados: 36, omitidos: 3, fallidos: 2, sinIntentar: 1 });
    expect(suma(r)).toBe(42);
  });

  it('si el servidor respondió menos filas de las enviadas, la diferencia cuenta como fallida', () => {
    const r = recuentoImportacion({ total: 10, procesadas: 10, creados: 7, actualizados: 0, omitidos: 0, fallidos: 1 });
    expect(r.fallidos).toBe(3);
    expect(suma(r)).toBe(10);
  });

  it('valores raros no rompen el cuadre', () => {
    const r = recuentoImportacion({ total: 5, procesadas: 9, creados: Number.NaN, actualizados: -1, omitidos: 0, fallidos: 0 });
    expect(r).toMatchObject({ importados: 0, fallidos: 5, sinIntentar: 0 });
    expect(suma(r)).toBe(5);
  });
});
