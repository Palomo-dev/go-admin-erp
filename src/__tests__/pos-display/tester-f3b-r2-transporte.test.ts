/**
 * TESTER · Fase 3, parte B, ronda 2 — transporte remoto y emparejamiento.
 * Sondas de SEGURIDAD sobre el canal de Supabase y sobre la lógica de
 * emparejamiento: canal de otra terminal, sobres de otra instancia, seq no
 * creciente, evento del sentido contrario, JWT caducado y respaldo del
 * canje fallido. No arregla nada: fija lo que HOY hace el código.
 */

import { createHash } from 'node:crypto';
import {
  DISPLAY_DOWN_EVENT,
  DISPLAY_UP_EVENT,
  REMOTE_PRESENCE_INTERVAL_MS,
  REMOTE_STALE_AFTER_MS,
  SupabaseBroadcastReceiver,
  SupabaseBroadcastTransport,
  createSupabaseDisplayChannel,
  type SupabaseChannelLike,
  type SupabaseClientLike,
} from '@/lib/pos/display/supabaseBroadcastTransport';
import { PROTOCOL_VERSION, type DownMessage } from '@/lib/pos/display/protocol';
import { displayChannelName } from '@/lib/pos/display/transport';
import {
  isRemoteBootstrap,
  resolveRedeemFailure,
  resolveRemoteIntent,
  type RemoteApiFailure,
  type StoredRemoteDisplay,
} from '@/lib/pos/display/remoteDisplay';
import { createRemoteDisplayClient, jwtSecondsToExpiry } from '@/lib/pos/display/remoteDisplayClient';

const T1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const T2 = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const TOKEN = 'a'.repeat(43);

// ---------------------------------------------------------------------------
// Doble del canal de supabase-js
// ---------------------------------------------------------------------------

interface Sent {
  event: string;
  payload: unknown;
}

function makeClient() {
  const sent: Sent[] = [];
  const opened: Array<{ name: string; opts: unknown }> = [];
  const listeners = new Map<string, Array<(m: { payload?: unknown }) => void>>();
  let statusCb: ((status: string, err?: Error) => void) | null = null;
  let unsubscribed = 0;
  let removed = 0;

  const channel: SupabaseChannelLike = {
    on(_type, filter, cb) {
      const list = listeners.get(filter.event) ?? [];
      list.push(cb);
      listeners.set(filter.event, list);
      return channel;
    },
    async send(args) {
      sent.push({ event: args.event, payload: args.payload });
      return 'ok';
    },
    subscribe(cb) {
      statusCb = cb ?? null;
      return channel;
    },
    async unsubscribe() {
      unsubscribed += 1;
      return 'ok';
    },
  };

  const client: SupabaseClientLike = {
    channel(name, opts) {
      opened.push({ name, opts });
      return channel;
    },
    async removeChannel() {
      removed += 1;
      return 'ok';
    },
  };

  return {
    client,
    sent,
    opened,
    join: () => statusCb?.('SUBSCRIBED'),
    status: (s: string, err?: Error) => statusCb?.(s, err),
    /** Entrega un mensaje por el evento indicado, como haría el servidor. */
    deliver: (event: string, payload: unknown) => {
      for (const cb of listeners.get(event) ?? []) cb({ payload });
    },
    get unsubscribed() {
      return unsubscribed;
    },
    get removed() {
      return removed;
    },
  };
}

function down(overrides: Record<string, unknown>): Record<string, unknown> {
  return { v: PROTOCOL_VERSION, terminalId: T1, instanceId: 'i-caja', seq: 1, ...overrides };
}

