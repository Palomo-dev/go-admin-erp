/**
 * Fase 2 (parte A) · settings.ts: esquema zod completo de
 * `pos_customer_display` (PLAN §5.2 y §6.1).
 *
 * - Valores por defecto exactos del plan.
 * - `parseCustomerDisplaySettings` degrada CAMPO A CAMPO: un preset fuera de
 *   rango, un locale que no es BCP 47 o un bloque que no es objeto vuelven a
 *   su valor por defecto sin arrastrar a los demás y sin lanzar.
 * - `saveCustomerDisplaySettings`: lee, mezcla, valida, upsert con la MISMA
 *   forma que operating_hours y fija la caché; no toca la fila si la lectura
 *   previa falla.
 * - `toDisplayPresentationSettings`: lo que viaja en hello.settings.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as settingsMod from '@/lib/pos/display/settings';
import {
  DEFAULT_CUSTOMER_DISPLAY_SETTINGS,
  IDLE_AFTER_SECONDS_MAX,
  IDLE_AFTER_SECONDS_MIN,
  MEDIA_URL_PATTERN,
  POS_CUSTOMER_DISPLAY_KEY,
  clearCustomerDisplaySettingsCache,
  customerDisplaySettingsSchema,
  defaultCustomerDisplaySettings,
  getCachedCustomerDisplaySettings,
  hasCustomerDisplaySettingsCache,
  isValidMediaUrl,
  isValidTipPresets,
  parseCustomerDisplaySettings,
  saveCustomerDisplaySettings,
  toDisplayPresentationSettings,
} from '@/lib/pos/display/settings';

// ---------------------------------------------------------------------------
// Supabase simulado: solo lo que settings.ts usa.
// ---------------------------------------------------------------------------

type Row = { settings: unknown } | null;
const db: {
  row: Row;
  readError: { message: string } | null;
  upsertError: { message: string } | null;
  upserts: Array<{ payload: Record<string, unknown>; options: Record<string, unknown> }>;
  filters: Array<[string, unknown]>;
} = { row: null, readError: null, upsertError: null, upserts: [], filters: [] };

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: () => {
      const chain = {
        select: () => chain,
        eq: (col: string, value: unknown) => {
          db.filters.push([col, value]);
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

beforeEach(() => {
  db.row = null;
  db.readError = null;
  db.upsertError = null;
  db.upserts = [];
  db.filters = [];
  clearCustomerDisplaySettingsCache();
});

const ROOT = path.resolve(__dirname, '../../..');
const readSettingsSource = () => fs.readFileSync(path.join(ROOT, 'src/lib/pos/display/settings.ts'), 'utf8');

/**
 * Helpers puros de AjustesPantallaSection (TSX: ts-jest con jsx preserve no lo
 * carga). Mismo truco que tester-f2a-r1: se transpila con el compilador de
 * TypeScript y se ejecuta con un `require` que sustituye la UI por stubs y
 * deja pasar settings.ts REAL, para que validateDraft use el mismo predicado.
 */
type Draft = Omit<import('@/lib/pos/display/settings').CustomerDisplaySettings, 'enabled'>;
interface CardHelpers {
  validateDraft: (d: Draft) => string | null;
  firstInvalidMediaUrl: (d: Draft) => string | null;
}
const cardHelpers = ((): CardHelpers => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ts = require('typescript') as typeof import('typescript');
  const source = fs.readFileSync(path.join(ROOT, 'src/components/pos/configuracion/pantalla-cliente/AjustesPantallaSection.tsx'), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const stub = new Proxy({}, { get: () => () => null });
  const fakeRequire = (id: string) => {
    if (id === '@/lib/pos/display/settings') return settingsMod;
    if (id === '@/lib/pos/display/protocol') return {};
    if (id === '@/i18n/config') return { locales: ['es', 'en'], localeNames: { es: 'Español', en: 'English' } };
    return stub;
  };
  const mod = { exports: {} as Record<string, unknown> };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('require', 'module', 'exports', js)(fakeRequire, mod, mod.exports);
  return mod.exports as unknown as CardHelpers;
})();
const { validateDraft, firstInvalidMediaUrl } = cardHelpers;
const toDraftForTest = (): Draft => {
  const { enabled: _enabled, ...rest } = defaultCustomerDisplaySettings();
  void _enabled;
  return rest;
};

