/**
 * Fase 3, parte C: emparejar y revocar desde la caja.
 *
 * 1. remotePairing.ts (puro): formato del código, cuenta atrás, URL para la
 *    tableta (nunca un origen de bucle local), antigüedad del latido remoto.
 * 2. PosTerminalsService.requestPairingCode / revokeRemoteDisplay: rutas de
 *    la parte A, sesión en cookies, organización SOLO en la cabecera, nunca
 *    en el body; errores esperables tipados (403, 404, 409, ORG_*).
 * 3. Cableado de la caja (posDisplay.ts): el transporte abre el canal
 *    compuesto con la comprobación de terminal registrada; el cliente
 *    Realtime solo si `supabase.channel` existe.
 * 4. i18n: namespace `posCustomerDisplay.pairing` en los cuatro idiomas,
 *    misma forma, sin vacíos; cada clave literal de los componentes nuevos
 *    existe; sin textos cableados en JSX.
 */

import * as fs from 'fs';
import * as path from 'path';
import { formatCountdown, formatPairingCode, minutesSinceRemoteSeen, pairingRemainingMs, resolvePairingUrl, REMOTE_SEEN_RECENT_MINUTES } from '@/lib/pos/display/remotePairing';

// ---------------------------------------------------------------------------
// Dobles: Supabase (solo `from`, sin `channel`), sesión y fetch
// ---------------------------------------------------------------------------

const db: { terminalRow: unknown } = { terminalRow: null };
jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        maybeSingle: async () => ({ data: db.terminalRow, error: null }),
        single: async () => ({ data: db.terminalRow, error: null }),
      };
      return chain;
    },
  },
}));

const ctx = { orgId: 120 };
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => ctx.orgId,
  getCurrentBranchId: () => 7,
}));

interface ApiCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}
const api: { calls: ApiCall[]; response: { status: number; body: unknown } | Error } = { calls: [], response: { status: 200, body: {} } };
const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    api.calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: (init?.headers as Record<string, string>) ?? {},
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
    });
    if (api.response instanceof Error) throw api.response;
    const { status, body } = api.response;
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});
beforeEach(() => {
  api.calls = [];
  api.response = { status: 200, body: {} };
  ctx.orgId = 120;
});

import {
  PosTerminalsApiError,
  PosTerminalsService,
  isForbiddenError,
  isOrgMismatchError,
  isTerminalInactiveError,
  isTerminalNotFoundError,
} from '@/lib/services/posTerminalsService';

const T1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

// ---------------------------------------------------------------------------
// 1. Helpers puros
// ---------------------------------------------------------------------------

