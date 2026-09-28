/**
 * QA ADVERSARIAL de la Fase 3, parte C (lado caja) · ronda 3. Fase de
 * SEGURIDAD: aquí NO se comprueba que lo feliz funcione (eso ya lo hacen
 * f3c-*.test.ts), sino que lo hostil NO funcione.
 *
 * Lo que se intenta romper:
 *  1. El saludo RETENIDO que introdujo esta ronda: ¿a quién se le entrega?
 *     ¿puede un tercero que abre la compuerta llevarse el carrito en el acto?
 *  2. La elección del canal remoto: ¿qué impide que una caja se cuelgue del
 *     canal de OTRA terminal?
 *  3. Mensajes con terminalId / instanceId ajeno por el tubo remoto.
 *  4. JWT de Realtime: caducidad, firma, claims prohibidos.
 *  5. Guardas estáticas: middleware y `pos_terminal_secrets`.
 *
 * Los `it` marcados DEFECTO fijan el comportamiento ACTUAL (el que se
 * considera defectuoso) para que la corrección los invierta.
 */

import fs from 'fs';
import path from 'path';
import { createFanOutDisplayChannel, createListenerGatedChannel, upMessageListenerGate, REMOTE_LISTENER_TTL_MS } from '@/lib/pos/display/multiChannel';
import { createCajaDisplayChannel, SALIDA_ANTERIOR_TIMEOUT_MS } from '@/lib/pos/display/cajaChannel';
import { DISPLAY_UP_EVENT, REMOTE_STALE_AFTER_MS, type SupabaseChannelLike, type SupabaseClientLike } from '@/lib/pos/display/supabaseBroadcastTransport';
import { PROTOCOL_VERSION, type DownMessage, type UpMessage } from '@/lib/pos/display/protocol';
import { BroadcastChannelTransport, BroadcastChannelReceiver, type DisplayChannel, type DisplayChannelEvent } from '@/lib/pos/display/transport';
import { REALTIME_JWT_FORBIDDEN_CLAIMS, REALTIME_JWT_PAYLOAD_KEYS, REALTIME_JWT_TTL_SECONDS, decodeJwtPayload, signRealtimeJwt, verifyJwtSignature } from '@/lib/pos/display/server/displayTokens';

const RAIZ = path.resolve(__dirname, '../../..');
/** La terminal de ESTA caja. */
const TERMINAL = '11111111-2222-4333-8444-555555555555';
/** La terminal de la caja de al lado: misma organización, misma sucursal. */
const VECINA = '99999999-8888-4777-8666-555555555555';
const CAPS = { touch: false, width: 1024, height: 768 };

class FakeChannel implements DisplayChannel {
  posted: unknown[] = [];
  onmessage: ((event: DisplayChannelEvent) => void) | null = null;
  closed = false;
  postMessage(msg: unknown): void {
    this.posted.push(msg);
  }
  close(): void {
    this.closed = true;
  }
  inject(data: unknown, origin?: 'local' | 'remote'): void {
    this.onmessage?.(origin ? { data, origin } : { data });
  }
}

const up = (t: UpMessage['t'], extra: Record<string, unknown> = {}): UpMessage =>
  ({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t, at: 1, capabilities: CAPS, ...extra }) as unknown as UpMessage;
const types = (posted: unknown[]) => posted.map((m) => (m as DownMessage).t);
const estado = (total: number) =>
  ({ mode: 'order', cart: { lines: [], totals: { subtotal: total, tax: 0, discount: 0, total }, currency: 'COP' }, payment: null, tip: null, thanks: null }) as never;
/** Sobre `hello` válido para isDownMessage. */
const saludo = (seq: number) => ({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'hello', seq, instanceId: 'i1', at: 0, organizationId: 120, sessionOpen: true, cashier: null }) as never;
/** Sobre `state` válido para isDownMessage. */
const sobreEstado = (seq: number, total: number) => ({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'state', seq, instanceId: 'i1', at: 0, state: estado(total) }) as never;

