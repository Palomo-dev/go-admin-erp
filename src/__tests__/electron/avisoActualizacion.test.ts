/**
 * El preload solo guarda un listener de `update:state`. El aviso de la app
 * y el panel del agente tienen que oír los dos.
 */
import { onDesktopUpdate, type DesktopUpdateState } from '@/lib/utils/desktop';

describe('onDesktopUpdate', () => {
  const original = global.window;

  afterEach(() => {
    if (original === undefined) {
      // @ts-expect-error el entorno node no tiene window
      delete global.window;
    } else {
      global.window = original;
    }
  });

  test('reparte el estado a quien esté escuchando, con una sola suscripción al bridge', () => {
    // En una propiedad: si fuera un `let`, el control de flujo lo deja en `null`
    // porque la asignación ocurre dentro del mock de jest.
    const puente: { entregar: ((estado: DesktopUpdateState) => void) | null } = { entregar: null };
    const onUpdateState = jest.fn((cb: (estado: DesktopUpdateState) => void) => {
      puente.entregar = cb;
    });
    global.window = {
      goAdminDesktop: { onUpdateState },
    } as unknown as Window & typeof globalThis;

    const vistos: string[] = [];
    const dejarA = onDesktopUpdate((estado) => vistos.push(`a:${estado.status}`));
    const dejarB = onDesktopUpdate((estado) => vistos.push(`b:${estado.status}`));
    expect(onUpdateState).toHaveBeenCalledTimes(1);

    puente.entregar?.({ status: 'downloaded', version: '0.2.10' });
    expect(vistos).toEqual(['a:downloaded', 'b:downloaded']);

    dejarA();
    puente.entregar?.({ status: 'error', message: 'red' });
    expect(vistos).toEqual(['a:downloaded', 'b:downloaded', 'b:error']);
    dejarB();
  });
});