describe('canal remoto: apertura y sentido', () => {
  it('se abre SIEMPRE privado, sin self y sin ack, con el nombre de la terminal', () => {
    const h = makeClient();
    createSupabaseDisplayChannel(h.client, T1, { sendEvent: DISPLAY_UP_EVENT, listenEvent: DISPLAY_DOWN_EVENT });
    expect(h.opened).toHaveLength(1);
    expect(h.opened[0].name).toBe(displayChannelName(T1));
    expect(h.opened[0].opts).toEqual({ config: { private: true, broadcast: { self: false, ack: false } } });
  });

  it('la pantalla publica en `up` y solo escucha `down`: un `up` ajeno no le llega', () => {
    const h = makeClient();
    const rx = new SupabaseBroadcastReceiver({ terminalId: T1, client: h.client });
    const seen: DownMessage[] = [];
    rx.onDown((m) => seen.push(m));
    h.join();
    rx.send({ t: 'display_alive', at: 1, capabilities: { touch: false, width: 1, height: 1 } });
    expect(h.sent.map((s) => s.event)).toEqual([DISPLAY_UP_EVENT]);
    // El servidor reenvía por `up` un sobre que parece un `down` (otra pantalla comprometida).
    h.deliver(DISPLAY_UP_EVENT, down({ t: 'state', state: { mode: 'idle' } }));
    expect(seen).toHaveLength(0);
    rx.close(false);
  });

  it('la caja publica en `down` y escucha `up`', () => {
    const h = makeClient();
    const tx = new SupabaseBroadcastTransport({ terminalId: T1, client: h.client });
    h.join();
    tx.publish({ t: 'state', state: { mode: 'idle' } } as never);
    expect(h.sent.map((s) => s.event)).toEqual([DISPLAY_DOWN_EVENT]);
    tx.close();
  });
});

describe('descarte de sobres en el canal remoto', () => {
  function armar() {
    const h = makeClient();
    const rx = new SupabaseBroadcastReceiver({
      terminalId: T1,
      client: h.client,
      presenceIntervalMs: REMOTE_PRESENCE_INTERVAL_MS,
      staleAfterMs: REMOTE_STALE_AFTER_MS,
    });
    const seen: DownMessage[] = [];
    rx.onDown((m) => seen.push(m));
    h.join();
    return { h, rx, seen };
  }

  it('sobre de OTRA terminal en el mismo canal: se descarta', () => {
    const { h, rx, seen } = armar();
    h.deliver(DISPLAY_DOWN_EVENT, down({ t: 'hello', terminalId: T2, organizationId: 1, cashier: null, sessionOpen: false }));
    expect(seen).toHaveLength(0);
    expect(rx.activeInstanceId).toBeNull();
    rx.close(false);
  });

  it('tras adoptar una instancia, los sobres de OTRA instancia que no son hello se descartan', () => {
    const { h, rx, seen } = armar();
    h.deliver(DISPLAY_DOWN_EVENT, down({ t: 'hello', instanceId: 'i-buena', seq: 1, organizationId: 1, cashier: null, sessionOpen: false }));
    expect(rx.activeInstanceId).toBe('i-buena');
    h.deliver(DISPLAY_DOWN_EVENT, down({ t: 'state', instanceId: 'i-mala', seq: 99, state: { mode: 'idle' } }));
    expect(seen.map((m) => m.t)).toEqual(['hello']);
    expect(rx.activeInstanceId).toBe('i-buena');
    rx.close(false);
  });

  it('seq repetido o menor de la MISMA instancia: se descarta (reinyección)', () => {
    const { h, rx, seen } = armar();
    h.deliver(DISPLAY_DOWN_EVENT, down({ t: 'hello', seq: 5, organizationId: 1, cashier: null, sessionOpen: false }));
    h.deliver(DISPLAY_DOWN_EVENT, down({ t: 'state', seq: 5, state: { mode: 'idle' } }));
    h.deliver(DISPLAY_DOWN_EVENT, down({ t: 'state', seq: 4, state: { mode: 'idle' } }));
    expect(seen.map((m) => m.t)).toEqual(['hello']);
    rx.close(false);
  });

  it('sobre de otra VERSIÓN del protocolo: no se entrega y se anota', () => {
    const { h, rx, seen } = armar();
    h.deliver(DISPLAY_DOWN_EVENT, { ...down({ t: 'hello', organizationId: 1, cashier: null, sessionOpen: false }), v: PROTOCOL_VERSION + 1 });
    expect(seen).toHaveLength(0);
    expect(rx.incompatibleVersionCount).toBe(1);
    rx.close(false);
  });

  it('basura (no objeto, sin sobre) no rompe nada', () => {
    const { h, rx, seen } = armar();
    for (const basura of [null, undefined, 'x', 42, [], { t: 'state' }]) h.deliver(DISPLAY_DOWN_EVENT, basura);
    expect(seen).toHaveLength(0);
    rx.close(false);
  });
});