interface FakeRealtime {
  client: SupabaseClientLike;
  channels: Array<{ name: string; sent: Array<{ event: string; payload: unknown }>; listeners: Map<string, (m: { payload?: unknown }) => void>; unsubscribed: number }>;
}
function fakeRealtime(): FakeRealtime {
  const fake: FakeRealtime = { channels: [], client: null as unknown as SupabaseClientLike };
  fake.client = {
    channel(name) {
      const entry = { name, sent: [] as Array<{ event: string; payload: unknown }>, listeners: new Map<string, (m: { payload?: unknown }) => void>(), unsubscribed: 0 };
      fake.channels.push(entry);
      const ch: SupabaseChannelLike = {
        on: (_t, filter, cb) => {
          entry.listeners.set(filter.event, cb);
          return ch;
        },
        send: async (args) => {
          entry.sent.push({ event: args.event, payload: args.payload });
          return 'ok';
        },
        subscribe: (cb) => {
          cb?.('SUBSCRIBED');
          return ch;
        },
        unsubscribe: async () => {
          entry.unsubscribed += 1;
          return 'ok';
        },
      };
      return ch;
    },
    removeChannel: async () => 'ok',
  };
  return fake;
}
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// ---------------------------------------------------------------------------
// 1. El saludo retenido: ¿a quién se le entrega?
// ---------------------------------------------------------------------------

