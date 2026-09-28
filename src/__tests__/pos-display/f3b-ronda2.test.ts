/**
 * Fase 3, parte B — ronda 2: las correcciones del QA y del tester, cada una
 * con la prueba que impide reincidir. Sin React (el proyecto no tiene
 * infraestructura para montar componentes): lo que se comprueba es la LÓGICA
 * pura que los hooks llaman, más el transporte remoto con el doble del canal.
 *
 * 1. Un `?pair` ya consumido no anula un emparejamiento válido
 *    (`resolveRemoteIntent` + `resolveRedeemFailure`).
 * 2. El ritmo del canal remoto es el remoto, no el de 1 s del local
 *    (REMOTE_PRESENCE_INTERVAL_MS / REMOTE_STALE_AFTER_MS aplicados al
 *    receptor).
 * 3. Un JWT vencido deja de ofrecerse (`jwtSecondsToExpiry`).
 * 6. Un bootstrap cuyo canal no corresponde a su terminal se rechaza.
 * 7. Un `?pair` que no sean exactamente seis dígitos no se canjea truncado.
 *
 * Fixtures sin nombres de organizaciones reales (ids y descripciones).
 */

import { createHash } from 'node:crypto';
import {
  isRemoteBootstrap,
  resolveRedeemFailure,
  resolveRemoteIntent,
  type RemoteApiFailure,
  type StoredRemoteDisplay,
} from '@/lib/pos/display/remoteDisplay';
import { jwtSecondsToExpiry } from '@/lib/pos/display/remoteDisplayClient';
import {
  REMOTE_PRESENCE_INTERVAL_MS,
  REMOTE_STALE_AFTER_MS,
  SupabaseBroadcastReceiver,
} from '@/lib/pos/display/supabaseBroadcastTransport';
import { HEARTBEAT_INTERVAL_MS, STALE_AFTER_MS, displayChannelName } from '@/lib/pos/display/transport';
import { RealtimeBus, createRealtimeDouble } from './f3b-supabaseRealtimeDouble';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const TOKEN = 'C'.repeat(43);
/** Huella del código con el que se obtuvo este emparejamiento (ronda 3 · 2). */
const CODE_HASH = createHash('sha256').update('123456', 'utf8').digest('hex');
const STORED: StoredRemoteDisplay = { v: 1, token: TOKEN, terminalId: TERMINAL, pairedAt: '', codeHash: CODE_HASH };

const httpFailure = (status: number, code: string | null = null): RemoteApiFailure => ({
  ok: false,
  kind: 'http',
  status,
  code,
  retryAfterSeconds: null,
});

const capabilities = { width: 1024, height: 768, touch: false, dpr: 1 };

function bootstrap(overrides: { terminalId?: string; channel?: string } = {}): unknown {
  const terminalId = overrides.terminalId ?? TERMINAL;
  return {
    terminal: { id: terminalId, name: 'Caja 1', code: 'C1', branchId: 7 },
    brand: { organizationId: 120, name: 'Comercio', logoUrl: null, primaryColor: null, secondaryColor: null, timezone: 'America/Bogota' },
    settings: {},
    locale: 'es-CO',
    currency: 'COP',
    realtime: { channel: overrides.channel ?? displayChannelName(terminalId), token: 'jwt', expiresAt: '2026-01-01T00:00:00.000Z' },
  };
}

describe('F3-B ronda 2 · 1: un código gastado no tira un emparejamiento vivo', () => {
  it('la intención de canje lleva el emparejamiento guardado como respaldo', () => {
    expect(resolveRemoteIntent('?pair=123456', STORED)).toEqual({ kind: 'pair', code: '123456', fallback: STORED });
    expect(resolveRemoteIntent('?pair=123456', null)).toEqual({ kind: 'pair', code: '123456', fallback: null });
  });

  it('con el MISMO código del emparejamiento guardado, el fallo del canje sigue con él: el código gastado del quiosco no deja la pantalla pidiendo otro', () => {
    for (const failure of [
      httpFailure(404, 'CODE_INVALID'), // ya consumido o vencido: el caso del quiosco
      httpFailure(400, 'CODE_INVALID'),
      { ok: false, kind: 'network', message: 'sin red' } as RemoteApiFailure,
    ]) {
      expect(resolveRedeemFailure(failure, STORED, CODE_HASH)).toEqual({ kind: 'fallback', stored: STORED });
    }
  });

  it('sin emparejamiento guardado no hay a dónde caer: se pide el código, como antes', () => {
    const failure = httpFailure(404, 'CODE_INVALID');
    expect(resolveRedeemFailure(failure, null, CODE_HASH)).toEqual({ kind: 'ask_code', failure });
  });
});

