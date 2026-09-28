/**
 * Tester · Fase 3, parte B (ronda 1) — transporte remoto y pantalla
 * emparejable. Pruebas ADVERSARIAS: se intenta romper el aislamiento del
 * canal, el sobre y el ciclo de vida del token desde el lado del cliente.
 *
 * - Sobre forjado desde la pantalla (`send` con terminalId/v/toInstanceId
 *   ajenos): el receptor lo pisa.
 * - Mensajes inyectados en el evento equivocado (`down` a la caja, `up` a la
 *   pantalla) o con payload hostil (null, array, número, __proto__): nada se
 *   entrega y nada lanza.
 * - Tras `close()`: nada entra, nada sale, un SUBSCRIBED tardío no vacía la
 *   cola ni avisa.
 * - Instancia ajena: un `state` con total falso de una instancia que no
 *   saludó se descarta; los mensajes de una terminal ajena también.
 * - `resolveRemoteIntent`: `?pair` con más de 6 dígitos YA NO se trunca
 *   (corregido en la ronda 2; el aserto de abajo quedó invertido). (se anota
 *   como comportamiento); `?pair` duplicado toma el primero.
 * - Cliente real de supabase-js (sin socket): el JWT caducado no lanza,
 *   `dispose()` es idempotente y `client.auth` no existe.
 * - Latido: un 401 tras `stop()` no llama a onRevoked; un 429 no desempareja.
 * - El token nunca viaja en la URL ni en el body; `organization_id` no sale
 *   del cliente en ninguna petición.
 *
 * Fixtures sin nombres de organizaciones reales (org 1).
 */

import type { DisplayState, DownMessage, UpMessage } from '@/lib/pos/display/protocol';
import {
  DISPLAY_DOWN_EVENT,
  DISPLAY_UP_EVENT,
  SupabaseBroadcastReceiver,
  SupabaseBroadcastTransport,
  createSupabaseDisplayChannel,
  type SupabaseChannelStatus,
} from '@/lib/pos/display/supabaseBroadcastTransport';
import {
  BOOTSTRAP_ENDPOINT,
  HEARTBEAT_ENDPOINT,
  PAIR_ENDPOINT,
  REMOTE_DISPLAY_STORAGE_KEY,
  fetchRemoteBootstrap,
  isUnauthorizedFailure,
  pairWithCode,
  readStoredRemoteDisplay,
  resolveRemoteIntent,
  saveStoredRemoteDisplay,
  sendRemoteHeartbeat,
  startRemoteHeartbeat,
  type FetchLike,
  type RemoteTokenStorage,
} from '@/lib/pos/display/remoteDisplay';
import { createRemoteDisplayClient } from '@/lib/pos/display/remoteDisplayClient';
import { RealtimeBus, createRealtimeDouble } from './f3b-supabaseRealtimeDouble';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER_TERMINAL = 'ffffffff-0000-4111-8222-333333333333';
const INSTANCE_A = '11111111-1111-4111-8111-111111111111';
const INSTANCE_B = '22222222-2222-4222-8222-222222222222';
const IDLE: DisplayState = { mode: 'idle', cart: null, payment: null, tip: null, thanks: null };
const HELLO = { t: 'hello', cashier: { name: 'Cajero' }, sessionOpen: true, organizationId: 1 } as const;
const TOKEN = 'A'.repeat(43);

async function flush(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await new Promise<void>((r) => setImmediate(r));
}

