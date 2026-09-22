/**
 * Fase 3, parte B — ronda 3: las correcciones del QA y del tester, cada una
 * con la prueba que impide reincidir. Sin React (el proyecto no monta
 * componentes en jest): lo que se prueba es la LÓGICA pura que los hooks y
 * las vistas llaman, más el receptor remoto con el doble del canal.
 *
 * 1. En un navegador SIN BroadcastChannel la pantalla de emparejamiento
 *    seguía siendo alcanzable (`resolveShellContent` + `offersPairing`).
 * 2. El respaldo tras un canje fallido exige que el código sea el MISMO con
 *    el que se obtuvo el emparejamiento guardado (`resolveRedeemFailure`
 *    con la huella de `pairingCodeFingerprint`).
 * 3. Con un canje en vuelo no sale otro (`resolvePairingSubmit`).
 * 4. Un 429 nunca lleva al respaldo silencioso.
 * 6. El latido forzado al despertar tiene frecuencia mínima
 *    (`shouldForceBeat`).
 * 7. El receptor remoto expone la promesa de SALIDA del canal (`leaving`),
 *    para soltar el cliente después de que el `display_bye` haya salido.
 *
 * Fixtures sin nombres de organizaciones reales (ids y descripciones).
 */

import { createHash } from 'node:crypto';
import { offersPairing, resolveShellContent, type ShellPhaseKind } from '@/components/pos-display/logic';
import { isDisplayTransportAvailable } from '@/lib/pos/display/desktopChannel';
import {
  FORCED_BEAT_MIN_INTERVAL_MS,
  pairingCodeFingerprint,
  readStoredRemoteDisplay,
  resolvePairingSubmit,
  resolveRedeemFailure,
  saveStoredRemoteDisplay,
  shouldForceBeat,
  type RemoteApiFailure,
  type RemoteTokenStorage,
  type StoredRemoteDisplay,
} from '@/lib/pos/display/remoteDisplay';
import { DISPLAY_UP_EVENT, SupabaseBroadcastReceiver } from '@/lib/pos/display/supabaseBroadcastTransport';
import { displayChannelName } from '@/lib/pos/display/transport';
import { RealtimeBus, createRealtimeDouble } from './f3b-supabaseRealtimeDouble';

const T1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const T2 = 'cccccccc-dddd-4eee-8fff-000000000000';
const TOKEN = 'D'.repeat(43);
const CODE_PROPIO = '482913';
const CODE_AJENO = '100200';
const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

const httpFailure = (status: number, code: string | null = null): RemoteApiFailure => ({ ok: false, kind: 'http', status, code, retryAfterSeconds: null });

function memoryStorage(): RemoteTokenStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