describe('ritmo remoto y despedida', () => {
  it('la presencia remota late a 5 s, no a 1 s, y el umbral de silencio es 15 s', () => {
    expect(REMOTE_PRESENCE_INTERVAL_MS).toBe(5_000);
    expect(REMOTE_STALE_AFTER_MS).toBe(15_000);
  });

  it('close(true) manda display_bye ANTES de salir del canal', () => {
    const h = makeClient();
    const rx = new SupabaseBroadcastReceiver({ terminalId: T1, client: h.client });
    h.join();
    rx.close(true);
    const tipos = h.sent.map((s) => (s.payload as { t: string }).t);
    expect(tipos).toContain('display_bye');
    expect(h.unsubscribed).toBe(1);
  });

  it('cerrar ANTES del join descarta la cola: el display_bye NUNCA sale (riesgo aceptado, F3-B §4)', () => {
    const h = makeClient();
    const rx = new SupabaseBroadcastReceiver({ terminalId: T1, client: h.client });
    rx.close(true); // sin join
    expect(h.sent).toHaveLength(0);
    h.join();
    expect(h.sent).toHaveLength(0);
  });

  it('lo publicado antes del join sale EN ORDEN al unirse', () => {
    const h = makeClient();
    const tx = new SupabaseBroadcastTransport({ terminalId: T1, client: h.client });
    tx.publish({ t: 'hello', organizationId: 1, cashier: null, sessionOpen: false } as never);
    tx.publish({ t: 'state', state: { mode: 'idle' } } as never);
    expect(h.sent).toHaveLength(0);
    h.join();
    expect(h.sent.map((s) => (s.payload as { t: string }).t)).toEqual(['hello', 'state']);
    tx.close();
  });
});

describe('bootstrap: coherencia canal ↔ terminal', () => {
  const base = {
    terminal: { id: T1, name: 'Caja 1', code: 'C1', branchId: 7 },
    brand: { organizationId: 120, name: '', logoUrl: null, primaryColor: null, secondaryColor: null, timezone: 'America/Bogota' },
    settings: {},
    locale: 'es',
    currency: 'COP',
    realtime: { channel: displayChannelName(T1), token: 'x.y.z', expiresAt: '2026-01-01T00:00:00.000Z' },
  };

  it('acepta el bootstrap coherente', () => {
    expect(isRemoteBootstrap(base)).toBe(true);
  });

  it('RECHAZA un canal de otra terminal', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(isRemoteBootstrap({ ...base, realtime: { ...base.realtime, channel: displayChannelName(T2) } })).toBe(false);
    warn.mockRestore();
  });

  it('RECHAZA un canal con otro prefijo aunque lleve el uuid correcto', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(isRemoteBootstrap({ ...base, realtime: { ...base.realtime, channel: `otro:${T1}` } })).toBe(false);
    warn.mockRestore();
  });
});

