/**
 * Tester · Parte D (indicador en el POS y tarjeta de Configuración › POS),
 * ronda 1. Casos borde que las suites del builder no cubren:
 *
 * - Persistencia (configuracionService): forma exacta del upsert, merge con
 *   las claves de la Fase 2, JSON malformado, `enabled` no booleano, error
 *   de lectura y de escritura, organización desde la sesión.
 * - openDisplay: puente nativo asíncrono que rechaza, `closed` que lanza,
 *   aviso consumido solo tras abrir de verdad, cierre por nombre desde otra
 *   pestaña.
 * - Presencia con el emisor real: antes de `start`, tras `stop`, con dos
 *   pantallas (limitación F0) y el paso a gris por reloj sin `display_bye`.
 * - i18n: las cuatro locales comparten el mismo conjunto de claves y cada
 *   clave que usan los componentes existe.
 *
 * Fixtures ficticios (org 120). Sin Supabase real: el cliente se simula.
 *
 * Ronda 2 (builder): los casos que documentaban hallazgos pasan a comprobar
 * la conducta corregida: lectura previa fallida aborta el guardado, el puente
 * nativo asíncrono que rechaza cae al camino web, ya no se reabre por nombre
 * para cerrar, y el flag del aviso lo escribe la UI tras pintar el toast
 * (`markCustomerDisplayHintShown`). open/close son ahora asíncronas.
 */

import * as fs from 'fs';
import * as path from 'path';
import { BroadcastChannelReceiver, BroadcastChannelTransport, STALE_AFTER_MS } from '@/lib/pos/display/transport';
import { DisplayEmitter } from '@/lib/pos/display/emitter';
import { readDisplayPresence } from '@/lib/pos/display/presence';
import {
  CUSTOMER_DISPLAY_HINT_STORAGE_KEY,
  __resetCustomerDisplayWindowForTests,
  closeCustomerDisplay,
  markCustomerDisplayHintShown,
  openCustomerDisplay,
  type DisplayWindowHandle,
  type DisplayWindowOpener,
  type HintStorage,
} from '@/lib/pos/display/openDisplay';
import { POS_CUSTOMER_DISPLAY_KEY, clearCustomerDisplaySettingsCache } from '@/lib/pos/display/settings';

// ---------------------------------------------------------------------------
// Supabase simulado: solo lo que configuracionService y settings.ts usan.
// ---------------------------------------------------------------------------