const opened: Array<{ close(): void }> = [];
function track<T extends { close(): void }>(x: T): T {
  opened.push(x);
  return x;
}
afterEach(() => {
  while (opened.length > 0) opened.pop()?.close();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function pair(bus = new RealtimeBus(), opts: { autoJoin?: boolean } = {}) {
  const cajaClient = createRealtimeDouble({ bus, autoJoin: opts.autoJoin });
  const pantallaClient = createRealtimeDouble({ bus, autoJoin: opts.autoJoin });
  const transport = track(new SupabaseBroadcastTransport({ terminalId: TERMINAL, client: cajaClient.client, __testInstanceId: INSTANCE_A, now: () => 1000 }));
  const receiver = track(new SupabaseBroadcastReceiver({ terminalId: TERMINAL, client: pantallaClient.client, now: () => 1000 }));
  return { bus, transport, receiver, cajaChannel: cajaClient.channels[0], pantallaChannel: pantallaClient.channels[0] };
}

function memoryStorage(): RemoteTokenStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe('tester F3-B r1 · sobre forjado y eventos ajenos', () => {
  it('la pantalla no puede hablar por otra terminal ni elegir destinatario: `send` pisa terminalId, v y toInstanceId del borrador', async () => {
    const { transport, receiver, bus } = pair();
    await flush();
    transport.announce(HELLO, IDLE);
    await flush();
    const ups: UpMessage[] = [];
    transport.onUp((m) => ups.push(m));

    receiver.send({ t: 'qr_paid_claim', cartId: 'c1', terminalId: OTHER_TERMINAL, v: 99, toInstanceId: INSTANCE_B } as unknown as UpMessage);
    await flush();
    const wire = bus.sent[bus.sent.length - 1];
    expect(wire.event).toBe(DISPLAY_UP_EVENT);
    expect(wire.payload).toMatchObject({ v: 1, terminalId: TERMINAL, toInstanceId: INSTANCE_A, t: 'qr_paid_claim' });
    expect(ups).toHaveLength(1);
    expect(ups[0].terminalId).toBe(TERMINAL);
  });

  it('un `down` inyectado hacia la caja y un `up` hacia la pantalla no se entregan: cada lado solo escucha su evento', async () => {
    const { transport, receiver, cajaChannel, pantallaChannel } = pair();
    await flush();
    expect(cajaChannel.listening).toEqual([DISPLAY_UP_EVENT]);
    expect(pantallaChannel.listening).toEqual([DISPLAY_DOWN_EVENT]);
    const downs: DownMessage[] = [];
    const ups: UpMessage[] = [];
    receiver.onDown((m) => downs.push(m));
    transport.onUp((m) => ups.push(m));

    // Una pantalla comprometida emite `down` con un total falso: la caja no lo oye.
    cajaChannel.inject(DISPLAY_DOWN_EVENT, { v: 1, t: 'hello', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE_B, cashier: null, sessionOpen: true, organizationId: 1 });
    // Y un `up` hacia la pantalla tampoco es de nadie.
    pantallaChannel.inject(DISPLAY_UP_EVENT, { v: 1, t: 'need_snapshot', terminalId: TERMINAL, capabilities: { touch: true, width: 1, height: 1 } });
    // Eventos desconocidos: no hay binding.
    cajaChannel.inject('presence', { x: 1 });
    pantallaChannel.inject('*', { x: 1 });
    expect(downs).toHaveLength(0);
    expect(ups).toHaveLength(0);
    expect(transport.lastDisplaySeenAt).toBeNull();
    expect(receiver.activeInstanceId).toBeNull();
  });

  it('payloads hostiles (null, array, número, __proto__, objeto sin t) no se entregan ni lanzan, y no contaminan prototipos', async () => {
    const { transport, receiver, cajaChannel, pantallaChannel } = pair();
    await flush();
    const downs: DownMessage[] = [];
    const ups: UpMessage[] = [];
    receiver.onDown((m) => downs.push(m));
    transport.onUp((m) => ups.push(m));

    const hostile: unknown[] = [null, [], 0, 'x', true, {}, { t: 'hello' }, JSON.parse('{"__proto__":{"polluted":1},"v":1,"t":"heartbeat","seq":1,"terminalId":"' + TERMINAL + '","instanceId":"' + INSTANCE_A + '","at":1}')];
    for (const payload of hostile) {
      expect(() => pantallaChannel.inject(DISPLAY_DOWN_EVENT, payload)).not.toThrow();
      expect(() => cajaChannel.inject(DISPLAY_UP_EVENT, payload)).not.toThrow();
    }
    expect(({} as { polluted?: number }).polluted).toBeUndefined();
    // El heartbeat con __proto__ propio es un mensaje válido de forma (JSON.parse no contamina): se adopta A. Los demás, fuera.
    expect(downs.map((m) => m.t)).toEqual(['heartbeat']);
    expect(ups).toHaveLength(0);
  });

  it('instancia ajena: un `state` con total falso sin hello previo se descarta; la terminal ajena, siempre', async () => {
    const { transport, receiver, pantallaChannel } = pair();
    await flush();
    transport.announce(HELLO, IDLE);
    await flush();
    const downs: DownMessage[] = [];
    receiver.onDown((m) => downs.push(m));
    const fakeState: DownMessage = {
      v: 1,
      t: 'state',
      seq: 1,
      terminalId: TERMINAL,
      instanceId: INSTANCE_B,
      state: { mode: 'thanks', cart: null, payment: null, tip: null, thanks: { total: 1 } },
    } as DownMessage;
    pantallaChannel.inject(DISPLAY_DOWN_EVENT, fakeState);
    pantallaChannel.inject(DISPLAY_DOWN_EVENT, { ...fakeState, terminalId: OTHER_TERMINAL, instanceId: INSTANCE_A, seq: 99 });
    pantallaChannel.inject(DISPLAY_DOWN_EVENT, { ...fakeState, terminalId: TERMINAL.toUpperCase(), instanceId: INSTANCE_A, seq: 99 });
    expect(downs).toHaveLength(0);
    expect(receiver.activeInstanceId).toBe(INSTANCE_A);
    expect(receiver.lastSeq).toBe(2);
  });
});

describe('tester F3-B r1 · ciclo de vida del canal', () => {
  it('tras close(): nada entra, nada sale, y un SUBSCRIBED tardío no vacía la cola ni avisa por onStatus', async () => {
    const bus = new RealtimeBus();
    const client = createRealtimeDouble({ bus, autoJoin: false });
    const statuses: SupabaseChannelStatus[] = [];
    const channel = createSupabaseDisplayChannel(client.client, TERMINAL, {
      sendEvent: DISPLAY_DOWN_EVENT,
      listenEvent: DISPLAY_UP_EVENT,
      onStatus: (s) => statuses.push(s),
    });
    const received: unknown[] = [];
    channel.onmessage = (e) => received.push(e.data);
    channel.postMessage({ queued: true });
    channel.close();
    const double = client.channels[0];
    double.setStatus('SUBSCRIBED');
    await flush();
    expect(bus.sent).toHaveLength(0);
    expect(statuses).toEqual([]);
    channel.postMessage({ late: true });
    await flush();
    expect(bus.sent).toHaveLength(0);
    double.inject(DISPLAY_UP_EVENT, { late: true });
    expect(received).toHaveLength(0);
    expect(double.unsubscribed).toBe(true);
    expect(bus.removed).toBe(1);
  });

  it('receptor cerrado con sayBye antes del join: el display_bye queda en la cola y se pierde (no se envía nunca)', async () => {
    const bus = new RealtimeBus();
    const pantalla = createRealtimeDouble({ bus, autoJoin: false });
    const receiver = new SupabaseBroadcastReceiver({ terminalId: TERMINAL, client: pantalla.client, now: () => 1000 });
    receiver.startPresence({ touch: true, width: 1, height: 1 });
    receiver.close(true);
    pantalla.channels[0].setStatus('SUBSCRIBED');
    await flush();
    // Documenta el comportamiento: sin join no hay bye. La caja lo resuelve por STALE_AFTER_MS.
    expect(bus.sent.filter((s) => (s.payload as { t?: string }).t === 'display_bye')).toHaveLength(0);
  });

  it('lo que llega por Supabase NO se etiqueta como origen remoto en el canal simple (la caja standalone lo cuenta como local)', async () => {
    const { transport, receiver } = pair();
    await flush();
    receiver.startPresence({ touch: true, width: 1, height: 1 });
    await flush();
    // Se anota: SupabaseBroadcastTransport usado sin multiChannel registra la tableta como `local`.
    expect(transport.lastDisplaySeenByOrigin).toEqual({ local: 1000, remote: null });
  });
});

describe('tester F3-B r1 · intención y token', () => {
  it('`?pair` con más de 6 dígitos ya NO se trunca ni se canjea: va al campo con lo tecleado (ronda 2 · 7); duplicado → el primero', () => {
    expect(resolveRemoteIntent('?pair=1234567', null)).toEqual({ kind: 'ask_code', prefill: '123456' });
    expect(resolveRemoteIntent('?pair=111111&pair=222222', null)).toEqual({ kind: 'pair', code: '111111', fallback: null });
    expect(resolveRemoteIntent('?pair=%', null)).toEqual({ kind: 'ask_code', prefill: '' });
    expect(resolveRemoteIntent('?PAIR=123456', null)).toEqual({ kind: 'local' });
  });

  it('el storage no acepta token con forma casi válida (43 chars con `+`, `=`), ni v como cadena, ni terminalId vacío', () => {
    const storage = memoryStorage();
    expect(saveStoredRemoteDisplay({ token: 'A'.repeat(42) + '+', terminalId: TERMINAL }, storage)).toBe(false);
    expect(saveStoredRemoteDisplay({ token: 'A'.repeat(42) + '=', terminalId: TERMINAL }, storage)).toBe(false);
    expect(saveStoredRemoteDisplay({ token: TOKEN, terminalId: '' }, storage)).toBe(false);
    expect(storage.map.size).toBe(0);
    storage.setItem(REMOTE_DISPLAY_STORAGE_KEY, JSON.stringify({ v: '1', token: TOKEN, terminalId: TERMINAL }));
    expect(readStoredRemoteDisplay(storage)).toBeNull();
    storage.setItem(REMOTE_DISPLAY_STORAGE_KEY, JSON.stringify({ v: 1, token: TOKEN, terminalId: { id: TERMINAL } }));
    expect(readStoredRemoteDisplay(storage)).toBeNull();
    storage.setItem(REMOTE_DISPLAY_STORAGE_KEY, JSON.stringify([{ v: 1, token: TOKEN, terminalId: TERMINAL }]));
    expect(readStoredRemoteDisplay(storage)).toBeNull();
  });

  it('ninguna petición lleva el token en la URL ni en el body, ni organization_id en ninguna parte', async () => {
    const calls: Array<{ input: string; init?: Parameters<FetchLike>[1] }> = [];
    const fetchFn: FetchLike = async (input, init) => {
      calls.push({ input, init });
      return { status: 200, ok: true, json: async () => ({ data: { token: TOKEN, terminalId: TERMINAL, at: 'x', realtime: { channel: 'c', token: 'j', expiresAt: 'e' } } }) };
    };
    await pairWithCode('123456', fetchFn);
    await fetchRemoteBootstrap(TOKEN, fetchFn);
    await sendRemoteHeartbeat(TOKEN, fetchFn);
    expect(calls.map((c) => c.input)).toEqual([PAIR_ENDPOINT, BOOTSTRAP_ENDPOINT, HEARTBEAT_ENDPOINT]);
    for (const call of calls) {
      expect(call.input).not.toContain(TOKEN);
      expect(call.init?.body ?? '').not.toContain(TOKEN);
      expect(JSON.stringify(call)).not.toMatch(/organization/i);
    }
    expect(calls[0].init?.headers?.Authorization).toBeUndefined();
    expect(calls[1].init?.headers?.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[2].init?.headers?.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[2].init?.body).toBeUndefined();
  });

  it('un 401 en el bootstrap con body vacío o no JSON sigue siendo «revocada»; un 429 o 403 NO desempareja', async () => {
    const mk =
      (status: number, body: string | null): FetchLike =>
      async () => ({
        status,
        ok: false,
        json: async () => {
          if (body === null) throw new SyntaxError('vacío');
          return JSON.parse(body);
        },
      });
    const r401 = await fetchRemoteBootstrap(TOKEN, mk(401, null));
    expect(!r401.ok && isUnauthorizedFailure(r401)).toBe(true);
    const r429 = await fetchRemoteBootstrap(TOKEN, mk(429, JSON.stringify({ code: 'RATE_LIMITED', retryAfter: 30 })));
    expect(!r429.ok && !isUnauthorizedFailure(r429)).toBe(true);
    expect(r429).toMatchObject({ kind: 'http', status: 429, retryAfterSeconds: 30 });
    const r403 = await fetchRemoteBootstrap(TOKEN, mk(403, '{}'));
    expect(!r403.ok && !isUnauthorizedFailure(r403)).toBe(true);
  });

  it('latido: un 401 que llega después de stop() no llama a onRevoked; un 429 con Retry-After no desempareja', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    let status = 429;
    const fetchFn: FetchLike = async () => ({ status, ok: false, json: async () => ({ code: 'RATE_LIMITED', retryAfter: 5 }) });
    const onRevoked = jest.fn();
    const onFailure = jest.fn();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const hb = startRemoteHeartbeat({ token: TOKEN, fetchFn, onCredential: jest.fn(), onRevoked, onFailure, intervalMs: 1000 });
    jest.advanceTimersByTime(1000);
    await flush();
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ status: 429 }));
    expect(onRevoked).not.toHaveBeenCalled();
    expect(hb.stopped).toBe(false);
    status = 401;
    const pending = hb.beat();
    hb.stop();
    await pending;
    expect(onRevoked).not.toHaveBeenCalled();
  });
});