const PLAN_DEFAULTS = {
  enabled: false,
  tips: { enabled: false, presets: [5, 10, 15], allowCustom: true },
  rating: { enabled: false },
  showTaxBreakdown: false,
  showCustomerName: false,
  idle: { mode: 'brand', mediaUrls: [], idleAfterSeconds: 90 },
  locale: null,
  touch: 'auto',
};

// ---------------------------------------------------------------------------

describe('settings.ts · valores por defecto (PLAN §5.2 / §6.1)', () => {
  it('DEFAULT_CUSTOMER_DISPLAY_SETTINGS es exactamente el JSON de PLAN §6.1', () => {
    expect(DEFAULT_CUSTOMER_DISPLAY_SETTINGS).toEqual(PLAN_DEFAULTS);
  });

  it('defaultCustomerDisplaySettings() devuelve una copia mutable e independiente', () => {
    const a = defaultCustomerDisplaySettings();
    const b = defaultCustomerDisplaySettings();
    a.tips.presets.push(20);
    a.idle.mediaUrls.push('https://x');
    expect(b.tips.presets).toEqual([5, 10, 15]);
    expect(b.idle.mediaUrls).toEqual([]);
    expect(DEFAULT_CUSTOMER_DISPLAY_SETTINGS.tips.presets).toEqual([5, 10, 15]);
  });

  it('el esquema acepta los defaults tal cual (round-trip sin cambios)', () => {
    expect(customerDisplaySettingsSchema.parse(PLAN_DEFAULTS)).toEqual(PLAN_DEFAULTS);
  });
});