describe('intención de arranque y respaldo del canje fallido', () => {
  // sha256 de '654321' y de '111111': el código con el que se emparejó esta
  // pantalla y otro cualquiera (ronda 3 · 2).
  const HUELLA_GUARDADA = createHash('sha256').update('654321', 'utf8').digest('hex');
  const HUELLA_OTRA = createHash('sha256').update('111111', 'utf8').digest('hex');
  const guardado: StoredRemoteDisplay = { v: 1, token: TOKEN, terminalId: T2, pairedAt: '2026-09-20T00:00:00.000Z', codeHash: HUELLA_GUARDADA };

  it('?pair con seis dígitos exactos canjea; cualquier otra cosa va al campo', () => {
    expect(resolveRemoteIntent('?pair=123456', null)).toEqual({ kind: 'pair', code: '123456', fallback: null });
    expect(resolveRemoteIntent('?pair=1234567', null)).toEqual({ kind: 'ask_code', prefill: '123456' });
    expect(resolveRemoteIntent('?pair=abc-123456', null)).toEqual({ kind: 'ask_code', prefill: '123456' });
    expect(resolveRemoteIntent('?pair=12%2034%2056', null)).toEqual({ kind: 'ask_code', prefill: '123456' });
    expect(resolveRemoteIntent('', null)).toEqual({ kind: 'local' });
  });

  it('sin ?pair y con token guardado: remoto', () => {
    expect(resolveRemoteIntent('', guardado)).toEqual({ kind: 'remote', stored: guardado });
  });

  /**
   * CORREGIDO en la ronda 3 · 2 (este test fijaba el defecto y ahora fija la
   * conducta nueva). El respaldo exige que el código que falló sea EL MISMO
   * con el que se obtuvo el emparejamiento guardado: con el código de otra
   * caja ya no se arranca en silencio contra la anterior. Y un 429 nunca
   * lleva al respaldo (ronda 3 · 4).
   */
  it('el respaldo solo se aplica si el código que falló es el del emparejamiento guardado', () => {
    const fallos: RemoteApiFailure[] = [
      { ok: false, kind: 'http', status: 404, code: 'CODE_INVALID', retryAfterSeconds: null },
      { ok: false, kind: 'network', message: 'offline' },
    ];
    for (const f of fallos) {
      // Mismo código (el quiosco reintentando el suyo): se sigue con lo guardado.
      expect(resolveRedeemFailure(f, guardado, HUELLA_GUARDADA)).toEqual({ kind: 'fallback', stored: guardado });
      // Otro código (reapuntar la tableta a otra caja): se muestra el error.
      expect(resolveRedeemFailure(f, guardado, HUELLA_OTRA)).toEqual({ kind: 'ask_code', failure: f });
      // Sin huella calculable (sin crypto.subtle): tampoco hay respaldo.
      expect(resolveRedeemFailure(f, guardado, null)).toEqual({ kind: 'ask_code', failure: f });
    }
    const limitado: RemoteApiFailure = { ok: false, kind: 'http', status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 60 };
    // Ronda 4 · B3: la huella es la única condición, también con un 429 (con
    // el código propio es el quiosco que rearranca y agotó el cubo de /pair).
    expect(resolveRedeemFailure(limitado, guardado, HUELLA_GUARDADA)).toEqual({ kind: 'fallback', stored: guardado });
    expect(resolveRedeemFailure(limitado, guardado, HUELLA_OTRA)).toEqual({ kind: 'ask_code', failure: limitado });
    expect(resolveRedeemFailure(fallos[0], null, HUELLA_GUARDADA)).toEqual({ kind: 'ask_code', failure: fallos[0] });
  });

  it('el emparejamiento guardado recuerda con qué código se obtuvo (sha256), que es lo que distingue el quiosco de un cambio de caja', () => {
    expect(Object.keys(guardado).sort()).toEqual(['codeHash', 'pairedAt', 'terminalId', 'token', 'v']);
    expect(guardado.codeHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('JWT de Realtime caducado', () => {
  const jwt = (exp: number) => `aa.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.zz`;

  it('devuelve los segundos que faltan y negativo si ya venció', () => {
    const ahora = 1_800_000_000_000;
    expect(jwtSecondsToExpiry(jwt(1_800_000_300), ahora)).toBe(300);
    expect(jwtSecondsToExpiry(jwt(1_799_999_900), ahora)).toBe(-100);
  });

  it('null si no es un JWT o no trae exp', () => {
    expect(jwtSecondsToExpiry('no-es-jwt')).toBeNull();
    expect(jwtSecondsToExpiry(`aa.${Buffer.from('{}').toString('base64url')}.zz`)).toBeNull();
  });
});

describe('cliente remoto: un JWT vencido no se queda pegado como vigente', () => {
  const secreto = 'no-importa';
  const firmar = (exp: number) =>
    `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(
      JSON.stringify({ role: 'anon', aud: 'pos-display', exp }),
    ).toString('base64url')}.${Buffer.from(secreto).toString('base64url')}`;

  it('setToken con un JWT ya vencido: realtime lo rechaza y NO se conserva (ni en accessTokenValue)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const c = createRemoteDisplayClient({ url: 'https://ejemplo.supabase.co', anonKey: 'anon-de-prueba' })!;
    expect(c).not.toBeNull();
    await c.setToken(firmar(Math.floor(Date.now() / 1000) - 10));
    expect(c.token).toBeNull();
    const realtime = (c.client as unknown as { realtime?: { accessTokenValue: unknown } }).realtime;
    expect(realtime === undefined || realtime.accessTokenValue === null).toBe(true);
    await c.dispose();
    warn.mockRestore();
  });

  it('un JWT vigente se conserva y deja de ofrecerse en cuanto pasa su exp', async () => {
    const c = createRemoteDisplayClient({ url: 'https://ejemplo.supabase.co', anonKey: 'anon-de-prueba' })!;
    const exp = Math.floor(Date.now() / 1000) + 300;
    await c.setToken(firmar(exp));
    expect(c.token).not.toBeNull();
    const ahora = jest.spyOn(Date, 'now').mockReturnValue((exp + 1) * 1000);
    expect(c.token).toBeNull();
    ahora.mockRestore();
    await c.dispose();
  });
});
