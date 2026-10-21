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
    let entregar: ((estado: DesktopUpdateState) => void) | null = null;
    const onUpdateState = jest.fn((cb: (estado: DesktopUpdateState) => void) => {
      entregar = cb;
    });
    global.window = {
      goAdminDesktop: { onUpdateState },
    } as unknown as Window & typeof globalThis;

    const vistos: string[] = [];
    const dejarA = onDesktopUpdate((estado) => vistos.push(`a:${estado.status}`));
    const dejarB = onDesktopUpdate((estado) => vistos.push(`b:${estado.status}`));
    expect(onUpdateState).toHaveBeenCalledTimes(1);

    entregar?.({ status: 'downloaded', version: '0.2.10' });
    expect(vistos).toEqual(['a:downloaded', 'b:downloaded']);

    dejarA();
    entregar?.({ status: 'error', message: 'red' });
    expect(vistos).toEqual(['a:downloaded', 'b:downloaded', 'b:error']);
    dejarB();
  });
});