describe('settings.ts · parseCustomerDisplaySettings degrada sin lanzar', () => {
  it.each([null, undefined, 'x', 1, true, [], ['a']])('raíz no-objeto (%p) → todos los defaults', (raw) => {
    expect(parseCustomerDisplaySettings(raw)).toEqual(PLAN_DEFAULTS);
  });

  it('objeto vacío → defaults', () => {
    expect(parseCustomerDisplaySettings({})).toEqual(PLAN_DEFAULTS);
  });

  it('una fila completa y válida se devuelve tal cual', () => {
    const full = {
      enabled: true,
      tips: { enabled: true, presets: [8, 12, 18], allowCustom: false },
      rating: { enabled: true },
      showTaxBreakdown: true,
      showCustomerName: true,
      idle: { mode: 'media', mediaUrls: ['https://cdn.example.com/a.jpg', 'http://cdn.example.com/b.png'], idleAfterSeconds: 120 },
      locale: 'pt-BR',
      touch: 'touch',
    };
    expect(parseCustomerDisplaySettings(full)).toEqual(full);
  });

  it('enabled no booleano ("true", 1) → false; el resto no se ve afectado', () => {
    expect(parseCustomerDisplaySettings({ enabled: 'true', showTaxBreakdown: true }).enabled).toBe(false);
    expect(parseCustomerDisplaySettings({ enabled: 1, showTaxBreakdown: true }).showTaxBreakdown).toBe(true);
  });

  describe('presets de propina', () => {
    it.each([
      ['cuatro valores', [5, 10, 15, 20]],
      ['dos valores', [5, 10]],
      ['negativo', [-5, 10, 15]],
      ['cero', [0, 10, 15]],
      ['mayor que 100', [5, 10, 150]],
      ['NaN', [5, Number.NaN, 15]],
      ['string', ['5', '10', '15']],
      ['no array', 10],
      ['vacío', []],
      // Ronda 2 de F2-A: enteros DISTINTOS entre 1 y 100 (lo que dice la tarjeta).
      ['decimal (7.5)', [7.5, 10, 100]],
      ['0.01 (ya no es el mínimo)', [0.01, 50, 100]],
      ['duplicados (tres botones iguales)', [10, 10, 10]],
      ['dos iguales', [5, 10, 10]],
    ])('%s → 5/10/15 entero, sin tocar enabled/allowCustom', (_name, presets) => {
      const parsed = parseCustomerDisplaySettings({ tips: { enabled: true, presets, allowCustom: false } });
      expect(parsed.tips).toEqual({ enabled: true, presets: [5, 10, 15], allowCustom: false });
    });

    it('los límites 1 y 100 se aceptan; se guardan ORDENADOS de menor a mayor', () => {
      expect(parseCustomerDisplaySettings({ tips: { presets: [100, 1, 50] } }).tips.presets).toEqual([1, 50, 100]);
      expect(parseCustomerDisplaySettings({ tips: { presets: [15, 5, 10] } }).tips.presets).toEqual([5, 10, 15]);
    });

    it('isValidTipPresets: mismo criterio que el esquema (la tarjeta lo usa para nombrar el campo antes del viaje)', () => {
      expect(isValidTipPresets([5, 10, 15])).toBe(true);
      expect(isValidTipPresets([15, 5, 10])).toBe(true); // desordenados válidos: se ordenan al guardar
      expect(isValidTipPresets([1, 50, 100])).toBe(true);
      expect(isValidTipPresets([10, 10, 15])).toBe(false);
      expect(isValidTipPresets([7.5, 10, 15])).toBe(false);
      expect(isValidTipPresets([0, 10, 15])).toBe(false);
      expect(isValidTipPresets([5, 10, 101])).toBe(false);
      expect(isValidTipPresets([5, 10])).toBe(false);
      expect(isValidTipPresets([Number.NaN, 10, 15])).toBe(false);
      expect(isValidTipPresets('5,10,15')).toBe(false);
    });

    it('tips no objeto → bloque entero por defecto', () => {
      expect(parseCustomerDisplaySettings({ tips: 'si' }).tips).toEqual(PLAN_DEFAULTS.tips);
      expect(parseCustomerDisplaySettings({ tips: null }).tips).toEqual(PLAN_DEFAULTS.tips);
    });
  });

  describe('locale', () => {
    it.each(['es', 'es-CO', 'pt-BR', 'zh-Hant-TW', 'en-US'])('%s es válido', (locale) => {
      expect(parseCustomerDisplaySettings({ locale }).locale).toBe(locale);
    });
    it.each([null, undefined, '', 'e', 'español', 'es_CO', 'es-', 42, {}, 'javascript:alert(1)'])('%p → null (idioma de la organización)', (locale) => {
      expect(parseCustomerDisplaySettings({ locale }).locale).toBeNull();
    });
  });

  describe('reposo', () => {
    it('modo desconocido → brand; segundos fuera de rango o no enteros → 90', () => {
      expect(parseCustomerDisplaySettings({ idle: { mode: 'video', idleAfterSeconds: 5 } }).idle).toEqual({ mode: 'brand', mediaUrls: [], idleAfterSeconds: 90 });
      expect(parseCustomerDisplaySettings({ idle: { idleAfterSeconds: IDLE_AFTER_SECONDS_MAX + 1 } }).idle.idleAfterSeconds).toBe(90);
      expect(parseCustomerDisplaySettings({ idle: { idleAfterSeconds: 30.5 } }).idle.idleAfterSeconds).toBe(90);
      expect(parseCustomerDisplaySettings({ idle: { idleAfterSeconds: IDLE_AFTER_SECONDS_MIN } }).idle.idleAfterSeconds).toBe(IDLE_AFTER_SECONDS_MIN);
    });

    it('mediaUrls: se conservan solo las http(s); las demás se descartan una a una', () => {
      const parsed = parseCustomerDisplaySettings({
        idle: { mode: 'media', mediaUrls: ['https://a/x.jpg', 'javascript:alert(1)', 'data:image/png;base64,AA', '/relativa', 42, ' http://b/y.png '] },
      });
      expect(parsed.idle.mediaUrls).toEqual(['https://a/x.jpg', 'http://b/y.png']);
      expect(parsed.idle.mode).toBe('media');
    });

    it('mediaUrls no array → []', () => {
      expect(parseCustomerDisplaySettings({ idle: { mediaUrls: 'https://a' } }).idle.mediaUrls).toEqual([]);
    });

    it('ronda 3 (QA bajo #4): una URL con salto de línea dentro («https://a.com\nhttps://b.com») o con espacio («https://x.com/a b») se descarta; z.string().url() sola las aceptaba', () => {
      const conSalto = 'https://a.com\nhttps://b.com';
      const conEspacio = 'https://x.com/a b';
      const conTab = 'https://x.com/a\tb';
      const parsed = parseCustomerDisplaySettings({ idle: { mode: 'media', mediaUrls: [conSalto, 'https://ok.example/1.png', conEspacio, conTab] } });
      expect(parsed.idle.mediaUrls).toEqual(['https://ok.example/1.png']);
      // El round-trip por el textarea (join('\n') + split) ya no cambia el número de URLs.
      expect(parsed.idle.mediaUrls.join('\n').split(/\r?\n/)).toHaveLength(1);
    });

    it('ronda 4: isValidMediaUrl es el ÚNICO predicado (patrón + new URL): «https://%» y «http://[» se rechazan en el predicado, en validateDraft y en el esquema con el mismo resultado', () => {
      for (const bad of ['https://%', 'http://[']) {
        expect(MEDIA_URL_PATTERN.test(bad)).toBe(true); // el patrón solo no basta
        expect(isValidMediaUrl(bad)).toBe(false);
        expect(parseCustomerDisplaySettings({ idle: { mode: 'media', mediaUrls: [bad, 'https://ok.example/1.png'] } }).idle.mediaUrls).toEqual(['https://ok.example/1.png']);
        const draft = { ...toDraftForTest(), idle: { mode: 'media' as const, mediaUrls: [bad], idleAfterSeconds: 90 } };
        expect(validateDraft(draft)).toBe('mediaUrls');
        expect(firstInvalidMediaUrl(draft)).toBe(bad);
      }
      // Lo que el predicado acepta, la tarjeta y el esquema lo conservan tal cual.
      for (const url of ['https://x.com/a.png', 'http://x/a', 'https://u:p@h/', 'https://x.com/%20a', ' https://x.com/b.png ']) {
        expect(isValidMediaUrl(url)).toBe(true);
        expect(parseCustomerDisplaySettings({ idle: { mediaUrls: [url] } }).idle.mediaUrls).toEqual([url.trim()]);
      }
      // No lanza con entradas que no son cadenas ni con basura.
      for (const junk of [null, undefined, 7, {}, [], 'javascript:alert(1)', 'https://', '']) {
        expect(isValidMediaUrl(junk)).toBe(false);
      }
      // Y sigue usándose en el esquema (no hay una segunda definición).
      const src = readSettingsSource();
      expect(src).toMatch(/const mediaUrlSchema = z\.string\(\)\.trim\(\)\.refine\(isValidMediaUrl/);
      expect(src).not.toMatch(/^\s*\.url\(\)/m); // ya no hay una segunda comprobación (`.url()` encadenada) fuera del predicado
    });

    it('ronda 3: MEDIA_URL_PATTERN es la ÚNICA definición (la tarjeta la importa) y coincide con lo que el esquema deja pasar', () => {
      expect(MEDIA_URL_PATTERN.test('https://x.com/a b')).toBe(false);
      expect(MEDIA_URL_PATTERN.test('https://a.com\nhttps://b.com')).toBe(false);
      expect(MEDIA_URL_PATTERN.test('HTTPS://X.COM/a.png')).toBe(true);
      expect(MEDIA_URL_PATTERN.test('ftp://x.com/a.png')).toBe(false);
      for (const url of ['https://x.com/a.png', 'http://x/a', 'https://u:p@h/', 'https://x.com/%20a']) {
        expect(MEDIA_URL_PATTERN.test(url)).toBe(true);
        expect(parseCustomerDisplaySettings({ idle: { mediaUrls: [url] } }).idle.mediaUrls).toEqual([url]);
      }
    });
  });

  it('touch desconocido → auto; rating no objeto → apagado', () => {
    expect(parseCustomerDisplaySettings({ touch: 'stylus' }).touch).toBe('auto');
    expect(parseCustomerDisplaySettings({ touch: 'no-touch' }).touch).toBe('no-touch');
    expect(parseCustomerDisplaySettings({ rating: true }).rating).toEqual({ enabled: false });
    expect(parseCustomerDisplaySettings({ rating: { enabled: 'yes' } }).rating).toEqual({ enabled: false });
  });

  it('un campo inválido no arrastra a los demás (degradación por campo, PLAN §6.1)', () => {
    const parsed = parseCustomerDisplaySettings({
      enabled: true,
      tips: { enabled: true, presets: [1, 2] },
      rating: { enabled: true },
      showTaxBreakdown: 'si',
      showCustomerName: true,
      idle: 'brand',
      locale: 'fr',
      touch: 'maybe',
    });
    expect(parsed).toEqual({
      enabled: true,
      tips: { enabled: true, presets: [5, 10, 15], allowCustom: true },
      rating: { enabled: true },
      showTaxBreakdown: false,
      showCustomerName: true,
      idle: PLAN_DEFAULTS.idle,
      locale: 'fr',
      touch: 'auto',
    });
  });

  it('claves desconocidas no pasan al resultado', () => {
    expect(parseCustomerDisplaySettings({ enabled: true, foo: 1 })).not.toHaveProperty('foo');
  });
});

describe('settings.ts · toDisplayPresentationSettings (hello.settings)', () => {
  it('lleva propina, calificación, desglose, nombre, idioma y táctil; NO enabled ni idle', () => {
    const settings = parseCustomerDisplaySettings({ enabled: true, tips: { enabled: true, presets: [8, 12, 18] }, locale: 'en', touch: 'touch' });
    const presentation = toDisplayPresentationSettings(settings);
    expect(presentation).toEqual({
      tips: { enabled: true, presets: [8, 12, 18], allowCustom: true },
      rating: { enabled: false },
      showTaxBreakdown: false,
      showCustomerName: false,
      locale: 'en',
      touch: 'touch',
    });
    expect(presentation).not.toHaveProperty('enabled');
    expect(presentation).not.toHaveProperty('idle');
    // Copia: mutar el hello no toca la caché.
    presentation.tips.presets.push(99);
    expect(settings.tips.presets).toEqual([8, 12, 18]);
  });
});

describe('settings.ts · saveCustomerDisplaySettings (organization_settings / pos_customer_display)', () => {
  it('upsert con la misma forma que operating_hours y la fila validada completa; fija la caché', async () => {
    db.row = null;
    const saved = await saveCustomerDisplaySettings(120, { tips: { enabled: true, presets: [8, 12, 18], allowCustom: false }, locale: 'en' });
    expect(db.filters).toEqual(
      expect.arrayContaining([
        ['organization_id', 120],
        ['key', POS_CUSTOMER_DISPLAY_KEY],
      ]),
    );
    expect(db.upserts).toHaveLength(1);
    const { payload, options } = db.upserts[0];
    expect(options).toEqual({ onConflict: 'organization_id,key' });
    expect(payload.organization_id).toBe(120);
    expect(payload.key).toBe(POS_CUSTOMER_DISPLAY_KEY);
    expect(typeof payload.updated_at).toBe('string');
    expect(payload.settings).toEqual({
      ...PLAN_DEFAULTS,
      tips: { enabled: true, presets: [8, 12, 18], allowCustom: false },
      locale: 'en',
    });
    expect(saved).toEqual(payload.settings);
    expect(hasCustomerDisplaySettingsCache(120)).toBe(true);
    expect(getCachedCustomerDisplaySettings(120)).toEqual(saved);
  });

  it('conserva lo que la fila ya tenía y no viene en el parche (enabled, rating…) y las claves desconocidas', async () => {
    db.row = { settings: { enabled: true, rating: { enabled: true }, foo: 'bar' } };
    const saved = await saveCustomerDisplaySettings(120, { showTaxBreakdown: true });
    expect(saved.enabled).toBe(true);
    expect(saved.rating).toEqual({ enabled: true });
    expect(saved.showTaxBreakdown).toBe(true);
    expect((db.upserts[0].payload.settings as Record<string, unknown>).foo).toBe('bar');
  });

  it('el parche se valida ANTES del upsert: presets fuera de rango se escriben como 5/10/15', async () => {
    const saved = await saveCustomerDisplaySettings(120, { tips: { enabled: true, presets: [0, 10, 500], allowCustom: true } });
    expect(saved.tips.presets).toEqual([5, 10, 15]);
    expect((db.upserts[0].payload.settings as { tips: { presets: number[] } }).tips.presets).toEqual([5, 10, 15]);
  });

  it('claves undefined del parche se ignoran (conservan la fila)', async () => {
    db.row = { settings: { enabled: true } };
    const saved = await saveCustomerDisplaySettings(120, { enabled: undefined, showCustomerName: true });
    expect(saved.enabled).toBe(true);
    expect(saved.showCustomerName).toBe(true);
  });

  it('si la lectura previa falla, lanza y NO hace upsert ni toca la caché', async () => {
    db.readError = { message: 'sin red' };
    await expect(saveCustomerDisplaySettings(120, { enabled: true })).rejects.toBeDefined();
    expect(db.upserts).toHaveLength(0);
    expect(hasCustomerDisplaySettingsCache(120)).toBe(false);
  });

  it('si el upsert falla, lanza y la caché no se fija con lo no guardado', async () => {
    db.upsertError = { message: 'RLS' };
    await expect(saveCustomerDisplaySettings(120, { enabled: true })).rejects.toBeDefined();
    expect(hasCustomerDisplaySettingsCache(120)).toBe(false);
  });

  it('organización inválida: lanza sin consultar', async () => {
    await expect(saveCustomerDisplaySettings(0, { enabled: true })).rejects.toThrow();
    await expect(saveCustomerDisplaySettings(Number.NaN, { enabled: true })).rejects.toThrow();
    expect(db.upserts).toHaveLength(0);
  });
});
