/**
 * Fase 3, parte C · TESTER ronda 2 — lado caja, transporte y canales.
 *
 * Esta ronda es de SEGURIDAD: se intenta ROMPER el emparejamiento y el canal
 * remoto. Aquí viven los ataques que no necesitan servidor (el resto está en
 * `tester-f3c-r2-rutas.test.ts`):
 *
 * - un `up` del canal de OTRA terminal;
 * - un `up` dirigido a OTRA instancia de /app/pos (otra pestaña de la misma caja);
 * - un `display_bye` forjado por quien comparte canal;
 * - un mensaje de BAJADA (`down`) inyectado por el tubo de subida;
 * - basura (string, número, null, sobre de otra versión);
 * - un solo `seq` para los dos tubos;
 * - y el estado que la caja cree de la pantalla cuando la tableta MUERE sin
 *   despedirse (el caso que el watchdog existe para cubrir).
 *
 * Sin React, sin Supabase, sin DOM: transporte real sobre canales falsos.
 */

import { createFanOutDisplayChannel, createListenerGatedChannel, upMessageListenerGate, REMOTE_LISTENER_TTL_MS } from '@/lib/pos/display/multiChannel';
import { PROTOCOL_VERSION, type DisplayCapabilities } from '@/lib/pos/display/protocol';
import { combineLiveDisplayCapabilities, readDisplayPresenceView } from '@/lib/pos/display/presence';
import { resolveNoticeTouch, resolveTipWaitingNotice } from '@/components/pos/display/tipNotice';
import { BroadcastChannelTransport, type DisplayChannel, type DisplayChannelEvent } from '@/lib/pos/display/transport';

const TERMINAL = '11111111-2222-4333-8444-555555555555';
const OTRA_TERMINAL = '99999999-8888-4777-8666-555555555555';
const MONITOR: DisplayCapabilities = { touch: false, width: 1920, height: 1080 };
const TABLETA: DisplayCapabilities = { touch: true, width: 800, height: 1280 };

class FakeChannel implements DisplayChannel {
  posted: unknown[] = [];
  closed = false;
  onmessage: ((event: DisplayChannelEvent) => void) | null = null;
  postMessage(msg: unknown): void {
    this.posted.push(msg);
  }
  close(): void {
    this.closed = true;
  }
  inject(data: unknown): void {
    this.onmessage?.({ data });
  }
}

function alive(at: number, capabilities: DisplayCapabilities, extra: Record<string, unknown> = {}): unknown {
  return { v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'display_alive', at, capabilities, ...extra };
}
function needSnapshot(capabilities: DisplayCapabilities, extra: Record<string, unknown> = {}): unknown {
  return { v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'need_snapshot', capabilities, ...extra };
}
function bye(extra: Record<string, unknown> = {}): unknown {
  return { v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'display_bye', ...extra };
}

/** Caja con los dos tubos: el remoto con su compuerta de oyente, igual que cajaChannel.ts. */
function armarCaja(options: { instanceId?: () => string | null } = {}) {
  const local = new FakeChannel();
  const remoteInner = new FakeChannel();
  let ahora = 10_000;
  const instancia: { id: string | null } = { id: null };
  const gated = createListenerGatedChannel(remoteInner, {
    now: () => ahora,
    gate: upMessageListenerGate(TERMINAL, options.instanceId ?? (() => instancia.id)),
    beatIntervalMs: 0,
  });
  const fan = createFanOutDisplayChannel([
    { origin: 'local', channel: local },
    { origin: 'remote', channel: gated },
  ]);
  const transport = new BroadcastChannelTransport({ terminalId: TERMINAL, channelFactory: () => fan, now: () => ahora });
  instancia.id = transport.instanceId;
  return {
    local,
    remoteInner,
    gated,
    transport,
    avanzar: (ms: number) => {
      ahora += ms;
    },
    ahora: () => ahora,
  };
}