describe('tester F3-B r1 · cliente real de supabase-js (sin socket)', () => {
  it('se construye sin sesión, sin `auth`, acepta setToken con JWT caducado sin lanzar y dispose es idempotente', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const client = createRemoteDisplayClient({ url: 'http://127.0.0.1:1', anonKey: 'anon-key' });
    expect(client).not.toBeNull();
    if (!client) return;
    // `accessToken` en supabase-js sustituye `client.auth` por un proxy que lanza al usar cualquier método.
    expect(() => (client.client as unknown as { auth: { getSession: unknown } }).auth.getSession).toThrow();
    const expired = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ exp: 1 })).toString('base64url')}.sig`;
    await expect(client.setToken(expired)).resolves.toBeUndefined();
    // Ronda 2 · 3: un JWT que setAuth rechaza NO se conserva como vigente.
    expect(client.token).toBeNull();
    expect(warn).toHaveBeenCalled();
    const fresh = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url')}.sig`;
    await client.setToken(fresh);
    expect(client.token).toBe(fresh);
    await client.setToken('');
    expect(client.token).toBe(fresh);
    await client.dispose();
    await client.dispose();
    expect(client.token).toBeNull();
    await client.setToken(fresh);
    expect(client.token).toBeNull();
  });

  it('sin NEXT_PUBLIC_SUPABASE_* → null (no lanza)', () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    try {
      expect(createRemoteDisplayClient()).toBeNull();
    } finally {
      if (url !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = url;
      if (key !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = key;
    }
  });
});