type Row = { settings: unknown } | null;
const db: {
  row: Row;
  readError: { message: string } | null;
  upsertError: { message: string } | null;
  upserts: Array<{ payload: Record<string, unknown>; options: Record<string, unknown> }>;
  queries: Array<{ table: string; filters: Array<[string, unknown]> }>;
} = { row: null, readError: null, upsertError: null, upserts: [], queries: [] };

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: (table: string) => {
      const query = { table, filters: [] as Array<[string, unknown]> };
      db.queries.push(query);
      const chain = {
        select: () => chain,
        eq: (col: string, value: unknown) => {
          query.filters.push([col, value]);
          return chain;
        },
        maybeSingle: async () => (db.readError ? { data: null, error: db.readError } : { data: db.row, error: null }),
        upsert: async (payload: Record<string, unknown>, options: Record<string, unknown>) => {
          db.upserts.push({ payload, options });
          return { error: db.upsertError };
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ConfiguracionService } = require('@/components/pos/configuracion/configuracionService') as typeof import('@/components/pos/configuracion/configuracionService');

beforeEach(() => {
  db.row = null;
  db.readError = null;
  db.upsertError = null;
  db.upserts = [];
  db.queries = [];
  clearCustomerDisplaySettingsCache();
  __resetCustomerDisplayWindowForTests();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------------------

// Fase 2 (F2-A): `pos_customer_display` es el esquema completo de settings.ts
// (propina, calificación, reposo, idioma, táctil) y lo que se lee o se escribe
// lleva siempre todos los campos con sus valores por defecto. Estas pruebas
// son del interruptor maestro, así que comparan con objectContaining.
describe('ConfiguracionService.getCustomerDisplayConfig', () => {
  it('lee organization_settings por organización de la sesión y clave pos_customer_display', async () => {
    db.row = { settings: { enabled: true } };
    const { settings, raw } = await ConfiguracionService.getCustomerDisplayConfig();
    expect(settings).toEqual(expect.objectContaining({ enabled: true }));
    expect(raw).toEqual(expect.objectContaining({ enabled: true }));
    const q = db.queries[0];
    expect(q.table).toBe('organization_settings');
    expect(q.filters).toEqual([
      ['organization_id', 120],
      ['key', POS_CUSTOMER_DISPLAY_KEY],
    ]);
    expect(POS_CUSTOMER_DISPLAY_KEY).toBe('pos_customer_display');
  });

  it('sin fila: apagado por defecto y raw vacío', async () => {
    const { settings, raw } = await ConfiguracionService.getCustomerDisplayConfig();
    expect(settings).toEqual(expect.objectContaining({ enabled: false }));
    expect(raw).toEqual({});
  });

  it.each([
    ['array', [true]],
    ['string', 'true'],
    ['number', 1],
    ['null', null],
  ])('JSON malformado (%s) degrada a apagado sin lanzar', async (_label, malformed) => {
    db.row = { settings: malformed };
    const { settings, raw } = await ConfiguracionService.getCustomerDisplayConfig();
    expect(settings).toEqual(expect.objectContaining({ enabled: false }));
    expect(raw).toEqual({});
  });

  it('enabled no booleano ("true", 1) cuenta como apagado: el interruptor es estricto', async () => {
    db.row = { settings: { enabled: 'true' } };
    expect((await ConfiguracionService.getCustomerDisplayConfig()).settings.enabled).toBe(false);
    db.row = { settings: { enabled: 1 } };
    expect((await ConfiguracionService.getCustomerDisplayConfig()).settings.enabled).toBe(false);
  });

  it('error de lectura: no lanza, devuelve apagado y raw vacío (y lo registra)', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    db.readError = { message: 'permission denied' };
    const { settings, raw } = await ConfiguracionService.getCustomerDisplayConfig();
    expect(settings).toEqual(expect.objectContaining({ enabled: false }));
    expect(raw).toEqual({});
    expect(error).toHaveBeenCalled();
  });
});

describe('ConfiguracionService.saveCustomerDisplayConfig', () => {
  it('upsert con la MISMA forma que operating_hours: {organization_id, key, settings, updated_at} y onConflict organization_id,key', async () => {
    const saved = await ConfiguracionService.saveCustomerDisplayConfig({ enabled: true });
    expect(saved).toEqual(expect.objectContaining({ enabled: true }));
    expect(db.upserts).toHaveLength(1);
    const { payload, options } = db.upserts[0];
    expect(Object.keys(payload).sort()).toEqual(['key', 'organization_id', 'settings', 'updated_at']);
    expect(payload.organization_id).toBe(120);
    expect(payload.key).toBe('pos_customer_display');
    expect(payload.settings).toEqual(expect.objectContaining({ enabled: true }));
    expect(typeof payload.updated_at).toBe('string');
    expect(Number.isNaN(Date.parse(payload.updated_at as string))).toBe(false);
    expect(options).toEqual({ onConflict: 'organization_id,key' });
  });

  it('conserva las claves de la Fase 2 que esta UI aún no edita (propina, calificación, reposo…)', async () => {
    db.row = {
      settings: {
        enabled: false,
        tips: { enabled: true, presets: [5, 10, 15], allowCustom: true },
        rating: { enabled: true },
        idle: { mode: 'brand', mediaUrls: [], idleAfterSeconds: 90 },
      },
    };
    await ConfiguracionService.saveCustomerDisplayConfig({ enabled: true });
    expect(db.upserts[0].payload.settings).toEqual(
      expect.objectContaining({
        enabled: true,
        tips: { enabled: true, presets: [5, 10, 15], allowCustom: true },
        rating: { enabled: true },
        idle: { mode: 'brand', mediaUrls: [], idleAfterSeconds: 90 },
      }),
    );
  });

  it('normaliza un enabled corrupto en la fila al guardar ("true" → false; el cambio pedido manda)', async () => {
    db.row = { settings: { enabled: 'true', foo: 1 } };
    await ConfiguracionService.saveCustomerDisplayConfig({});
    // parse estricto: 'true' no es true; el merge escribe el booleano validado
    expect(db.upserts[0].payload.settings).toEqual(expect.objectContaining({ enabled: false, foo: 1 }));
  });

  it('error del upsert: lanza (la tarjeta revierte el interruptor y avisa)', async () => {
    db.upsertError = { message: 'RLS' };
    await expect(ConfiguracionService.saveCustomerDisplayConfig({ enabled: true })).rejects.toEqual({ message: 'RLS' });
  });

  it('la organización sale de la sesión: un config con organization_id ajeno no llega al upsert', async () => {
    await ConfiguracionService.saveCustomerDisplayConfig({ enabled: true, organization_id: 999 } as never);
    // El campo extra viaja dentro de `settings` (JSON), nunca como columna organization_id.
    expect(db.upserts[0].payload.organization_id).toBe(120);
  });

  it('error de lectura previa: el guardado ABORTA (rechaza) y no hay upsert; las claves de la Fase 2 quedan intactas', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    db.readError = { message: 'timeout' };
    await expect(ConfiguracionService.saveCustomerDisplayConfig({ enabled: true })).rejects.toEqual({ message: 'timeout' });
    expect(db.upserts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// openDisplay
// ---------------------------------------------------------------------------

function handle(): DisplayWindowHandle & { focusCalls: number; closeCalls: number } {
  const h = {
    closed: false,
    focusCalls: 0,
    closeCalls: 0,
    focus() {
      this.focusCalls += 1;
    },
    close() {
      this.closeCalls += 1;
      this.closed = true;
    },
  };
  return h;
}

function opener(next: () => DisplayWindowHandle | null): DisplayWindowOpener & { calls: Array<[string, string, string | undefined]> } {
  const o = {
    calls: [] as Array<[string, string, string | undefined]>,
    open(url: string, name: string, features?: string) {
      o.calls.push([url, name, features]);
      return next();
    },
  };
  return o;
}

function memoryStorage(initial: Record<string, string> = {}): HintStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe('openCustomerDisplay · bordes', () => {
  it('el aviso de arrastrar NO se consume si la emergente fue bloqueada: la siguiente apertura válida sí avisa', async () => {
    const storage = memoryStorage();
    const blocked = opener(() => null);
    expect(await openCustomerDisplay({ win: blocked, storage, nativeApi: null })).toEqual({ via: 'blocked' });
    expect(storage.data[CUSTOMER_DISPLAY_HINT_STORAGE_KEY]).toBeUndefined();

    const ok = opener(() => handle());
    expect(await openCustomerDisplay({ win: ok, storage, nativeApi: null })).toEqual({ via: 'web', firstTime: true });
    // El flag lo escribe la UI después de pintar el toast, no la apertura.
    expect(storage.data[CUSTOMER_DISPLAY_HINT_STORAGE_KEY]).toBeUndefined();
    markCustomerDisplayHintShown(storage);
    expect(storage.data[CUSTOMER_DISPLAY_HINT_STORAGE_KEY]).toBe('1');
  });

  it('storage con getItem OK pero setItem que lanza (cuota llena): abre y avisa; no lanza', async () => {
    const storage: HintStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const ok = opener(() => handle());
    expect(await openCustomerDisplay({ win: ok, storage, nativeApi: null })).toEqual({ via: 'web', firstTime: true });
  });

  it('la referencia guardada cuyo `closed` lanza (contexto cruzado) se descarta y se abre de nuevo', async () => {
    const first = opener(() => handle());
    await openCustomerDisplay({ win: first, storage: memoryStorage(), nativeApi: null });
    // Simula que el handle guardado pasa a ser inaccesible: se sustituye por uno cuyo getter lanza.
    __resetCustomerDisplayWindowForTests();
    const poisoned = opener(() => ({
      get closed(): boolean {
        throw new Error('SecurityError');
      },
      focus() {},
      close() {},
    }));
    await openCustomerDisplay({ win: poisoned, storage: memoryStorage({ [CUSTOMER_DISPLAY_HINT_STORAGE_KEY]: '1' }), nativeApi: null });
    const third = opener(() => handle());
    const result = await openCustomerDisplay({ win: third, storage: memoryStorage({ [CUSTOMER_DISPLAY_HINT_STORAGE_KEY]: '1' }), nativeApi: null });
    expect(result).toEqual({ via: 'web', firstTime: false });
    expect(third.calls).toHaveLength(1);
  });

  it('focus() que lanza sobre una ventana viva: sigue siendo "focused" y no abre otra', async () => {
    const live = handle();
    live.focus = () => {
      throw new Error('sin gesto de usuario');
    };
    const o = opener(() => live);
    await openCustomerDisplay({ win: o, storage: memoryStorage(), nativeApi: null });
    expect(await openCustomerDisplay({ win: o, storage: memoryStorage(), nativeApi: null })).toEqual({ via: 'focused' });
    expect(o.calls).toHaveLength(1);
  });

  // El puente de escritorio de F1 será IPC asíncrono (`ipcRenderer.invoke` →
  // Promise): se espera y un rechazo cae al camino web (ronda 2).
  it('puente nativo que devuelve una promesa rechazada: se avisa y se cae al camino web', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const web = opener(() => handle());
    const result = await openCustomerDisplay({
      win: web,
      storage: memoryStorage(),
      nativeApi: { open: () => Promise.reject(new Error('monitor no disponible')) },
    });
    expect(result).toEqual({ via: 'web', firstTime: true });
    expect(web.calls).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('closeCustomerDisplay · bordes', () => {
  it('con referencia propia ya cerrada por el cajero: no la cierra dos veces y no abre por nombre', async () => {
    const h = handle();
    const o = opener(() => h);
    await openCustomerDisplay({ win: o, storage: memoryStorage(), nativeApi: null });
    h.close(); // el cajero cerró la emergente con la X
    expect(await closeCustomerDisplay({ win: o, nativeApi: null, knownOpen: false })).toBe('none');
    expect(h.closeCalls).toBe(1);
    expect(o.calls).toHaveLength(1);
  });

  it('close() que lanza sobre la referencia propia: la olvida igual ("handle") y no lanza', async () => {
    const h = handle();
    h.close = () => {
      throw new Error('ventana destruida');
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const o = opener(() => h);
    await openCustomerDisplay({ win: o, storage: memoryStorage(), nativeApi: null });
    expect(await closeCustomerDisplay({ win: o, nativeApi: null })).toBe('handle');
    expect(warn).toHaveBeenCalled();
    // Ya no hay referencia: un segundo cierre sin knownOpen no hace nada.
    expect(await closeCustomerDisplay({ win: o, nativeApi: null })).toBe('none');
  });

  // `window.open('', 'pos-display')` solo alcanza ventanas del mismo grupo de
  // contextos (abiertas por ESTA pestaña o sus descendientes). Si la pantalla
  // la abrió otra pestaña, crearía una emergente NUEVA en blanco que parpadea.
  // Ronda 2: ya no se reabre por nombre; se informa 'none' y la UI avisa.
  it('sin referencia propia aunque el monitor vea pantalla: "none" y no se abre nada por nombre', async () => {
    const fresh = handle();
    const o = opener(() => fresh);
    expect(await closeCustomerDisplay({ win: o, nativeApi: null, knownOpen: true })).toBe('none');
    expect(o.calls).toEqual([]);
    expect(fresh.closeCalls).toBe(0);
  });

  it('puente nativo con close() que lanza: cae al camino web y registra el aviso', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const h = handle();
    const o = opener(() => h);
    await openCustomerDisplay({ win: o, storage: memoryStorage(), nativeApi: null });
    const result = await closeCustomerDisplay({
      win: o,
      nativeApi: {
        open: () => undefined,
        close: () => {
          throw new Error('ipc');
        },
      },
    });
    expect(result).toBe('handle');
    expect(h.closeCalls).toBe(1);
    expect(warn).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Presencia con el emisor real
// ---------------------------------------------------------------------------

const TERMINAL = '11111111-2222-4333-8444-555555555555';
const CAPS = { touch: false, width: 1280, height: 800 } as const;

async function flush(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await new Promise<void>((r) => setImmediate(r));
}
async function waitFor(pred: () => boolean, timeoutMs = 1500): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: se agotó el tiempo');
    await flush(1);
  }
}

const opened: Array<{ close(): void }> = [];
function track<T extends { close(): void }>(x: T): T {
  opened.push(x);
  return x;
}
afterEach(() => {
  while (opened.length > 0) opened.pop()?.close();
});

function makeEmitter(isEnabled: () => boolean, now?: () => number): DisplayEmitter {
  const emitter = new DisplayEmitter({
    createTransport: () => track(new BroadcastChannelTransport({ terminalId: TERMINAL, now })),
    isEnabled,
    schedule: (fn) => {
      const id = setTimeout(fn, 0);
      return () => clearTimeout(id);
    },
  });
  opened.push({ close: () => emitter.stop() });
  return emitter;
}

describe('presencia · emisor real', () => {
  it('antes de start (el POS aún carga): gris, no emite, no lanza', async () => {
    const emitter = makeEmitter(() => true);
    expect(readDisplayPresence(emitter)).toEqual({ connected: false, emitting: false, reason: 'disabled', lastSeenAt: null });
  });

  it('start con interruptor encendido pero sin pantalla: emite y gris', async () => {
    const emitter = makeEmitter(() => true);
    emitter.start({ organizationId: 120, currency: 'COP' });
    expect(readDisplayPresence(emitter)).toEqual({ connected: false, emitting: true, reason: null, lastSeenAt: null });
  });

  it('tras stop() (salir del POS): gris y sin transporte, aunque la pantalla siga viva', async () => {
    const emitter = makeEmitter(() => true);
    emitter.start({ organizationId: 120, currency: 'COP' });
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, presenceIntervalMs: 20 }));
    display.startPresence({ ...CAPS });
    await waitFor(() => readDisplayPresence(emitter).connected);
    emitter.stop();
    expect(readDisplayPresence(emitter)).toEqual({ connected: false, emitting: false, reason: 'disabled', lastSeenAt: null });
  });

  it('la pantalla se cierra sin despedirse (pestaña matada): gris a los 3 s por reloj', async () => {
    let clock = 50_000;
    const emitter = makeEmitter(() => true, () => clock);
    emitter.start({ organizationId: 120, currency: 'COP' });
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, presenceIntervalMs: 60_000 }));
    display.startPresence({ ...CAPS }); // un único «estoy» y luego silencio
    await waitFor(() => emitter.lastDisplaySeenAt !== null);
    expect(readDisplayPresence(emitter, clock + STALE_AFTER_MS - 1).connected).toBe(true);
    expect(readDisplayPresence(emitter, clock + STALE_AFTER_MS).connected).toBe(false);
    clock += STALE_AFTER_MS;
    expect(readDisplayPresence(emitter).connected).toBe(false);
  });

  it('refresh() sin cambio del interruptor no reinicia la presencia (no parpadea a gris)', async () => {
    const emitter = makeEmitter(() => true);
    emitter.start({ organizationId: 120, currency: 'COP' });
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, presenceIntervalMs: 20 }));
    display.startPresence({ ...CAPS });
    await waitFor(() => readDisplayPresence(emitter).connected);
    emitter.refresh(); // la tarjeta guardó el mismo valor
    expect(readDisplayPresence(emitter).connected).toBe(true);
  });

  it('apagar y volver a encender: el transporte nuevo arranca en gris hasta el siguiente display_alive', async () => {
    let enabled = true;
    const emitter = makeEmitter(() => enabled);
    emitter.start({ organizationId: 120, currency: 'COP' });
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, presenceIntervalMs: 20 }));
    display.startPresence({ ...CAPS });
    await waitFor(() => readDisplayPresence(emitter).connected);

    enabled = false;
    emitter.refresh();
    expect(readDisplayPresence(emitter)).toEqual({ connected: false, emitting: false, reason: 'disabled', lastSeenAt: null });

    enabled = true;
    emitter.refresh();
    expect(readDisplayPresence(emitter).emitting).toBe(true);
    await waitFor(() => readDisplayPresence(emitter).connected);
  });

  it('limitación F0 documentada: con dos pantallas, el display_bye de una deja gris hasta el siguiente latido de la otra', async () => {
    const emitter = makeEmitter(() => true);
    emitter.start({ organizationId: 120, currency: 'COP' });
    const a = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, presenceIntervalMs: 60_000 }));
    const b = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, presenceIntervalMs: 60_000 }));
    a.startPresence({ ...CAPS });
    b.startPresence({ ...CAPS });
    await waitFor(() => readDisplayPresence(emitter).connected);
    a.close(); // display_bye de A
    await waitFor(() => readDisplayPresence(emitter).lastSeenAt === null);
    expect(readDisplayPresence(emitter).connected).toBe(false); // B sigue viva pero el indicador miente hasta su latido
  });

  it('otra terminal en la misma máquina no pone verde a esta caja', async () => {
    const emitter = makeEmitter(() => true);
    emitter.start({ organizationId: 120, currency: 'COP' });
    const foreign = track(new BroadcastChannelReceiver({ terminalId: 'ffffffff-0000-4111-8222-333333333333', presenceIntervalMs: 20 }));
    foreign.startPresence({ ...CAPS });
    await flush(10);
    expect(readDisplayPresence(emitter).connected).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

function flattenKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => flattenKeys(v, prefix ? `${prefix}.${k}` : k));
}