describe('canal remoto · qué NO despierta la pata ni cuenta como pantalla', () => {
  it('un `up` del canal de OTRA terminal: ni compuerta, ni presencia, ni un mensaje publicado', () => {
    const caja = armarCaja();
    caja.remoteInner.inject({ v: PROTOCOL_VERSION, terminalId: OTRA_TERMINAL, t: 'display_alive', at: 1, capabilities: TABLETA });
    expect(caja.gated.hasListener).toBe(false);
    expect(caja.transport.lastDisplaySeenByOrigin).toEqual({ local: null, remote: null });
    caja.transport.publish({ t: 'state', state: { mode: 'idle' } as never });
    expect(caja.remoteInner.posted).toHaveLength(0);
    // El tubo local, que no tiene compuerta, sí lo recibe: la caja no se queda muda.
    expect(caja.local.posted).toHaveLength(1);
  });

  it('un `up` dirigido a OTRA instancia (la pestaña vecina) no despierta esta pata (ronda 4 · 4)', () => {
    const caja = armarCaja();
    caja.remoteInner.inject(alive(1, TABLETA, { toInstanceId: 'instancia-de-la-otra-ventana' }));
    expect(caja.gated.hasListener).toBe(false);
    expect(caja.transport.lastDisplaySeenByOrigin.remote).toBeNull();
    caja.transport.publish({ t: 'state', state: { mode: 'idle' } as never });
    expect(caja.remoteInner.posted).toHaveLength(0);
  });

  it('el MISMO mensaje dirigido a ESTA instancia sí abre la compuerta y publica', () => {
    const caja = armarCaja();
    caja.remoteInner.inject(alive(1, TABLETA, { toInstanceId: caja.transport.instanceId }));
    expect(caja.gated.hasListener).toBe(true);
    caja.transport.publish({ t: 'state', state: { mode: 'idle' } as never });
    expect(caja.remoteInner.posted).toHaveLength(1);
  });

  it('un mensaje de BAJADA inyectado por el tubo de subida no abre nada (un `down` forjado por la tableta)', () => {
    const caja = armarCaja();
    caja.remoteInner.inject({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'state', seq: 1, instanceId: 'x', state: { mode: 'idle' } });
    caja.remoteInner.inject({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'hello', seq: 1, instanceId: 'x' });
    expect(caja.gated.hasListener).toBe(false);
    expect(caja.transport.lastDisplaySeenByOrigin.remote).toBeNull();
  });

  it('basura y sobres de otra versión: ni compuerta ni presencia', () => {
    const caja = armarCaja();
    for (const basura of [
      null,
      undefined,
      'display_alive',
      42,
      [],
      { t: 'display_alive' },
      { v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'display_alive' }, // sin at ni capabilities
      { v: PROTOCOL_VERSION + 1, terminalId: TERMINAL, t: 'display_alive', at: 1, capabilities: TABLETA },
      { v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'display_alive', at: 1, capabilities: TABLETA, toInstanceId: '' },
    ]) {
      caja.remoteInner.inject(basura);
    }
    expect(caja.gated.hasListener).toBe(false);
    expect(caja.transport.lastDisplaySeenByOrigin).toEqual({ local: null, remote: null });
  });

  it('`tip_selected` con importe negativo o `rating` fuera de rango no cuentan como oyente', () => {
    const caja = armarCaja();
    caja.remoteInner.inject({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'tip_selected', cartId: 'c1', kind: 'amount', value: -1 });
    caja.remoteInner.inject({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'rating', saleId: null, rating: 9 });
    expect(caja.gated.hasListener).toBe(false);
  });
});

describe('canal remoto · el `display_bye` forjado', () => {
  it('dirigido a OTRA instancia NO duerme esta pata', () => {
    const caja = armarCaja();
    caja.remoteInner.inject(alive(1, TABLETA));
    expect(caja.gated.hasListener).toBe(true);
    caja.remoteInner.inject(bye({ toInstanceId: 'otra-ventana' }));
    expect(caja.gated.hasListener).toBe(true);
    expect(caja.transport.lastDisplaySeenByOrigin.remote).not.toBeNull();
  });

  it('ARREGLADO: sin FIRMA no duerme la pata ni borra la presencia remota, aunque traiga el terminalId correcto', () => {
    const caja = armarCaja();
    caja.remoteInner.inject(alive(1, TABLETA));
    // El `terminalId` no es secreto: va en el nombre del topic, y la política
    // `pos_display_caja_envia` deja publicar a cualquier miembro activo de la
    // sucursal. Sin la firma de la instancia que esta caja le dio a la pantalla
    // en su `hello` (F3-C ronda 5 · 3), la despedida no se cree.
    caja.remoteInner.inject(bye());
    expect(caja.gated.hasListener).toBe(true);
    expect(caja.transport.lastDisplaySeenByOrigin.remote).not.toBeNull();
    caja.transport.publish({ t: 'state', state: { mode: 'idle' } as never });
    expect(caja.remoteInner.posted).toHaveLength(1);
  });

  it('con la FIRMA de esta instancia sí duerme la pata y borra la presencia remota (la pantalla emparejada)', () => {
    const caja = armarCaja();
    caja.remoteInner.inject(alive(1, TABLETA));
    caja.remoteInner.inject(bye({ ackInstanceId: caja.transport.instanceId }));
    expect(caja.gated.hasListener).toBe(false);
    expect(caja.transport.lastDisplaySeenByOrigin.remote).toBeNull();
    caja.transport.publish({ t: 'state', state: { mode: 'idle' } as never });
    expect(caja.remoteInner.posted).toHaveLength(0);
  });

  it('una firma de OTRA instancia (la pestaña vecina) tampoco cierra esta pata', () => {
    const caja = armarCaja();
    caja.remoteInner.inject(alive(1, TABLETA));
    caja.remoteInner.inject(bye({ ackInstanceId: 'otra-ventana' }));
    expect(caja.gated.hasListener).toBe(true);
    expect(caja.transport.lastDisplaySeenByOrigin.remote).not.toBeNull();
  });

  it('el `display_bye` del tubo remoto no toca la presencia del tubo local', () => {
    const caja = armarCaja();
    caja.local.inject(alive(1, MONITOR));
    caja.remoteInner.inject(alive(1, TABLETA));
    caja.remoteInner.inject(bye());
    expect(caja.transport.lastDisplaySeenByOrigin.local).not.toBeNull();
  });
});