describe('F3-B ronda 2 · 2: el canal remoto no hereda el ritmo del local', () => {
  it('el ritmo remoto es mucho más lento que el de BroadcastChannel, y el umbral de silencio guarda la misma proporción', () => {
    expect(HEARTBEAT_INTERVAL_MS).toBe(1_000); // local: un mensaje por segundo no cuesta nada
    expect(REMOTE_PRESENCE_INTERVAL_MS).toBeGreaterThanOrEqual(5 * HEARTBEAT_INTERVAL_MS);
    expect(REMOTE_STALE_AFTER_MS).toBe(3 * REMOTE_PRESENCE_INTERVAL_MS);
    expect(REMOTE_STALE_AFTER_MS).toBeGreaterThan(STALE_AFTER_MS);
  });

  it('el receptor remoto construido con el ritmo remoto emite `display_alive` cada 5 s, no cada segundo', () => {
    jest.useFakeTimers();
    try {
      const bus = new RealtimeBus();
      const double = createRealtimeDouble({ bus, autoJoin: false });
      const receiver = new SupabaseBroadcastReceiver({
        terminalId: TERMINAL,
        client: double.client,
        presenceIntervalMs: REMOTE_PRESENCE_INTERVAL_MS,
        staleAfterMs: REMOTE_STALE_AFTER_MS,
      });
      double.channels[0].setStatus('SUBSCRIBED');
      receiver.startPresence(capabilities);
      const alives = () => bus.sent.filter((r) => (r.payload as { t?: string } | null)?.t === 'display_alive').length;
      // El primer «estoy» sale en el acto (la caja no espera un intervalo entero).
      expect(alives()).toBe(1);
      jest.advanceTimersByTime(10_000);
      // 10 s de presencia: el inicial + 2 latidos con el ritmo remoto.
      // Con el de 1 s del transporte local serían 11.
      expect(alives()).toBe(3);
      receiver.close(false);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('F3-B ronda 2 · 3: un JWT vencido deja de ofrecerse', () => {
  const jwt = (payload: Record<string, unknown>) =>
    `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.firma`;

  it('jwtSecondsToExpiry: negativo si ya venció, positivo si queda margen, null si no se puede leer', () => {
    const ahora = 1_800_000_000_000; // instante fijo: la prueba no depende del reloj
    expect(jwtSecondsToExpiry(jwt({ exp: 1 }), ahora)).toBeLessThan(0);
    expect(jwtSecondsToExpiry(jwt({ exp: Math.floor(ahora / 1000) + 300 }), ahora)).toBe(300);
    expect(jwtSecondsToExpiry(jwt({ role: 'anon' }), ahora)).toBeNull(); // sin `exp`
    expect(jwtSecondsToExpiry('no-es-un-jwt', ahora)).toBeNull();
    expect(jwtSecondsToExpiry('a.b.c', ahora)).toBeNull();
    expect(jwtSecondsToExpiry('', ahora)).toBeNull();
  });
});

describe('F3-B ronda 2 · 6: el canal del bootstrap tiene que ser el de su terminal', () => {
  it('acepta el bootstrap coherente', () => {
    expect(isRemoteBootstrap(bootstrap())).toBe(true);
  });

  it('acepta el canal en minúsculas aunque el id venga en mayúsculas (Postgres devuelve minúsculas, pero no se confía)', () => {
    const mayus = TERMINAL.toUpperCase();
    expect(isRemoteBootstrap(bootstrap({ terminalId: mayus, channel: displayChannelName(TERMINAL) }))).toBe(true);
  });

  it('rechaza un bootstrap cuyo canal es el de OTRA terminal: unirse ahí sería silencio total sin diagnóstico', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const otra = 'ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    expect(isRemoteBootstrap(bootstrap({ channel: displayChannelName(otra) }))).toBe(false);
    expect(isRemoteBootstrap(bootstrap({ channel: 'otro-canal' }))).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('F3-B ronda 2 · 7: `?pair` solo se canjea si son exactamente seis dígitos', () => {
  it('lo demás va al campo de emparejamiento con lo que se pueda leer, sin gastar un intento contra un código distinto', () => {
    expect(resolveRemoteIntent('?pair=1234567', null)).toEqual({ kind: 'ask_code', prefill: '123456' });
    expect(resolveRemoteIntent('?pair=abc-123456', null)).toEqual({ kind: 'ask_code', prefill: '123456' });
    expect(resolveRemoteIntent('?pair=12 34 56', null)).toEqual({ kind: 'ask_code', prefill: '123456' });
    expect(resolveRemoteIntent('?pair=12345', null)).toEqual({ kind: 'ask_code', prefill: '12345' });
    // Con emparejamiento guardado ni siquiera se pide el código: se sigue en remoto.
    expect(resolveRemoteIntent('?pair=1234567', STORED)).toEqual({ kind: 'remote', stored: STORED });
  });
});
