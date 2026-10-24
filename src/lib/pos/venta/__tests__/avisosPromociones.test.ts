/**
 * @jest-environment jsdom
 *
 * El aviso a otras pestañas no puede cerrar el canal: si se cierra justo
 * después de publicar, el POS abierto no recibe el cambio.
 */
import { avisarCambioPromociones, CANAL_PROMOCIONES } from '@/lib/pos/venta/avisosPromociones';

test('reutiliza el canal y no lo cierra', () => {
  const publicaciones: unknown[] = [];
  let construidos = 0;
  let cierres = 0;
  class CanalPersistente {
    constructor() {
      construidos += 1;
    }
    postMessage(data: unknown) {
      publicaciones.push(data);
    }
    close() {
      cierres += 1;
    }
  }
  (globalThis as unknown as { BroadcastChannel: typeof CanalPersistente }).BroadcastChannel = CanalPersistente;
  avisarCambioPromociones();
  avisarCambioPromociones();
  jest.useFakeTimers();
  try {
    jest.advanceTimersByTime(0);
  } finally {
    jest.useRealTimers();
  }
  expect(construidos).toBe(1);
  expect(publicaciones).toEqual([
    { tipo: 'cambio', en: expect.any(Number) },
    { tipo: 'cambio', en: expect.any(Number) },
  ]);
  expect(cierres).toBe(0);
  expect(CANAL_PROMOCIONES).toBe('pos:promociones');
});