describe('un solo sobre para los dos tubos', () => {
  it('el mismo `seq` sale por los dos, y `announce` gasta exactamente dos', () => {
    const caja = armarCaja();
    caja.remoteInner.inject(needSnapshot(TABLETA)); // despierta la pata
    const antes = caja.transport.lastSeq;
    caja.transport.announce({ t: 'hello', sessionOpen: true } as never, { mode: 'idle' } as never);
    expect(caja.transport.lastSeq).toBe(antes + 2);
    const local = caja.local.posted.slice(-2) as Array<{ seq: number; t: string }>;
    const remoto = caja.remoteInner.posted.slice(-2) as Array<{ seq: number; t: string }>;
    expect(local.map((m) => [m.t, m.seq])).toEqual([
      ['hello', antes + 1],
      ['state', antes + 2],
    ]);
    expect(remoto.map((m) => [m.t, m.seq])).toEqual(local.map((m) => [m.t, m.seq]));
  });

  it('la pata remota dormida NO gasta seq de más: el contador es del transporte, no del tubo', () => {
    const caja = armarCaja();
    caja.transport.publish({ t: 'heartbeat', at: 1 });
    caja.transport.publish({ t: 'heartbeat', at: 2 });
    expect(caja.transport.lastSeq).toBe(2);
    expect(caja.remoteInner.posted).toHaveLength(0);
    expect(caja.local.posted).toHaveLength(2);
  });
});