describe('saludo retenido · quién se lo lleva', () => {
  it('cualquiera que abra la compuerta se lleva el carrito ENTERO en el acto, sin pedir snapshot', () => {
    let now = 0;
    const inner = new FakeChannel();
    const gated = createListenerGatedChannel(inner, { now: () => now, gate: upMessageListenerGate(TERMINAL) });
    // La caja lleva un rato trabajando con la compuerta dormida: nadie escucha.
    gated.postMessage({ t: 'hello', v: PROTOCOL_VERSION, terminalId: TERMINAL, seq: 1, instanceId: 'i1' });
    gated.postMessage({ t: 'state', v: PROTOCOL_VERSION, terminalId: TERMINAL, seq: 2, instanceId: 'i1', cart: estado(1_250_000) });
    expect(inner.posted).toHaveLength(0);
    expect(gated.hasPendingSnapshot).toBe(true);

    // Un tercero con sesión de la misma sucursal (lo que la política de
    // realtime.messages permite) manda UN display_alive con el terminalId
    // correcto —que va en el propio topic, no es secreto—.
    now = 1_000;
    gated.onmessage = () => {};
    inner.inject(up('display_alive'), 'remote');
    // Se lleva el saludo y el carrito sin haber pedido nada.
    expect(types(inner.posted)).toEqual(['hello', 'state']);
    expect((inner.posted[1] as { cart: { cart: { totals: { total: number } } } }).cart.cart.totals.total).toBe(1_250_000);
    gated.close();
  });

  it('el hello retenido conserva su seq ORIGINAL: si el receptor ya vio uno mayor, la reposición se pierde entera', () => {
    let now = 0;
    const inner = new FakeChannel();
    const gated = createListenerGatedChannel(inner, { now: () => now, gate: upMessageListenerGate(TERMINAL), beatIntervalMs: 0 });
    gated.onmessage = () => {};
    // Tableta viva: recibe hasta seq 40.
    inner.inject(up('display_alive'), 'remote');
    gated.postMessage({ t: 'hello', v: PROTOCOL_VERSION, terminalId: TERMINAL, seq: 1, instanceId: 'i1' });
    gated.postMessage({ t: 'state', v: PROTOCOL_VERSION, terminalId: TERMINAL, seq: 40, instanceId: 'i1', cart: estado(10) });
    inner.posted.length = 0;

    // La tableta calla; la compuerta duerme. Mientras duerme la caja publica
    // un state con seq MENOR que el último que la tableta aceptó no puede
    // pasar (seq es monótono), pero el HELLO retenido sí es viejo.
    now = REMOTE_LISTENER_TTL_MS + 1;
    gated.postMessage({ t: 'state', v: PROTOCOL_VERSION, terminalId: TERMINAL, seq: 41, instanceId: 'i1', cart: estado(99) });
    expect(inner.posted).toHaveLength(0);
    now += 1;
    inner.inject(up('display_alive'), 'remote');
    const repuestos = inner.posted as Array<DownMessage>;
    expect(types(repuestos)).toEqual(['hello', 'state']);
    // El hello repuesto viaja con seq 1: un receptor con highestSeq 40 lo TIRA.
    expect(repuestos[0].seq).toBe(1);
    expect(repuestos[1].seq).toBe(41);
    gated.close();
  });

  it('un receptor real descarta el hello repuesto (seq viejo) pero acepta el state: el carrito se pone al día', () => {
    let now = 0;
    const inner = new FakeChannel();
    const gated = createListenerGatedChannel(inner, { now: () => now, gate: upMessageListenerGate(TERMINAL), beatIntervalMs: 0 });
    // Receptor real conectado al otro extremo del tubo con compuerta.
    const tubo = new FakeChannel();
    const receptor = new BroadcastChannelReceiver({ terminalId: TERMINAL, channelFactory: () => tubo, staleAfterMs: 0, presenceIntervalMs: 0 });
    const vistos: DownMessage[] = [];
    receptor.onDown((m) => vistos.push(m));
    gated.onmessage = () => {};
    inner.inject(up('display_alive'), 'remote');
    const reenviar = () => {
      for (const m of inner.posted.splice(0)) tubo.inject(m);
    };
    gated.postMessage(saludo(1));
    gated.postMessage(sobreEstado(40, 10));
    reenviar();
    expect(vistos.map((m) => m.t)).toEqual(['hello', 'state']);

    now = REMOTE_LISTENER_TTL_MS + 1;
    gated.postMessage(sobreEstado(41, 99));
    now += 1;
    inner.inject(up('display_alive'), 'remote');
    reenviar();
    // Solo el state llega: el hello repuesto se descarta por seq. No pasa nada
    // malo porque la instancia es la misma; se deja fijado por si cambia.
    expect(vistos.map((m) => m.t)).toEqual(['hello', 'state', 'state']);
    expect((vistos[2] as unknown as { state: { cart: { totals: { total: number } } } }).state.cart.totals.total).toBe(99);
    receptor.close();
    gated.close();
  });

  it('el reparto retiene el carrito INDEFINIDAMENTE: una pata colgada horas después recibe el state viejo si la compuerta ya está abierta', () => {
    const local = new FakeChannel();
    const fan = createFanOutDisplayChannel([{ origin: 'local', channel: local }]);
    fan.postMessage({ t: 'hello', seq: 1 });
    fan.postMessage({ t: 'state', seq: 2, cart: estado(777) });
    // Nada más se publica en toda la jornada (caja inactiva).
    const tarde = new FakeChannel();
    expect(fan.addLeg({ origin: 'remote', channel: tarde })).toBe(true);
    expect(types(tarde.posted)).toEqual(['hello', 'state']);
    expect((tarde.posted[1] as { cart: { cart: { totals: { total: number } } } }).cart.cart.totals.total).toBe(777);
    fan.close();
  });
});

// ---------------------------------------------------------------------------
// 2. Elección del canal remoto: suplantación de terminal
// ---------------------------------------------------------------------------