describe('remotePairing · helpers', () => {
  it('formatPairingCode: «123456» → «123 456»; otra forma se devuelve tal cual', () => {
    expect(formatPairingCode('123456')).toBe('123 456');
    expect(formatPairingCode('12345')).toBe('12345');
    expect(formatPairingCode('')).toBe('');
  });

  it('pairingRemainingMs: lo que queda hasta expiresAt, nunca negativo, 0 con fecha ilegible', () => {
    const now = Date.parse('2026-09-22T10:00:00.000Z');
    expect(pairingRemainingMs('2026-09-22T10:05:00.000Z', now)).toBe(300_000);
    expect(pairingRemainingMs('2026-09-22T09:59:59.000Z', now)).toBe(0);
    expect(pairingRemainingMs('no-es-fecha', now)).toBe(0);
    expect(pairingRemainingMs(null, now)).toBe(0);
    expect(pairingRemainingMs(undefined, now)).toBe(0);
  });

  it('formatCountdown: m:ss redondeando hacia arriba', () => {
    expect(formatCountdown(300_000)).toBe('5:00');
    expect(formatCountdown(299_400)).toBe('5:00');
    expect(formatCountdown(61_000)).toBe('1:01');
    expect(formatCountdown(400)).toBe('0:01');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-5)).toBe('0:00');
  });

  it('resolvePairingUrl: origen público tal cual + /pos-display; bucle local → origen público del entorno; sin nada → solo la ruta', () => {
    expect(resolvePairingUrl('https://app.example.test', undefined)).toBe('https://app.example.test/pos-display');
    expect(resolvePairingUrl('https://app.example.test/app/pos?x=1', undefined)).toBe('https://app.example.test/pos-display');
    expect(resolvePairingUrl('http://localhost:3000', 'https://erp.example.test')).toBe('https://erp.example.test/pos-display');
    expect(resolvePairingUrl('http://127.0.0.1:47800', 'https://erp.example.test/')).toBe('https://erp.example.test/pos-display');
    expect(resolvePairingUrl('http://127.0.0.1:47800', 'http://localhost:3000')).toBe('/pos-display');
    expect(resolvePairingUrl(null, null)).toBe('/pos-display');
    expect(resolvePairingUrl('file:///C:/app', 'javascript:alert(1)')).toBe('/pos-display');
    expect(resolvePairingUrl('no es url', undefined)).toBe('/pos-display');
  });

  it('minutesSinceRemoteSeen: minutos enteros, 0 = hace menos de un minuto, null sin valor; el umbral «reciente» es 3 min', () => {
    const now = Date.parse('2026-09-22T10:10:00.000Z');
    expect(minutesSinceRemoteSeen('2026-09-22T10:09:30.000Z', now)).toBe(0);
    expect(minutesSinceRemoteSeen('2026-09-22T10:07:59.000Z', now)).toBe(2);
    expect(minutesSinceRemoteSeen('2026-09-22T10:11:00.000Z', now)).toBe(0); // reloj adelantado: nunca negativo
    expect(minutesSinceRemoteSeen(null, now)).toBeNull();
    expect(minutesSinceRemoteSeen('basura', now)).toBeNull();
    expect(REMOTE_SEEN_RECENT_MINUTES).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 2. Servicio
// ---------------------------------------------------------------------------

describe('PosTerminalsService.requestPairingCode', () => {
  it('POST /api/pos/terminals/[id]/pairing-code con X-Organization-Id y body vacío (la organización NUNCA va en el body); devuelve code y expiresAt', async () => {
    api.response = { status: 200, body: { data: { terminalId: T1, code: '482913', expiresAt: '2026-09-22T10:05:00.000Z' } } };
    const issue = await PosTerminalsService.requestPairingCode(T1);
    expect(issue).toEqual({ terminalId: T1, code: '482913', expiresAt: '2026-09-22T10:05:00.000Z' });
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0].url).toBe(`/api/pos/terminals/${T1}/pairing-code`);
    expect(api.calls[0].method).toBe('POST');
    expect(api.calls[0].headers['X-Organization-Id']).toBe('120');
    expect(api.calls[0].body).toEqual({});
    expect(Object.keys(api.calls[0].body)).not.toContain('organization_id');
  });

  it('id que no es UUID → lanza sin llamar a la ruta; sin organización en sesión → lanza antes de fetch', async () => {
    await expect(PosTerminalsService.requestPairingCode('caja-1')).rejects.toThrow('id de terminal inválido');
    ctx.orgId = 0;
    await expect(PosTerminalsService.requestPairingCode(T1)).rejects.toThrow('organización inválida');
    expect(api.calls).toHaveLength(0);
  });

  it('403 ADMIN_REQUIRED → isForbiddenError; 404 NOT_FOUND → isTerminalNotFoundError; 409 TERMINAL_INACTIVE → isTerminalInactiveError; 403 FOREIGN_ORGANIZATION → isOrgMismatchError', async () => {
    const cases: Array<[number, string, (e: unknown) => boolean]> = [
      [403, 'ADMIN_REQUIRED', isForbiddenError],
      [404, 'NOT_FOUND', isTerminalNotFoundError],
      [409, 'TERMINAL_INACTIVE', isTerminalInactiveError],
      [403, 'FOREIGN_ORGANIZATION', isOrgMismatchError],
    ];
    for (const [status, code, predicate] of cases) {
      api.response = { status, body: { error: 'x', code } };
      let err: unknown;
      try {
        await PosTerminalsService.requestPairingCode(T1);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(PosTerminalsApiError);
      expect((err as PosTerminalsApiError).code).toBe(code);
      expect(predicate(err)).toBe(true);
      // Los predicados no se pisan entre sí.
      for (const [, otherCode, other] of cases) if (other !== predicate && otherCode !== code) expect(other(err)).toBe(false);
    }
  });

  it('200 sin data → EMPTY_RESPONSE; red caída → el TypeError se propaga tal cual', async () => {
    api.response = { status: 200, body: { data: null } };
    await expect(PosTerminalsService.requestPairingCode(T1)).rejects.toMatchObject({ code: 'EMPTY_RESPONSE' });
    api.response = new TypeError('Failed to fetch');
    await expect(PosTerminalsService.requestPairingCode(T1)).rejects.toThrow('Failed to fetch');
  });
});

describe('PosTerminalsService.revokeRemoteDisplay', () => {
  it('POST /api/pos/display/revoke con { terminalId } y X-Organization-Id; devuelve revoked', async () => {
    api.response = { status: 200, body: { data: { terminalId: T1, revoked: true } } };
    expect(await PosTerminalsService.revokeRemoteDisplay(T1)).toEqual({ terminalId: T1, revoked: true });
    expect(api.calls[0]).toMatchObject({ url: '/api/pos/display/revoke', method: 'POST', body: { terminalId: T1 } });
    expect(api.calls[0].headers['X-Organization-Id']).toBe('120');
    expect(Object.keys(api.calls[0].body)).toEqual(['terminalId']);
  });

  it('403 ADMIN_REQUIRED → isForbiddenError; 404 → isTerminalNotFoundError; id inválido no llama', async () => {
    api.response = { status: 403, body: { code: 'ADMIN_REQUIRED', error: 'no' } };
    let err: unknown;
    try {
      await PosTerminalsService.revokeRemoteDisplay(T1);
    } catch (e) {
      err = e;
    }
    expect(isForbiddenError(err)).toBe(true);
    api.response = { status: 404, body: { code: 'NOT_FOUND', error: 'no' } };
    try {
      await PosTerminalsService.revokeRemoteDisplay(T1);
    } catch (e) {
      err = e;
    }
    expect(isTerminalNotFoundError(err)).toBe(true);
    await expect(PosTerminalsService.revokeRemoteDisplay('x')).rejects.toThrow('id de terminal inválido');
    expect(api.calls).toHaveLength(2);
  });

  it('el servicio sigue sin tocar pos_terminal_secrets desde el navegador', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../../src/lib/services/posTerminalsService.ts'), 'utf8');
    expect(src).not.toMatch(/from\('pos_terminal_secrets'\)/);
    expect(src).toMatch(/fetch\(`\/api\/pos\/terminals\/\$\{encodeURIComponent\(id\)\}`/);
  });
});

// ---------------------------------------------------------------------------
// 3. Cableado de la caja
// ---------------------------------------------------------------------------

describe('posDisplay.ts · cableado del canal compuesto', () => {
  const root = path.resolve(__dirname, '../../..');
  const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

  it('el transporte del navegador abre createCajaDisplayChannel con la pata local (relay o BroadcastChannel), el cliente Realtime de la sesión y la comprobación de terminal registrada', () => {
    const src = read('src/lib/pos/display/posDisplay.ts');
    expect(src).toMatch(/new BroadcastChannelTransport\(\{/);
    expect(src).toMatch(/createCajaDisplayChannel\(terminalId, \{/);
    expect(src).toMatch(/local: resolveDisplayChannelFactory\(\) \?\? createBroadcastDisplayChannel/);
    // F3-C ronda 4 · C1: la guarda circular `isRegisteredActiveTerminal` (leía el id de
    // localStorage con `getLinkedTerminal` y lo comparaba con otro id de localStorage) se
    // borró. Ahora la caja exige estar VINCULADA a esa terminal y que la fila exista ACTIVA
    // según el SERVIDOR, leída por su id exacto con el cliente de la sesión (RLS).
    expect(src).toMatch(/isRegisteredTerminal: terminalVinculadaYVerificada/);
    expect(src).not.toMatch(/await PosTerminalsService\.getLinkedTerminal\(\)/);
    expect(src).toMatch(/PosTerminalsService\.getTerminalById\(terminalId\)/);
    expect(src).toMatch(/row === null \|\| row\.is_active !== true \|\| row\.id !== terminalId/);
    // El cliente Realtime solo si el módulo lo expone (los dobles solo traen `from`).
    expect(src).toMatch(/typeof candidate\.channel === 'function'/);
  });

  it('cajaChannel.ts usa el canal de Supabase de la parte B (regla 7: nada de un segundo canal Realtime) y lo envuelve en la compuerta de oyente', () => {
    const src = read('src/lib/pos/display/cajaChannel.ts');
    expect(src).toMatch(/supabaseTransportChannelFactory\(\{ client: deps\.realtime, onStatus: deps\.onRemoteStatus \}\)\(terminalId\)/);
    // La compuerta envuelve el canal de la parte B (con el seguimiento de su salida, ronda 2 · 5),
    // y la gobierna el criterio del transporte: `UpMessage` válido de ESTA terminal (ronda 2 · 3).
    expect(src).toMatch(/createListenerGatedChannel\(conSeguimientoDeSalida\(topic, remote\)/);
    // F3-C ronda 4 · 4: la compuerta recibe también la instancia del transporte,
    // para aplicar el MISMO filtro que `receive` (incluido `toInstanceId`).
    expect(src).toMatch(/gate: upMessageListenerGate\(terminalId, deps\.instanceId\)/);
    expect(src).not.toMatch(/\.channel\(/);
    // Solo Broadcast: ninguna suscripción a cambios de tablas ni escritura por mensaje.
    for (const f of ['src/lib/pos/display/cajaChannel.ts', 'src/lib/pos/display/multiChannel.ts', 'src/lib/pos/display/posDisplay.ts']) {
      expect(read(f)).not.toMatch(/postgres_changes/);
    }
  });

  it('con el doble de Supabase sin `channel`, arrancar la caja no intenta nada remoto (integración: startPosDisplay)', async () => {
    // El transporte del navegador exige `window`; aquí no lo hay: solo se comprueba que el módulo carga y el emisor existe.
    const posDisplay = await import('@/lib/pos/display/posDisplay');
    expect(posDisplay.getPosDisplayEmitter().isEmitting).toBe(false);
    expect(posDisplay.getPosDisplayEnvironment().transportSupported).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. i18n y componentes
// ---------------------------------------------------------------------------

describe('i18n · posCustomerDisplay.pairing y componentes de la parte C', () => {
  const root = path.resolve(__dirname, '../../..');
  const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
  const locales = ['es', 'en', 'fr', 'pt'] as const;
  const messages = Object.fromEntries(
    locales.map((l) => [l, JSON.parse(read(`messages/${l}.json`)) as { posCustomerDisplay: Record<string, Record<string, string>> }]),
  ) as Record<(typeof locales)[number], { posCustomerDisplay: Record<string, Record<string, string>> }>;

  it('el namespace pairing existe en los cuatro idiomas con las mismas claves, todas planas y sin vacíos; es ≠ en', () => {
    const es = messages.es.posCustomerDisplay.pairing;
    expect(Object.keys(es).length).toBeGreaterThanOrEqual(30);
    for (const loc of locales) {
      const ns = messages[loc].posCustomerDisplay.pairing;
      expect(Object.keys(ns).sort()).toEqual(Object.keys(es).sort());
      for (const [k, v] of Object.entries(ns)) {
        expect({ loc, k, tipo: typeof v }).toEqual({ loc, k, tipo: 'string' });
        expect({ loc, k, vacio: v.trim() === '' }).toEqual({ loc, k, vacio: false });
      }
    }
    for (const k of Object.keys(es)) expect({ k, igual: es[k] === messages.en.posCustomerDisplay.pairing[k] }).toEqual({ k, igual: false });
    // Marcadores ICU iguales clave a clave.
    const ph = (s: string) => (s.match(/\{[a-zA-Z_]+\}/g) ?? []).sort();
    for (const loc of locales) for (const k of Object.keys(es)) expect({ loc, k, ph: ph(messages[loc].posCustomerDisplay.pairing[k]) }).toEqual({ loc, k, ph: ph(es[k]) });
    expect(es.expiresIn).toContain('{time}');
    expect(es.step1).toContain('{url}');
    expect(es.lastSeenMinutes).toContain('{minutes}');
  });

  it('cada clave literal t(\'…\') de los componentes nuevos existe en las cuatro locales', () => {
    const files: Array<[string, string]> = [
      ['src/components/pos/display/PairingCodeDialog.tsx', 'posCustomerDisplay.pairing'],
      ['src/components/pos/display/RevokeRemoteDisplayDialog.tsx', 'posCustomerDisplay.pairing'],
      ['src/components/pos/configuracion/pantalla-cliente/DispositivoRemotoSection.tsx', 'posCustomerDisplay.pairing'],
      ['src/components/pos/display/CustomerDisplayIndicator.tsx', 'posCustomerDisplay'],
    ];
    const get = (o: unknown, p: string): unknown => p.split('.').reduce<unknown>((a, k) => (typeof a === 'object' && a !== null ? (a as Record<string, unknown>)[k] : undefined), o);
    const used: string[] = [];
    for (const [rel, ns] of files) {
      const src = read(rel);
      for (const m of src.matchAll(/\bt\(\s*'([A-Za-z0-9_.]+)'/g)) used.push(`${ns}.${m[1]}`);
    }
    // Claves elegidas en runtime (mapa de errores del diálogo y etiqueta de origen del indicador).
    for (const k of ['forbidden', 'notFound', 'inactive', 'orgChanged', 'requestError']) used.push(`posCustomerDisplay.pairing.${k}`);
    for (const k of ['originLocal', 'originRemote', 'originBoth', 'connectedWithOrigin']) used.push(`posCustomerDisplay.indicator.${k}`);
    expect(used.length).toBeGreaterThan(25);
    for (const loc of locales) {
      for (const key of used) expect({ loc, key, exists: typeof get(messages[loc], key) === 'string' }).toEqual({ loc, key, exists: true });
    }
  });

  it('los componentes nuevos no traen textos cableados en JSX y usan los servicios, no la tabla', () => {
    for (const rel of [
      'src/components/pos/display/PairingCodeDialog.tsx',
      'src/components/pos/display/RevokeRemoteDisplayDialog.tsx',
      'src/components/pos/configuracion/pantalla-cliente/DispositivoRemotoSection.tsx',
    ]) {
      const src = read(rel);
      const jsx = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      const hardcoded = [...jsx.matchAll(/>\s*([A-Za-zÁÉÍÓÚáéíóúñÑ][^<{}]{3,})</g)].map((m) => m[1].trim());
      expect({ rel, hardcoded }).toEqual({ rel, hardcoded: [] });
      expect(jsx).not.toMatch(/supabase\s*\.from\(/);
      expect(jsx).not.toMatch(/pos_terminal_secrets/); // solo en comentarios: el navegador nunca toca la tabla
    }
    const dialog = read('src/components/pos/display/PairingCodeDialog.tsx');
    // Ronda 4 · 5: al abrirse pide el código vigente (`{ reuse: true }`) en vez de quemarlo.
    expect(dialog).toMatch(/PosTerminalsService\.requestPairingCode\(terminalId, options\)/);
    expect(dialog).toMatch(/void request\(\{ reuse: true \}\)/);
    expect(dialog).toMatch(/formatPairingCode\(issue\.code\)/);
    expect(dialog).toMatch(/formatCountdown\(remainingMs\)/);
    const revoke = read('src/components/pos/display/RevokeRemoteDisplayDialog.tsx');
    expect(revoke).toMatch(/PosTerminalsService\.revokeRemoteDisplay\(terminalId\)/);
    const card = read('src/components/pos/configuracion/pantalla-cliente/PantallaClienteContent.tsx');
    expect(card).toMatch(/<DispositivoRemotoSection \/>/);
    const section = read('src/components/pos/configuracion/pantalla-cliente/DispositivoRemotoSection.tsx');
    expect(section).toMatch(/terminal\.is_active && terminal\.id === localId/);
  });
});