describe('la tableta que MUERE sin despedirse (corte de wifi, batería)', () => {
  /**
   * El watchdog existe justo para esto: la despedida que no llega. La
   * presencia por origen SÍ caduca por silencio (presence.ts, cada tubo con
   * su umbral) y la compuerta del tubo remoto también (REMOTE_LISTENER_TTL_MS).
   */
  it('la presencia remota caduca y la compuerta se duerme sola', () => {
    const caja = armarCaja();
    caja.remoteInner.inject(alive(1, TABLETA));
    caja.avanzar(REMOTE_LISTENER_TTL_MS + 1);
    expect(caja.gated.hasListener).toBe(false);
    const vista = readDisplayPresenceView(
      { isEmitting: true, lastDisplaySeenAt: caja.transport.lastDisplaySeenAt, lastDisplaySeenByOrigin: caja.transport.lastDisplaySeenByOrigin } as never,
      caja.ahora(),
    );
    expect(vista.origins).toEqual([]);
    expect(vista.connected).toBe(false);
  });

  /**
   * ARREGLADO (F3-C ronda 5 · 1; era el DEFECTO alto de la ronda 2 del tester).
   * El transporte sigue sin caducar `displayCapabilitiesByOrigin` —no juzga el
   * tiempo, igual que no lo juzga en `lastDisplaySeenAt`—, pero la UI ya no lo
   * lee en crudo: cruza las capacidades por origen con los orígenes VIVOS de la
   * presencia (`combineLiveDisplayCapabilities`), que sí caduca con el umbral de
   * cada tubo. Una tableta táctil que muere sin despedirse deja de contar y el
   * aviso del cajero vuelve a «registre lo que indique el cliente».
   */
  it('las capacidades de una tableta muerta dejan de contar: el aviso pasa a informativo', () => {
    const caja = armarCaja();
    caja.local.inject(alive(1, MONITOR));
    caja.remoteInner.inject(alive(1, TABLETA));
    caja.avanzar(10 * 60_000); // diez minutos sin la tableta
    caja.local.inject(alive(2, MONITOR)); // el monitor sigue latiendo

    const vista = readDisplayPresenceView(
      { isEmitting: true, lastDisplaySeenAt: caja.transport.lastDisplaySeenAt, lastDisplaySeenByOrigin: caja.transport.lastDisplaySeenByOrigin } as never,
      caja.ahora(),
    );
    expect(vista.origins).toEqual(['local']); // la presencia SÍ sabe que la tableta no está
    expect(vista.connected).toBe(true); // el monitor del mostrador sigue ahí

    // El transporte conserva lo que la tableta declaró (no caduca nada por su cuenta)…
    expect(caja.transport.lastDisplayCapabilitiesByOrigin.remote).toEqual(TABLETA);
    // …pero la caja solo cree a los orígenes vivos: queda el monitor, que NO es táctil.
    const vivas = combineLiveDisplayCapabilities(caja.transport.lastDisplayCapabilitiesByOrigin, caja.transport.lastDisplayCapabilities, vista.origins);
    expect(vivas).toEqual(MONITOR);
    expect(resolveNoticeTouch(vivas, undefined)).toBe(false);
    const aviso = resolveTipWaitingNotice({ phase: 'pending', displayMode: 'tip', connected: vista.connected, touch: resolveNoticeTouch(vivas, undefined), presetsCount: 3 });
    expect(aviso?.kind).toBe('informational');
    expect(aviso?.action).toBe('Continuar');
  });

  /** El caso inverso: con la tableta táctil VIVA el aviso sigue siendo de espera. */
  it('con la tableta viva el táctil sigue contando aunque el monitor local no lo sea', () => {
    const caja = armarCaja();
    caja.local.inject(alive(1, MONITOR));
    caja.remoteInner.inject(alive(1, TABLETA));

    const vista = readDisplayPresenceView(
      { isEmitting: true, lastDisplaySeenAt: caja.transport.lastDisplaySeenAt, lastDisplaySeenByOrigin: caja.transport.lastDisplaySeenByOrigin } as never,
      caja.ahora(),
    );
    expect(vista.origins).toEqual(['local', 'remote']);
    const vivas = combineLiveDisplayCapabilities(caja.transport.lastDisplayCapabilitiesByOrigin, caja.transport.lastDisplayCapabilities, vista.origins);
    expect(resolveNoticeTouch(vivas, undefined)).toBe(true);
    const aviso = resolveTipWaitingNotice({ phase: 'pending', displayMode: 'tip', connected: vista.connected, touch: resolveNoticeTouch(vivas, undefined), presetsCount: 3 });
    expect(aviso?.kind).toBe('waiting');
  });
});

describe('fan-out · el saludo retenido no se publica sin oyente', () => {
  it('una pata remota colgada tarde recibe hello+state, pero la compuerta los RETIENE hasta que alguien hable', () => {
    const local = new FakeChannel();
    let ahora = 10_000;
    const fan = createFanOutDisplayChannel([{ origin: 'local', channel: local }]);
    const transport = new BroadcastChannelTransport({ terminalId: TERMINAL, channelFactory: () => fan, now: () => ahora });
    transport.announce({ t: 'hello', sessionOpen: true } as never, { mode: 'idle' } as never);

    const remoteInner = new FakeChannel();
    const gated = createListenerGatedChannel(remoteInner, { now: () => ahora, gate: upMessageListenerGate(TERMINAL), beatIntervalMs: 0 });
    fan.addLeg({ origin: 'remote', channel: gated });
    // Sin tableta: cero mensajes por Realtime, y el hueco anotado.
    expect(remoteInner.posted).toHaveLength(0);
    expect(gated.hasPendingSnapshot).toBe(true);

    // Un `up` de OTRA terminal tampoco lo destapa.
    remoteInner.inject({ v: PROTOCOL_VERSION, terminalId: OTRA_TERMINAL, t: 'display_alive', at: 1, capabilities: TABLETA });
    expect(remoteInner.posted).toHaveLength(0);

    // La tableta de ESTA terminal sí: el emisor responde al need_snapshot.
    ahora += 1;
    remoteInner.inject(needSnapshot(TABLETA));
    expect(remoteInner.posted.length).toBeGreaterThan(0);
  });
});
