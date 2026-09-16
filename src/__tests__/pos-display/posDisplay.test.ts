/**
 * Cableado del emisor en el navegador (posDisplay.ts): la carrera al salir
 * del POS durante el arranque. `startPosDisplay` espera la consulta del
 * interruptor maestro antes de arrancar el emisor; si en ese intervalo la
 * página se desmonta (`stopPosDisplay()` desde el cleanup del efecto, o
 * `isCancelled()` pasa a true), el arranque diferido NO debe abrir transporte
 * ni latido en una página que ya no existe: la pantalla debe quedar en
 * «Conectando», no con el último estado congelado.
 *
 * Supabase y la organización activa se sustituyen por dobles: aquí solo se
 * prueba el orden de las operaciones.
 */

import { DisplayEmitter } from '@/lib/pos/display/emitter';
import { getPosDisplayEmitter, startPosDisplay, stopPosDisplay } from '@/lib/pos/display/posDisplay';
import { clearCustomerDisplaySettingsCache } from '@/lib/pos/display/settings';

/** Consulta del interruptor con resolución manual, para simular que la página sale mientras está en vuelo. */
const query: { resolve: (() => void) | null } = { resolve: null };

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () =>
          new Promise((resolve) => {
            query.resolve = () => resolve({ data: { settings: { enabled: true } }, error: null });
          }),
      };
      return chain;
    },
  },
}));

jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
}));

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  clearCustomerDisplaySettingsCache();
  query.resolve = null;
  stopPosDisplay();
});

afterEach(() => {
  jest.restoreAllMocks();
  stopPosDisplay();
});

describe('startPosDisplay · salida del POS con la carga del interruptor en vuelo', () => {
  it('stopPosDisplay() entre la carga y el arranque diferido: el emisor NO arranca', async () => {
    const start = jest.spyOn(DisplayEmitter.prototype, 'start');
    const pending = startPosDisplay({ organizationId: 120, currency: 'COP' });
    await tick();
    expect(query.resolve).not.toBeNull(); // la consulta está en vuelo
    stopPosDisplay(); // cleanup del efecto de la página
    query.resolve!();
    await pending;
    expect(start).not.toHaveBeenCalled();
    expect(getPosDisplayEmitter().isEmitting).toBe(false);
  });

  it('isCancelled() en true al terminar la carga: el emisor NO arranca', async () => {
    const start = jest.spyOn(DisplayEmitter.prototype, 'start');
    let cancelled = false;
    const pending = startPosDisplay({ organizationId: 120, currency: 'COP', isCancelled: () => cancelled });
    await tick();
    cancelled = true;
    query.resolve!();
    await pending;
    expect(start).not.toHaveBeenCalled();
  });

  it('sin cancelación, el emisor arranca con organización y moneda (sin el callback)', async () => {
    const start = jest.spyOn(DisplayEmitter.prototype, 'start');
    const pending = startPosDisplay({ organizationId: 120, currency: 'USD', sessionOpen: true, isCancelled: () => false });
    await tick();
    query.resolve!();
    await pending;
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0][0]).toEqual({ organizationId: 120, currency: 'USD', cashier: undefined, sessionOpen: true });
  });

  it('un segundo startPosDisplay mientras el primero está en vuelo: solo arranca el último', async () => {
    const start = jest.spyOn(DisplayEmitter.prototype, 'start');
    const first = startPosDisplay({ organizationId: 120, currency: 'COP' });
    await tick();
    const resolveFirst = query.resolve!;
    // La segunda llamada encuentra la carga en curso (inflight) y la comparte.
    const second = startPosDisplay({ organizationId: 120, currency: 'USD' });
    await tick();
    resolveFirst();
    await Promise.all([first, second]);
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0][0]).toMatchObject({ currency: 'USD' });
  });
});