describe('elección del canal remoto · suplantación de terminal entre cajas', () => {
  it('DEFECTO (pendiente declarado): la única guarda del cliente es «es una fila activa»; con el id de la terminal VECINA se abre su canal', async () => {
    const rt = fakeRealtime();
    // isRegisteredActiveTerminal (posDisplay.ts) responde true para cualquier
    // fila ACTIVA de la organización: no comprueba que ESTA caja sea esa
    // terminal. Un cajero que edite localStorage pasa igual.
    const canal = createCajaDisplayChannel(VECINA, { local: () => new FakeChannel(), realtime: rt.client, isRegisteredTerminal: async () => true });
    expect(await canal.remoteAttached).toBe(true);
    expect(rt.channels[0].name).toBe(`pos-display:${VECINA}`);
    canal.close();
    await flush();
  });

  it('el id del canal sale del MISMO sitio que el sobre: localStorage, sin claim de terminal en la sesión', () => {
    const posDisplay = fs.readFileSync(path.join(RAIZ, 'src/lib/pos/display/posDisplay.ts'), 'utf8');
    expect(posDisplay).toMatch(/terminalId:\s*getOrCreateLocalTerminalId\(\)/);
    // La comprobación remota no recibe el id de ninguna fuente de confianza: sigue saliendo
    // de localStorage. Lo que cambió en la ronda 4 · C1 es que ya no se compara un id de
    // localStorage con otro id de localStorage (`isRegisteredActiveTerminal`, borrada), sino
    // con la fila que devuelve el SERVIDOR por ese id exacto; el límite residual —un miembro
    // de la MISMA sucursal que apunte su localStorage a otra caja— sigue declarado.
    expect(posDisplay).toMatch(/isRegisteredTerminal:\s*terminalVinculadaYVerificada/);
    const terminal = fs.readFileSync(path.join(RAIZ, 'src/lib/pos/display/terminal.ts'), 'utf8');
    expect(terminal).toMatch(/localStorage|TerminalIdStorage/);
  });

  it('una comprobación que dice «no» deja la caja muda por Realtime: no hay canal, no hay mensajes', async () => {
    const rt = fakeRealtime();
    const canal = createCajaDisplayChannel(VECINA, { local: () => new FakeChannel(), realtime: rt.client, isRegisteredTerminal: async () => false });
    expect(await canal.remoteAttached).toBe(false);
    expect(rt.channels).toHaveLength(0);
    canal.close();
  });
});

// ---------------------------------------------------------------------------
// 3. Mensajes hostiles por el tubo remoto
// ---------------------------------------------------------------------------

describe('mensajes hostiles por el tubo remoto', () => {
  it('un `up` de OTRA terminal no abre la compuerta, no llega al emisor y no saca el carrito', () => {
    const now = 0;
    const inner = new FakeChannel();
    const gated = createListenerGatedChannel(inner, { now: () => now, gate: upMessageListenerGate(TERMINAL) });
    gated.postMessage({ t: 'state', seq: 2, cart: estado(500) });
    const ajeno = { v: PROTOCOL_VERSION, terminalId: VECINA, t: 'display_alive', at: 1, capabilities: CAPS };
    inner.inject(ajeno, 'remote');
    expect(inner.posted).toHaveLength(0);
    expect(gated.hasListener).toBe(false);
    gated.close();
  });

  it('un `qr_paid_claim` con toInstanceId de OTRA instancia no llega a los handlers de la caja', () => {
    const remoto = new FakeChannel();
    const fan = createFanOutDisplayChannel([{ origin: 'remote', channel: remoto }]);
    const transporte = new BroadcastChannelTransport({ terminalId: TERMINAL, channelFactory: () => fan, heartbeatIntervalMs: 0 });
    const recibidos: UpMessage[] = [];
    transporte.onUp((m) => recibidos.push(m));
    // Dirigido a otra pestaña de la misma caja.
    remoto.inject(up('qr_paid_claim', { cartId: 'c-1', toInstanceId: 'otra-instancia' }), 'remote');
    expect(recibidos).toHaveLength(0);
    // Sin destinatario sí llega (es el caso legítimo).
    remoto.inject(up('qr_paid_claim', { cartId: 'c-1' }), 'remote');
    expect(recibidos.map((m) => m.t)).toEqual(['qr_paid_claim']);
    transporte.close();
  });

  it('un `display_bye` forjado por el tubo remoto NO borra la presencia de la ventana local', () => {
    const local = new FakeChannel();
    const remoto = new FakeChannel();
    const fan = createFanOutDisplayChannel([
      { origin: 'local', channel: local },
      { origin: 'remote', channel: remoto },
    ]);
    const now = 1_000;
    const transporte = new BroadcastChannelTransport({ terminalId: TERMINAL, channelFactory: () => fan, heartbeatIntervalMs: 0, now: () => now });
    local.inject(up('display_alive'), 'local');
    expect(transporte.lastDisplaySeenByOrigin.local).toBe(1_000);
    remoto.inject(up('display_bye'), 'remote');
    expect(transporte.lastDisplaySeenByOrigin.local).toBe(1_000);
    expect(transporte.lastDisplaySeenByOrigin.remote).toBeNull();
    transporte.close();
  });
});

