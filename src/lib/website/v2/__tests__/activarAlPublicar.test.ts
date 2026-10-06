/// <reference types="jest" />
/**
 * «Publicar» activa la web en el mismo paso la primera vez (principal o sede):
 *  - activa solo si el sitio aún no está activo Y el lector público de V2 está listo;
 *  - si ya está activo o no hay lector, publicar es como siempre (no se llama a activar);
 *  - si activar falla, la revisión queda publicada y el aviso ofrece el reintento;
 *  - si publicar falla, no se intenta activar.
 */
import { avisoTrasPublicar, debeActivarAlPublicar, publicarConActivacion } from '../activarAlPublicar';

const PUBLICADA = { revisionId: 'r1', numero: 4, publicadaEn: '2026-10-06T15:00:00Z', idempotente: false };

describe('debeActivarAlPublicar', () => {
  test.each([
    [false, true, true],
    [true, true, false],
    [false, false, false],
    [true, false, false],
  ])('adoptado=%s, lector=%s → %s', (v2Adoptado, lectorListo, esperado) => {
    expect(debeActivarAlPublicar({ v2Adoptado, lectorListo })).toBe(esperado);
  });
});

describe('publicarConActivacion', () => {
  test('sin activar y con lector: publica y luego activa', async () => {
    const orden: string[] = [];
    const r = await publicarConActivacion({
      pedida: true,
      estado: { v2Adoptado: false, lectorListo: true },
      publicar: async () => (orden.push('publicar'), PUBLICADA),
      activar: async () => orden.push('activar'),
    });
    expect(orden).toEqual(['publicar', 'activar']);
    expect(r).toEqual({ ...PUBLICADA, activacion: 'activada' });
  });

  test('ya activo: publica y no activa', async () => {
    const activar = jest.fn();
    const r = await publicarConActivacion({
      pedida: true,
      estado: { v2Adoptado: true, lectorListo: true },
      publicar: async () => PUBLICADA,
      activar,
    });
    expect(activar).not.toHaveBeenCalled();
    expect(r.activacion).toBe('no_aplica');
  });

  test('sin lector: publica y no activa (la web quedaría congelada)', async () => {
    const activar = jest.fn();
    const r = await publicarConActivacion({
      pedida: true,
      estado: { v2Adoptado: false, lectorListo: false },
      publicar: async () => PUBLICADA,
      activar,
    });
    expect(activar).not.toHaveBeenCalled();
    expect(r.activacion).toBe('no_aplica');
  });

  test('sin pedirla: nunca activa', async () => {
    const activar = jest.fn();
    const r = await publicarConActivacion({
      pedida: false,
      estado: { v2Adoptado: false, lectorListo: true },
      publicar: async () => PUBLICADA,
      activar,
    });
    expect(activar).not.toHaveBeenCalled();
    expect(r.activacion).toBe('no_aplica');
  });

  test('activar falla: la revisión queda publicada y se informa el fallo sin lanzar', async () => {
    const alFallar = jest.fn();
    const r = await publicarConActivacion({
      pedida: true,
      estado: { v2Adoptado: false, lectorListo: true },
      publicar: async () => PUBLICADA,
      activar: async () => {
        throw new Error('sin permiso');
      },
      alFallarActivacion: alFallar,
    });
    expect(r).toEqual({ ...PUBLICADA, activacion: 'fallo', errorActivacion: 'sin permiso' });
    expect(alFallar).toHaveBeenCalledTimes(1);
  });

  test('publicar falla: el error sube y no se intenta activar', async () => {
    const activar = jest.fn();
    await expect(
      publicarConActivacion({
        pedida: true,
        estado: { v2Adoptado: false, lectorListo: true },
        publicar: async () => {
          throw new Error('conflicto');
        },
        activar,
      }),
    ).rejects.toThrow('conflicto');
    expect(activar).not.toHaveBeenCalled();
  });
});

describe('avisoTrasPublicar', () => {
  test('activada ahora → web actualizada (con «Ver sitio publicado»)', () => {
    expect(avisoTrasPublicar({ v2AdoptadoAntes: false, activacion: 'activada' })).toEqual({ tipo: 'web_actualizada', activadaAhora: true });
  });
  test('ya estaba activa → web actualizada, como hoy', () => {
    expect(avisoTrasPublicar({ v2AdoptadoAntes: true, activacion: 'no_aplica' })).toEqual({ tipo: 'web_actualizada', activadaAhora: false });
    expect(avisoTrasPublicar({ v2AdoptadoAntes: true, activacion: undefined })).toEqual({ tipo: 'web_actualizada', activadaAhora: false });
  });
  test('fallo al activar → reintento «Activar en la web»', () => {
    expect(avisoTrasPublicar({ v2AdoptadoAntes: false, activacion: 'fallo' })).toEqual({ tipo: 'fallo_activar' });
  });
  test('sin lector → queda en el historial, la web sigue con el sitio anterior', () => {
    expect(avisoTrasPublicar({ v2AdoptadoAntes: false, activacion: 'no_aplica' })).toEqual({ tipo: 'sin_activar' });
  });
});
