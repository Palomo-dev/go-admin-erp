/**
 * posDisplay.ts (Parte D, ronda 2): el interruptor maestro guardado en OTRA
 * ventana llega a la caja por el evento `storage` de la marca
 * `pos_customer_display_changed`, y el emisor arranca aunque la consulta de
 * moneda base falle (`resolveDisplayCurrency` → 'COP').
 *
 * Sin navegador: Supabase y la organización se simulan; el `window` que
 * posDisplay.ts necesita para `addEventListener('storage')` se simula con un
 * objeto mínimo que captura el listener y permite dispararlo a mano.
 *
 * Ronda 3: la ventana que guarda NO relee la BD. El servicio fija la caché
 * con el valor recién escrito (`primeCustomerDisplaySettings`) y la tarjeta
 * llama a `applyPosDisplaySettings()`: aunque una relectura posterior falle,
 * la caché conserva lo guardado y el emisor emite.
 *
 * (La carrera «salir del POS con la carga en vuelo» vive en posDisplay.test.ts,
 * de la Parte B.)
 */

import { primeCustomerDisplaySettings, clearCustomerDisplaySettingsCache } from '@/lib/pos/display/settings';
import * as settingsModule from '@/lib/pos/display/settings';

type Row = { settings: unknown } | null;
const db: {
  row: Row;
  reads: number;
  /** Error que devuelve maybeSingle a partir de la lectura número `readErrorFrom` (1 = todas). */
  readError: { message: string } | null;
  readErrorFrom: number;
  upserts: Array<Record<string, unknown>>;
} = { row: null, reads: 0, readError: null, readErrorFrom: 1, upserts: [] };

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => {
          db.reads += 1;
          if (db.readError && db.reads >= db.readErrorFrom) return { data: null, error: db.readError };
          return { data: db.row, error: null };
        },
        upsert: async (payload: Record<string, unknown>) => {
          db.upserts.push(payload);
          db.row = { settings: payload.settings }; // lo que queda en la BD
          return { error: null };
        },
      };
      return chain;
    },
  },
}));

jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
}));

type StorageListener = (event: { key: string | null }) => void;

/** `window` mínimo: solo lo que posDisplay.ts usa. Sin localStorage → la terminal usa un id efímero. */
const fakeWindow = {
  listeners: [] as StorageListener[],
  addEventListener(_type: 'storage', listener: StorageListener) {
    this.listeners.push(listener);
  },
  removeEventListener(_type: 'storage', listener: StorageListener) {
    this.listeners = this.listeners.filter((l) => l !== listener);
  },
  fire(key: string | null) {
    for (const l of [...this.listeners]) l({ key });
  },
};

const g = globalThis as unknown as { window?: unknown };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const posDisplay = require('@/lib/pos/display/posDisplay') as typeof import('@/lib/pos/display/posDisplay');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ConfiguracionService } = require('@/components/pos/configuracion/configuracionService') as typeof import('@/components/pos/configuracion/configuracionService');

async function flush(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await new Promise<void>((r) => setImmediate(r));
}

beforeEach(() => {
  g.window = fakeWindow;
  fakeWindow.listeners = [];
  db.row = null;
  db.reads = 0;
  db.readError = null;
  db.readErrorFrom = 1;
  db.upserts = [];
  clearCustomerDisplaySettingsCache();
});

afterEach(() => {
  posDisplay.stopPosDisplay();
  delete g.window;
  jest.restoreAllMocks();
});

// Fase 2 (F2-A): `pos_customer_display` es el esquema completo de settings.ts
// (propina, calificación, reposo, idioma, táctil) y lo que se lee o se escribe
// lleva siempre todos los campos con sus valores por defecto. Estas pruebas
// son del interruptor maestro, así que comparan con objectContaining.
describe('resolveDisplayCurrency', () => {
  it('devuelve el código de la moneda base', async () => {
    expect(await posDisplay.resolveDisplayCurrency(async () => ({ code: 'USD' }))).toBe('USD');
  });

  it('si la consulta rechaza: COP y aviso por consola, nunca excepción', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await posDisplay.resolveDisplayCurrency(() => Promise.reject(new Error('sin fila de moneda')))).toBe('COP');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('respuesta sin código utilizable: COP', async () => {
    expect(await posDisplay.resolveDisplayCurrency(async () => ({ code: '' }))).toBe('COP');
    expect(await posDisplay.resolveDisplayCurrency(async () => null)).toBe('COP');
  });

  it('con la moneda resuelta a COP el emisor arranca igual (la pantalla no depende de la consulta)', async () => {
    primeCustomerDisplaySettings(120, { enabled: true });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const currency = await posDisplay.resolveDisplayCurrency(() => Promise.reject(new Error('caída')));
    const emitter = await posDisplay.startPosDisplay({ organizationId: 120, currency });
    expect(currency).toBe('COP');
    expect(emitter.isEmitting).toBe(true);
  });
});