// ---------------------------------------------------------------------------
// 4. JWT de Realtime
// ---------------------------------------------------------------------------

describe('JWT de Realtime de la pantalla', () => {
  const SECRETO = 'x7Qp9Lm2Rt4Vw8Yz1Bn5Cd3Fg6Hj0Kl-secreto-jwt-de-jest';

  it('caduca a los 5 minutos y no lleva ningún claim de confianza', () => {
    const { token, expiresAt } = signRealtimeJwt(SECRETO, { terminalId: TERMINAL, now: 1_000_000 });
    const payload = decodeJwtPayload(token)!;
    expect(Object.keys(payload).sort()).toEqual([...REALTIME_JWT_PAYLOAD_KEYS].sort());
    for (const prohibido of REALTIME_JWT_FORBIDDEN_CLAIMS) expect(payload[prohibido]).toBeUndefined();
    expect(payload.exp).toBe(1_000 + REALTIME_JWT_TTL_SECONDS);
    expect(Date.parse(expiresAt)).toBe((1_000 + REALTIME_JWT_TTL_SECONDS) * 1000);
    // `sub` no es un uuid: auth.uid() no lo convierte en un usuario.
    expect(payload.sub).toBe(`pos-display:${TERMINAL}`);
    expect(String(payload.sub)).not.toMatch(/^[0-9a-f]{8}-/i);
    expect(payload.role).toBe('anon');
  });

  it('firmado con OTRO secreto no verifica; un payload manipulado invalida la firma', () => {
    const { token } = signRealtimeJwt(SECRETO, { terminalId: TERMINAL });
    expect(verifyJwtSignature(token, SECRETO)).toBe(true);
    expect(verifyJwtSignature(token, `${SECRETO}-otro`)).toBe(false);
    const [h, , s] = token.split('.');
    const falso = Buffer.from(JSON.stringify({ role: 'service_role', pos_terminal_id: VECINA }), 'utf8').toString('base64url');
    expect(verifyJwtSignature(`${h}.${falso}.${s}`, SECRETO)).toBe(false);
  });

  it('el id del canal y el del claim se normalizan igual: un uuid en MAYÚSCULAS no abre un topic distinto', () => {
    const mayus = TERMINAL.toUpperCase();
    const { token } = signRealtimeJwt(SECRETO, { terminalId: mayus });
    const payload = decodeJwtPayload(token)!;
    expect(payload.pos_terminal_id).toBe(TERMINAL);
  });
});

// ---------------------------------------------------------------------------
// 5. Guardas estáticas
// ---------------------------------------------------------------------------