describe('F3-B ronda 3 · 1: sin BroadcastChannel la pantalla de emparejamiento sigue siendo alcanzable', () => {
  const original = (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
  afterEach(() => {
    (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = original;
  });

  /**
   * El caso del tester: una tableta vieja (iOS Safari no tuvo
   * BroadcastChannel hasta 15.4) abierta en /pos-display SIN `?pair`, sin
   * token guardado y sin caja en el equipo. Antes se pintaba «no compatible»
   * sin un solo control, aunque el camino remoto va por WebSocket y no
   * necesita BroadcastChannel para nada.
   */
  it('sin BroadcastChannel ni puente de escritorio, «no compatible» OFRECE emparejar', () => {
    delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
    expect(isDisplayTransportAvailable()).toBe(false);
    const supported = isDisplayTransportAvailable();
    const content = resolveShellContent('local', supported);
    expect(content).toBe('unsupported');
    // Con y sin `pos_terminal_id` en este equipo: el caso mixto también tiene salida.
    expect(offersPairing(content, 'local', false)).toBe(true);
    expect(offersPairing(content, 'local', true)).toBe(true);
  });

  it('con BroadcastChannel todo sigue igual: «Conectando» ofrece emparejar solo si no hay caja en este equipo', () => {
    expect(isDisplayTransportAvailable()).toBe(true);
    const content = resolveShellContent('local', true);
    expect(content).toBe('link');
    expect(offersPairing(content, 'local', false)).toBe(true);
    expect(offersPairing(content, 'local', true)).toBe(false);
  });

  it('las fases remotas no dependen del transporte local: se pintan aunque `supported` sea false', () => {
    const remotas: ShellPhaseKind[] = ['deciding', 'pairing', 'bootstrapping', 'unavailable'];
    for (const phase of remotas) {
      expect(resolveShellContent(phase, false)).toBe(phase);
      expect(offersPairing(resolveShellContent(phase, false), phase, false)).toBe(false);
    }
    // `ready` es remoto: el canal va por WebSocket y `supported` ya es true.
    expect(resolveShellContent('ready', true)).toBe('link');
    expect(offersPairing('link', 'ready', false)).toBe(false);
  });
});

describe('F3-B ronda 3 · 2 y · 4: el respaldo solo vale para el código de ESTA pantalla', () => {
  let guardado: StoredRemoteDisplay;
  let huellaPropia: string;
  let huellaAjena: string;

  beforeAll(async () => {
    huellaPropia = (await pairingCodeFingerprint(CODE_PROPIO)) as string;
    huellaAjena = (await pairingCodeFingerprint(CODE_AJENO)) as string;
    guardado = { v: 1, token: TOKEN, terminalId: T2, pairedAt: '2026-09-20T00:00:00.000Z', codeHash: huellaPropia };
  });

  it('la huella es el sha256 del código, sin guardarlo en claro', () => {
    expect(huellaPropia).toBe(sha256(CODE_PROPIO));
    expect(huellaAjena).toBe(sha256(CODE_AJENO));
    expect(huellaPropia).not.toBe(huellaAjena);
  });

  it('el emparejamiento guardado conserva la huella y se relee', () => {
    const storage = memoryStorage();
    expect(saveStoredRemoteDisplay({ token: TOKEN, terminalId: T2, pairedAt: '2026-09-20T00:00:00.000Z', codeHash: huellaPropia }, storage)).toBe(true);
    expect(readStoredRemoteDisplay(storage)).toEqual(guardado);
    // Guardado sin huella (navegador sin `crypto.subtle`): no aparece el campo.
    const sinHuella = memoryStorage();
    expect(saveStoredRemoteDisplay({ token: TOKEN, terminalId: T2, codeHash: null }, sinHuella)).toBe(true);
    expect(readStoredRemoteDisplay(sinHuella)?.codeHash).toBeUndefined();
  });

  it('una huella con forma inválida en el storage se ignora (y entonces no hay respaldo)', () => {
    const storage = memoryStorage();
    storage.setItem('pos_display_remote', JSON.stringify({ v: 1, token: TOKEN, terminalId: T2, pairedAt: '', codeHash: 'no-es-un-sha256' }));
    const leido = readStoredRemoteDisplay(storage);
    expect(leido?.codeHash).toBeUndefined();
    expect(resolveRedeemFailure(httpFailure(404), leido, huellaPropia)).toEqual({ kind: 'ask_code', failure: httpFailure(404) });
  });

  it('el MISMO código (el quiosco reintentando el suyo) sigue con el emparejamiento guardado', () => {
    for (const failure of [httpFailure(404, 'CODE_INVALID'), httpFailure(400, 'INVALID_CODE'), { ok: false, kind: 'network', message: 'sin red' } as RemoteApiFailure]) {
      expect(resolveRedeemFailure(failure, guardado, huellaPropia)).toEqual({ kind: 'fallback', stored: guardado });
    }
  });

  /**
   * El defecto de la ronda 2: reapuntar a otra caja y que el canje falle por
   * red o por el cubo global dejaba la pantalla CALLADA mostrando el carrito
   * de la caja anterior delante de los clientes de la nueva.
   */
  it('OTRO código no engancha con la caja anterior: se muestra el error del canje', () => {
    for (const failure of [httpFailure(404, 'CODE_INVALID'), { ok: false, kind: 'network', message: 'sin red' } as RemoteApiFailure]) {
      expect(resolveRedeemFailure(failure, guardado, huellaAjena)).toEqual({ kind: 'ask_code', failure });
    }
  });

  it('sin huella calculable (navegador sin crypto.subtle) tampoco hay respaldo', () => {
    const failure = httpFailure(404, 'CODE_INVALID');
    expect(resolveRedeemFailure(failure, guardado, null)).toEqual({ kind: 'ask_code', failure });
  });

  /**
   * Ronda 4 · B3: la huella pasa a ser la ÚNICA condición. La exclusión del
   * 429 que añadió esta ronda 3 dejaba fuera justo al quiosco que más la
   * necesita —el que rearranca en bucle con su código gastado agota el cubo
   * de /pair y, a partir de ahí, su emparejamiento VIVO dejaba de arrancar—,
   * y no aportaba nada a la protección: el caso que preocupa (reapuntar la
   * tableta a otra caja) ya está descartado porque ese código es otro y su
   * huella no coincide.
   */
  it('un 429 con el código PROPIO sí lleva al respaldo (ronda 4 · B3); con otro código, no', () => {
    const limitado = httpFailure(429, 'RATE_LIMITED');
    expect(resolveRedeemFailure(limitado, guardado, huellaPropia)).toEqual({ kind: 'fallback', stored: guardado });
    expect(resolveRedeemFailure(limitado, guardado, huellaAjena)).toEqual({ kind: 'ask_code', failure: limitado });
  });

  it('sin emparejamiento guardado no hay a dónde caer', () => {
    const failure = httpFailure(404, 'CODE_INVALID');
    expect(resolveRedeemFailure(failure, null, huellaPropia)).toEqual({ kind: 'ask_code', failure });
  });
});

describe('F3-B ronda 3 · 3: con un canje en vuelo no sale otro', () => {
  it('ocupado: cualquier código se ignora, también uno distinto', () => {
    expect(resolvePairingSubmit('111111', true)).toBeNull();
    expect(resolvePairingSubmit('222222', true)).toBeNull();
  });

  it('libre: se canjea el código saneado; lo que no son seis dígitos no sale', () => {
    expect(resolvePairingSubmit('482913', false)).toBe('482913');
    expect(resolvePairingSubmit('48 29 13', false)).toBe('482913');
    expect(resolvePairingSubmit('4829', false)).toBeNull();
    expect(resolvePairingSubmit('', false)).toBeNull();
    expect(resolvePairingSubmit(null, false)).toBeNull();
  });
});

describe('F3-B ronda 3 · 6: el latido forzado al despertar tiene frecuencia mínima', () => {
  it('el primero siempre sale; los siguientes esperan FORCED_BEAT_MIN_INTERVAL_MS', () => {
    expect(FORCED_BEAT_MIN_INTERVAL_MS).toBeGreaterThanOrEqual(1_000);
    expect(shouldForceBeat(null, 10_000)).toBe(true);
    expect(shouldForceBeat(10_000, 10_000 + FORCED_BEAT_MIN_INTERVAL_MS - 1)).toBe(false);
    expect(shouldForceBeat(10_000, 10_000 + FORCED_BEAT_MIN_INTERVAL_MS)).toBe(true);
  });

  it('alternar la pestaña N veces seguidas solo fuerza UN latido', () => {
    let last: number | null = null;
    let beats = 0;
    for (let i = 0; i < 10; i += 1) {
      const now = 50_000 + i * 200; // diez alternancias en dos segundos
      if (shouldForceBeat(last, now)) {
        beats += 1;
        last = now;
      }
    }
    expect(beats).toBe(1);
  });
});

describe('F3-B ronda 3 · 7: el receptor remoto expone la salida del canal', () => {
  it('`leaving` resuelve cuando el canal ya salió, después de que el display_bye se haya publicado', async () => {
    const bus = new RealtimeBus();
    const double = createRealtimeDouble({ bus });
    const receiver = new SupabaseBroadcastReceiver({ terminalId: T1, channelName: displayChannelName(T1), client: double.client });
    // Antes de cerrar, `leaving` ya está resuelta (no hay salida pendiente).
    await expect(receiver.leaving).resolves.toBeUndefined();
    await Promise.resolve();
    await Promise.resolve();

    receiver.close(true);
    await receiver.leaving;

    const byes = bus.sent.filter((s) => s.event === DISPLAY_UP_EVENT && (s.payload as { t?: string }).t === 'display_bye');
    expect(byes).toHaveLength(1);
    expect(bus.removed).toBe(1);
    expect(double.channels[0].unsubscribed).toBe(true);
  });
});