describe('cambio del interruptor desde otra ventana (evento storage)', () => {
  it('startPosDisplay registra UN listener de storage y stopPosDisplay lo retira', async () => {
    primeCustomerDisplaySettings(120, { enabled: false });
    await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    expect(fakeWindow.listeners).toHaveLength(1);
    // Un segundo arranque (idempotente) sustituye el listener, no lo duplica.
    await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    expect(fakeWindow.listeners).toHaveLength(1);
    posDisplay.stopPosDisplay();
    expect(fakeWindow.listeners).toHaveLength(0);
  });

  it('apagado → la otra ventana enciende: se relee la fila y el emisor empieza a emitir sin recargar', async () => {
    primeCustomerDisplaySettings(120, { enabled: false });
    const emitter = await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    expect(emitter.isEmitting).toBe(false);
    const refresh = jest.spyOn(settingsModule, 'refreshCustomerDisplaySettings');

    db.row = { settings: { enabled: true } }; // lo que guardó Configuración en otra pestaña
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY);
    await flush();

    expect(refresh).toHaveBeenCalledWith(120);
    expect(db.reads).toBe(1);
    expect(emitter.isEmitting).toBe(true);
  });

  it('encendido → la otra ventana apaga: el emisor cierra el transporte', async () => {
    primeCustomerDisplaySettings(120, { enabled: true });
    const emitter = await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    expect(emitter.isEmitting).toBe(true);

    db.row = { settings: { enabled: false } };
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY);
    await flush();

    expect(emitter.isEmitting).toBe(false);
  });

  it('otras claves de localStorage (carritos, terminal) no provocan relecturas', async () => {
    primeCustomerDisplaySettings(120, { enabled: false });
    await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    fakeWindow.fire('pos_carts_120');
    fakeWindow.fire('pos_terminal_id');
    fakeWindow.fire(null); // localStorage.clear()
    await flush();
    expect(db.reads).toBe(0);
  });

  it('tras stopPosDisplay el evento ya no hace nada', async () => {
    primeCustomerDisplaySettings(120, { enabled: false });
    await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    posDisplay.stopPosDisplay();
    db.row = { settings: { enabled: true } };
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY);
    await flush();
    expect(db.reads).toBe(0);
  });

  it('notifyCustomerDisplaySettingsChanged escribe la marca; refreshPosDisplay NO la escribe (sin ping-pong entre cajas)', async () => {
    const writes: Array<[string, string]> = [];
    const storage = { setItem: (k: string, v: string) => void writes.push([k, v]) };
    posDisplay.notifyCustomerDisplaySettingsChanged(storage);
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toBe('pos_customer_display_changed');
    expect(Number(writes[0][1])).toBeGreaterThan(0);

    // Sin storage o con storage que lanza: no lanza.
    posDisplay.notifyCustomerDisplaySettingsChanged(null);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() =>
      posDisplay.notifyCustomerDisplaySettingsChanged({
        setItem: () => {
          throw new Error('QuotaExceeded');
        },
      }),
    ).not.toThrow();

    // refreshPosDisplay relee pero no escribe ninguna marca.
    primeCustomerDisplaySettings(120, { enabled: false });
    await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    await posDisplay.refreshPosDisplay(120);
    expect(writes).toHaveLength(1);
  });

  it('subscribeCustomerDisplaySettingsChanges sin window (SSR): no registra nada y la baja no lanza', () => {
    const off = posDisplay.subscribeCustomerDisplaySettingsChanges(120, null);
    expect(() => off()).not.toThrow();
  });
});

describe('guardar en la MISMA ventana que la caja (navegación SPA Configuración → POS)', () => {
  it('tras el upsert exitoso el servicio fija la caché: isCustomerDisplayEnabled es true aunque la BD deje de responder', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    // La lectura previa del guardado (1.ª) responde; todo lo posterior falla.
    db.row = { settings: { enabled: false } };
    db.readError = { message: 'red caída' };
    db.readErrorFrom = 2;
    const saved = await ConfiguracionService.saveCustomerDisplayConfig({ enabled: true });
    expect(saved).toEqual(expect.objectContaining({ enabled: true }));
    expect(db.upserts).toHaveLength(1);
    expect(settingsModule.isCustomerDisplayEnabled(120)).toBe(true);
    // La tarjeta aplica la caché sin leer: cero consultas nuevas.
    posDisplay.applyPosDisplaySettings();
    expect(db.reads).toBe(1);
    expect(settingsModule.isCustomerDisplayEnabled(120)).toBe(true);
    // Una relectura que falla (evento storage de otra pestaña) tampoco envenena la caché.
    await posDisplay.refreshPosDisplay(120);
    expect(db.reads).toBe(2);
    expect(settingsModule.isCustomerDisplayEnabled(120)).toBe(true);
  });

  it('la caja arrancada en esta ventana enciende con applyPosDisplaySettings() tras guardar, sin relectura', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    primeCustomerDisplaySettings(120, { enabled: false });
    const emitter = await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    expect(emitter.isEmitting).toBe(false);
    db.row = { settings: { enabled: false } };
    db.readError = { message: 'red caída' };
    db.readErrorFrom = 2; // cualquier relectura tras el guardado fallaría
    await ConfiguracionService.saveCustomerDisplayConfig({ enabled: true });
    posDisplay.applyPosDisplaySettings();
    expect(emitter.isEmitting).toBe(true);
    expect(db.reads).toBe(1);
    // Y apagar: misma vía, sin leer.
    db.readError = null;
    await ConfiguracionService.saveCustomerDisplayConfig({ enabled: false });
    posDisplay.applyPosDisplaySettings();
    expect(emitter.isEmitting).toBe(false);
  });

  it('al volver a /app/pos tras guardar, startPosDisplay usa la caché fijada (no consulta) y arranca encendido', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    db.row = { settings: { enabled: false } };
    await ConfiguracionService.saveCustomerDisplayConfig({ enabled: true });
    db.readError = { message: 'red caída' }; // si arrancara leyendo, cachearía «apagado»
    const emitter = await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    expect(db.reads).toBe(1); // solo la lectura previa del guardado
    expect(emitter.isEmitting).toBe(true);
  });

  it('applyPosDisplaySettings sin caja arrancada: no hace nada ni lanza', () => {
    expect(() => posDisplay.applyPosDisplaySettings()).not.toThrow();
    expect(posDisplay.getPosDisplayEmitter().isEmitting).toBe(false);
    expect(db.reads).toBe(0);
  });
});