describe('guardas estáticas de la parte C', () => {
  it('el middleware excluye /api/pos/display/ del matcher', () => {
    const mw = fs.readFileSync(path.join(RAIZ, 'src/middleware.ts'), 'utf8');
    const matcher = /matcher:\s*\[([\s\S]*?)\]/.exec(mw)?.[1] ?? '';
    expect(matcher).toContain('api/pos/display/');
  });

  it('`pos_terminal_secrets` solo se consulta desde rutas de servidor o lib/pos/display/server', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        const text = fs.readFileSync(full, 'utf8');
        if (/from\(\s*['"]pos_terminal_secrets['"]\s*\)/.test(text)) hits.push(path.relative(RAIZ, full).replace(/\\/g, '/'));
      }
    };
    walk(path.join(RAIZ, 'src'));
    expect(hits.sort()).toEqual([
      'src/app/api/pos/display/pair/route.ts',
      'src/app/api/pos/display/revoke/route.ts',
      'src/app/api/pos/terminals/[id]/pairing-code/route.ts',
      'src/lib/pos/display/server/displayAuth.ts',
    ]);
  });

  it('ningún módulo de la parte C importa el cliente service-role', () => {
    for (const rel of ['src/lib/pos/display/multiChannel.ts', 'src/lib/pos/display/cajaChannel.ts', 'src/lib/pos/display/posDisplay.ts', 'src/components/pos/display/PairingCodeDialog.tsx', 'src/components/pos/display/RevokeRemoteDisplayDialog.tsx', 'src/components/pos/configuracion/pantalla-cliente/DispositivoRemotoSection.tsx']) {
      const text = fs.readFileSync(path.join(RAIZ, rel), 'utf8');
      expect(text).not.toMatch(/server-service|getServiceClient|SUPABASE_SERVICE_ROLE/);
    }
  });

  it('el tope de la espera de salida es finito y corto', () => {
    expect(SALIDA_ANTERIOR_TIMEOUT_MS).toBeGreaterThan(0);
    expect(SALIDA_ANTERIOR_TIMEOUT_MS).toBeLessThanOrEqual(3_000);
    expect(REMOTE_LISTENER_TTL_MS).toBeGreaterThanOrEqual(REMOTE_STALE_AFTER_MS);
  });

  it('el canal remoto se abre con el evento `up` como ÚNICO oyente: un `down` forjado por la tableta no vuelve a la caja', async () => {
    const rt = fakeRealtime();
    const canal = createCajaDisplayChannel(TERMINAL, { local: () => new FakeChannel(), realtime: rt.client, isRegisteredTerminal: async () => true });
    await canal.remoteAttached;
    expect([...rt.channels[0].listeners.keys()]).toEqual([DISPLAY_UP_EVENT]);
    canal.close();
    await flush();
  });
});

// ---------------------------------------------------------------------------
// 6. Denegación de servicio sobre la pantalla del cliente desde el propio canal
// ---------------------------------------------------------------------------