describe('i18n posCustomerDisplay', () => {
  const root = path.resolve(__dirname, '../../..');
  const locales = ['es', 'en', 'pt', 'fr'];
  const messages = Object.fromEntries(
    locales.map((l) => [l, JSON.parse(fs.readFileSync(path.join(root, 'messages', `${l}.json`), 'utf8')) as Record<string, unknown>]),
  );

  it('las cuatro locales tienen exactamente el mismo conjunto de claves', async () => {
    const sets = locales.map((l) => flattenKeys(messages[l].posCustomerDisplay).sort());
    for (const s of sets.slice(1)) expect(s).toEqual(sets[0]);
    expect(sets[0].length).toBeGreaterThan(0);
  });

  it('ninguna traducción está vacía ni es igual entre es y en (copia sin traducir)', async () => {
    const es = messages.es.posCustomerDisplay as Record<string, Record<string, string>>;
    const en = messages.en.posCustomerDisplay as Record<string, Record<string, string>>;
    for (const ns of Object.keys(es)) {
      for (const k of Object.keys(es[ns])) {
        expect(es[ns][k].trim().length).toBeGreaterThan(0);
        expect(en[ns][k].trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('cada clave que usan los componentes de la Parte D existe en las cuatro locales', async () => {
    const files: Array<[string, string]> = [
      ['src/components/pos/display/CustomerDisplayIndicator.tsx', 'posCustomerDisplay'],
      ['src/components/pos/configuracion/pantalla-cliente/PantallaClienteContent.tsx', 'posCustomerDisplay.config'],
      ['src/components/pos/configuracion/ConfigModals.tsx', 'posCustomerDisplay.config'],
      ['src/components/pos/configuracion/ConfiguracionPage.tsx', 'posCustomerDisplay.config'],
    ];
    const used: string[] = [];
    for (const [rel, ns] of files) {
      const src = fs.readFileSync(path.join(root, rel), 'utf8');
      // Namespaces declarados en el archivo: const x = useTranslations('…')
      const nsByVar = new Map<string, string>();
      for (const m of src.matchAll(/const\s+(\w+)\s*=\s*useTranslations\('([^']+)'\)/g)) nsByVar.set(m[1], m[2]);
      if (nsByVar.size === 0) nsByVar.set('t', ns);
      for (const m of src.matchAll(/\b(t\w*)\('([^']+)'\)/g)) {
        const scope = nsByVar.get(m[1]);
        if (!scope) continue;
        used.push(`${scope}.${m[2]}`);
      }
    }
    expect(used.length).toBeGreaterThan(10);
    for (const l of locales) {
      const keys = new Set(flattenKeys(messages[l]));
      for (const k of used) expect({ locale: l, key: k, exists: keys.has(k) }).toEqual({ locale: l, key: k, exists: true });
    }
  });

  it('los textos del PLAN aparecen literalmente en español', async () => {
    const es = messages.es.posCustomerDisplay as { indicator: Record<string, string>; menu: Record<string, string>; toast: Record<string, string> };
    expect(es.indicator.connected).toBe('Pantalla del cliente conectada');
    expect(es.indicator.disconnected).toBe('Sin pantalla');
    expect(es.menu.open).toBe('Abrir pantalla del cliente');
    expect(es.menu.close).toBe('Cerrar');
    expect(es.toast.dragHint).toBe('Arrastre la ventana a la pantalla del cliente y pulse F11');
  });

  it('los componentes nuevos no traen textos en español cableados en JSX', async () => {
    const files = [
      'src/components/pos/display/CustomerDisplayIndicator.tsx',
      'src/components/pos/configuracion/pantalla-cliente/PantallaClienteContent.tsx',
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(root, rel), 'utf8');
      // Texto entre > y < con letras acentuadas o palabras comunes; se ignoran comentarios.
      const jsx = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      const hardcoded = [...jsx.matchAll(/>\s*([A-Za-zÁÉÍÓÚáéíóúñÑ][^<{}]{3,})</g)].map((m) => m[1].trim());
      expect(hardcoded).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Hallazgos de la ronda 1, corregidos en la ronda 2. Se comprueban aquí de
// forma estática lo que no se puede renderizar en Node (los .tsx).
// ---------------------------------------------------------------------------

describe('correcciones ronda 2 · Parte D', () => {
  const root = path.resolve(__dirname, '../../..');
  it('ningún componente de la Parte D usa el toast de sonner (no hay <Toaster /> de sonner montado); todos usan useToast de shadcn', () => {
    const files = [
      'src/components/pos/display/CustomerDisplayIndicator.tsx',
      'src/components/pos/configuracion/pantalla-cliente/PantallaClienteContent.tsx',
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(root, rel), 'utf8');
      expect({ file: rel, sonner: /from 'sonner'/.test(src) }).toEqual({ file: rel, sonner: false });
      expect({ file: rel, useToast: /useToast\(\)/.test(src) }).toEqual({ file: rel, useToast: true });
    }
  });

  it('el flag del aviso lo escribe la UI justo después de pintar el toast (markCustomerDisplayHintShown tras dragHint)', () => {
    const files = [
      'src/components/pos/display/CustomerDisplayIndicator.tsx',
      'src/components/pos/configuracion/pantalla-cliente/PantallaClienteContent.tsx',
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(root, rel), 'utf8');
      const hint = src.indexOf("dragHint'");
      const mark = src.indexOf('markCustomerDisplayHintShown()');
      expect({ file: rel, ok: hint > 0 && mark > hint }).toEqual({ file: rel, ok: true });
    }
  });

  it('la tarjeta ya no promete que la caja de otra pestaña lo verá «al arrancar de nuevo»', () => {
    const src = fs.readFileSync(path.join(root, 'src/components/pos/configuracion/pantalla-cliente/PantallaClienteContent.tsx'), 'utf8');
    expect(src).not.toContain('al arrancar de nuevo');
  });

  it('la página del POS arranca el emisor aunque la consulta de moneda falle (resolveDisplayCurrency) y para con stopPosDisplay', () => {
    const src = fs.readFileSync(path.join(root, 'src/app/app/pos/page.tsx'), 'utf8');
    expect(src).toContain('resolveDisplayCurrency(() => POSService.getBaseCurrency())');
    expect(src).toContain('stopPosDisplay()');
  });
});