describe('tester F3-B r1 · aislamiento en el repositorio', () => {
  it('ningún componente ni módulo de navegador consulta pos_terminal_secrets; solo rutas/servidor con service role', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('node:path') as typeof import('node:path');
    const root = path.resolve(__dirname, '../../');
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          const text = fs.readFileSync(full, 'utf8');
          if (/from\(\s*['"]pos_terminal_secrets['"]\s*\)/.test(text)) hits.push(path.relative(root, full).replace(/\\/g, '/'));
        }
      }
    };
    walk(root);
    expect(hits.sort()).toEqual(
      ['app/api/pos/display/pair/route.ts', 'app/api/pos/display/revoke/route.ts', 'app/api/pos/terminals/[id]/pairing-code/route.ts', 'lib/pos/display/server/displayAuth.ts'].sort(),
    );
    for (const file of hits) {
      const text = fs.readFileSync(path.join(root, file), 'utf8');
      expect(text).toMatch(/getServiceClient\(\)|options\.client/);
      expect(text).not.toMatch(/'use client'/);
    }
  });

  it('el middleware excluye /api/pos/display/ (skipPatterns y matcher) y /pos-display es pública', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('node:path') as typeof import('node:path');
    const text = fs.readFileSync(path.resolve(__dirname, '../../middleware.ts'), 'utf8');
    expect(text).toMatch(/'\/api\/pos\/display\/'/);
    expect(text).toMatch(/matcher:[\s\S]*api\/pos\/display\//);
    expect(text).toMatch(/pathname === '\/pos-display'/);
  });
});