describe('DoS de la pantalla remota desde el canal · la compuerta la gobierna quien habla', () => {
  it('ARREGLADO: un `display_bye` con el terminalId CORRECTO pero SIN firma ya no apaga el tubo remoto', () => {
    const now = 0;
    const inner = new FakeChannel();
    // Igual que cajaChannel.ts: la compuerta conoce la instancia de esta caja.
    const INSTANCIA = 'inst-caja-1';
    const gated = createListenerGatedChannel(inner, { now: () => now, gate: upMessageListenerGate(TERMINAL, () => INSTANCIA), beatIntervalMs: 0 });
    gated.onmessage = () => {};
    // La tableta legítima está viva.
    inner.inject(up('display_alive'), 'remote');
    expect(gated.hasListener).toBe(true);
    gated.postMessage(sobreEstado(1, 10));
    expect(inner.posted).toHaveLength(1);

    // Un tercero de la misma sucursal manda UN display_bye: el terminalId no
    // es un secreto (es el nombre del topic), pero la firma de la instancia que
    // esta caja le dio a la pantalla en su `hello` sí hay que haberla oído
    // (F3-C ronda 5 · 3). Sin ella, la compuerta ni cierra ni renueva.
    inner.inject({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'display_bye', at: 1 }, 'remote');
    expect(gated.hasListener).toBe(true);
    gated.postMessage(sobreEstado(2, 20));
    // El carrito de la tableta legítima sigue saliendo.
    expect(inner.posted).toHaveLength(2);

    // La despedida FIRMADA (la de la pantalla emparejada) sí la duerme.
    inner.inject({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'display_bye', ackInstanceId: INSTANCIA }, 'remote');
    expect(gated.hasListener).toBe(false);
    gated.close();
  });

  it('DEFECTO: un `display_alive` de un tercero mantiene la compuerta ABIERTA sin tableta: la caja paga Realtime indefinidamente', () => {
    let now = 0;
    const inner = new FakeChannel();
    const gated = createListenerGatedChannel(inner, { now: () => now, gate: upMessageListenerGate(TERMINAL), beatIntervalMs: 0 });
    gated.onmessage = () => {};
    for (let i = 0; i < 10; i += 1) {
      inner.inject(up('display_alive'), 'remote');
      now += REMOTE_LISTENER_TTL_MS - 1;
      gated.postMessage({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'heartbeat', seq: i + 1, instanceId: 'i1', at: now });
    }
    expect(inner.posted).toHaveLength(10);
    gated.close();
  });

  it('la compuerta NO mira `toInstanceId`: un `need_snapshot` dirigido a otra pestaña la abre igual, aunque el transporte lo descarte', () => {
    const now = 0;
    const inner = new FakeChannel();
    const gated = createListenerGatedChannel(inner, { now: () => now, gate: upMessageListenerGate(TERMINAL), beatIntervalMs: 0 });
    gated.onmessage = () => {};
    inner.inject({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'need_snapshot', at: 1, capabilities: CAPS, toInstanceId: 'otra-pestana' }, 'remote');
    expect(gated.hasListener).toBe(true);
    gated.close();
  });
});

// ---------------------------------------------------------------------------
// 7. salidasEnVuelo: el mapa por topic
// ---------------------------------------------------------------------------

describe('salidas en vuelo · la anotación por topic', () => {
  it('DEFECTO: si `leaving` no resuelve nunca, el topic queda anotado para siempre y CADA reapertura paga el tope', async () => {
    const colgado = { client: null as unknown as SupabaseClientLike, canales: 0 };
    colgado.client = {
      channel: () => {
        colgado.canales += 1;
        const ch: SupabaseChannelLike = {
          on: () => ch,
          send: async () => 'ok',
          subscribe: (cb) => {
            cb?.('SUBSCRIBED');
            return ch;
          },
          // Nunca resuelve: socket colgado.
          unsubscribe: () => new Promise<unknown>(() => {}),
        };
        return ch;
      },
      removeChannel: async () => 'ok',
    };
    const TOPIC = '22222222-3333-4444-8555-666666666666';
    const a = createCajaDisplayChannel(TOPIC, { local: () => new FakeChannel(), realtime: colgado.client, isRegisteredTerminal: async () => true, salidaTimeoutMs: 5 });
    await a.remoteAttached;
    a.close();
    // Primera reapertura: paga el tope.
    const t0 = Date.now();
    const b = createCajaDisplayChannel(TOPIC, { local: () => new FakeChannel(), realtime: colgado.client, isRegisteredTerminal: async () => true, salidaTimeoutMs: 5 });
    expect(await b.remoteAttached).toBe(true);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(4);
    b.close();
    // Segunda: la anotación del PRIMER cierre sigue ahí (su promesa nunca resolvió).
    const c = createCajaDisplayChannel(TOPIC, { local: () => new FakeChannel(), realtime: colgado.client, isRegisteredTerminal: async () => true, salidaTimeoutMs: 5 });
    expect(await c.remoteAttached).toBe(true);
    expect(colgado.canales).toBe(3);
    c.close();
  });
});
