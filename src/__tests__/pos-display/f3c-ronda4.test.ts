/**
 * Fase 3, parte C · ronda 4 (correcciones de QA y tester).
 *
 * 1 y 2. Capacidades de la pantalla POR ORIGEN: con un monitor no táctil en
 *    este equipo y una tableta táctil emparejada, la caja creía la de la
 *    ÚLTIMA que hablaba y el aviso de propina del cajero cambiaba de texto y
 *    de botón cada 5 s; y el `display_bye` de la tableta borraba también lo
 *    que la caja sabía del monitor local, que seguía vivo.
 * 4. La compuerta del tubo remoto aplica el MISMO filtro que el transporte,
 *    incluido `toInstanceId`: un mensaje dirigido a OTRA pestaña de la misma
 *    caja no debe despertar la pata remota de esta.
 *
 * Sin React, sin Supabase: transporte real sobre canales falsos.
 */

import { DisplayEmitter } from '@/lib/pos/display/emitter';
import { createFanOutDisplayChannel, createListenerGatedChannel, upMessageListenerGate } from '@/lib/pos/display/multiChannel';
import { PROTOCOL_VERSION, isUpMessageForInstance, type DisplayCapabilities, type UpMessage } from '@/lib/pos/display/protocol';
import { resolveNoticeTouch, resolveTipWaitingNotice } from '@/components/pos/display/tipNotice';
import {
  BroadcastChannelTransport,
  combineDisplayCapabilities,
  type DisplayChannel,
  type DisplayChannelEvent,
} from '@/lib/pos/display/transport';

const TERMINAL = '11111111-2222-4333-8444-555555555555';
/** Monitor del mostrador: apaisado y SIN táctil. */
const MONITOR: DisplayCapabilities = { touch: false, width: 1920, height: 1080 };
/** Tableta del cliente: vertical y táctil. */
const TABLETA: DisplayCapabilities = { touch: true, width: 800, height: 1280 };

class FakeChannel implements DisplayChannel {
  posted: unknown[] = [];
  onmessage: ((event: DisplayChannelEvent) => void) | null = null;
  postMessage(msg: unknown): void {
    this.posted.push(msg);
  }
  close(): void {}
  inject(data: unknown): void {
    this.onmessage?.({ data });
  }
}

function alive(capabilities: DisplayCapabilities, at = 1, extra: Record<string, unknown> = {}): UpMessage {
  return { v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'display_alive', at, capabilities, ...extra } as unknown as UpMessage;
}
function bye(extra: Record<string, unknown> = {}): UpMessage {
  return { v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'display_bye', ...extra } as unknown as UpMessage;
}
function needSnapshot(capabilities: DisplayCapabilities, extra: Record<string, unknown> = {}): UpMessage {
  return { v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'need_snapshot', capabilities, ...extra } as unknown as UpMessage;
}

describe('combineDisplayCapabilities (ronda 4 · 1)', () => {
  it('sin pantallas vivas → null; una sola → la suya', () => {
    expect(combineDisplayCapabilities({ local: null, remote: null }, { local: null, remote: null })).toBeNull();
    // Capacidades anotadas pero sin señal (se despidió): no cuenta.
    expect(combineDisplayCapabilities({ local: MONITOR, remote: null }, { local: null, remote: null })).toBeNull();
    expect(combineDisplayCapabilities({ local: MONITOR, remote: null }, { local: 10, remote: null })).toEqual(MONITOR);
    expect(combineDisplayCapabilities({ local: null, remote: TABLETA }, { local: null, remote: 10 })).toEqual(TABLETA);
  });

  it('con las dos vivas: táctil si ALGUNA lo es, y el resto de la primera en orden canónico (fijo)', () => {
    const ambas = combineDisplayCapabilities({ local: MONITOR, remote: TABLETA }, { local: 10, remote: 20 });
    expect(ambas).toEqual({ touch: true, width: MONITOR.width, height: MONITOR.height });
    // El orden en que hablaron NO cambia el resultado: es lo que hacía parpadear el aviso.
    expect(combineDisplayCapabilities({ local: MONITOR, remote: TABLETA }, { local: 99, remote: 1 })).toEqual(ambas);
    // Dos no táctiles siguen siendo no táctiles.
    expect(combineDisplayCapabilities({ local: MONITOR, remote: MONITOR }, { local: 1, remote: 2 })?.touch).toBe(false);
  });
});

describe('BroadcastChannelTransport · capacidades por origen', () => {
  function armar() {
    const local = new FakeChannel();
    const remote = new FakeChannel();
    const fan = createFanOutDisplayChannel([
      { origin: 'local', channel: local },
      { origin: 'remote', channel: remote },
    ]);
    let ahora = 1000;
    const transport = new BroadcastChannelTransport({ terminalId: TERMINAL, channelFactory: () => fan, now: () => ahora });
    return { local, remote, transport, avanzar: (ms: number) => (ahora += ms) };
  }

  it('anota las de cada tubo por separado y las combina (ronda 4 · 1)', () => {
    const { local, remote, transport } = armar();
    local.inject(alive(MONITOR));
    expect(transport.lastDisplayCapabilitiesByOrigin).toEqual({ local: MONITOR, remote: null });
    remote.inject(alive(TABLETA));
    expect(transport.lastDisplayCapabilitiesByOrigin).toEqual({ local: MONITOR, remote: TABLETA });
    // Y lo que la caja cree es UNA sola cosa, no la última que habló.
    expect(transport.lastDisplayCapabilities).toEqual({ touch: true, width: 1920, height: 1080 });
    local.inject(alive(MONITOR));
    expect(transport.lastDisplayCapabilities).toEqual({ touch: true, width: 1920, height: 1080 });
  });

  it('un `display_bye` remoto NO borra lo que la caja sabe del monitor local (ronda 4 · 2)', () => {
    const { local, remote, transport, avanzar } = armar();
    local.inject(alive(MONITOR));
    remote.inject(alive(TABLETA));
    avanzar(500);
    // Firmada con la instancia de esta caja: por el tubo remoto una despedida
    // anónima ya no borra nada (F3-C ronda 5 · 3).
    remote.inject(bye({ ackInstanceId: transport.instanceId }));
    expect(transport.lastDisplaySeenByOrigin).toEqual({ local: 1000, remote: null });
    expect(transport.lastDisplayCapabilitiesByOrigin).toEqual({ local: MONITOR, remote: null });
    // La caja vuelve a saber que el monitor del mostrador no es táctil, no «no sé nada».
    expect(transport.lastDisplayCapabilities).toEqual(MONITOR);
    expect(resolveNoticeTouch(transport.lastDisplayCapabilities, undefined)).toBe(false);
  });

  it('el `display_bye` de las DOS deja las capacidades en null', () => {
    const { local, remote, transport } = armar();
    local.inject(alive(MONITOR));
    remote.inject(alive(TABLETA));
    local.inject(bye());
    remote.inject(bye({ ackInstanceId: transport.instanceId }));
    expect(transport.lastDisplayCapabilities).toBeNull();
  });

  it('`need_snapshot` también anota por origen', () => {
    const { remote, transport } = armar();
    remote.inject(needSnapshot(TABLETA));
    expect(transport.lastDisplayCapabilitiesByOrigin).toEqual({ local: null, remote: TABLETA });
  });
});

describe('DisplayEmitter · el aviso de propina no parpadea con dos pantallas heterogéneas (ronda 4 · 1)', () => {
  it('diez latidos con la ventana local a 1 s y la tableta a 5 s: UN solo valor avisado', () => {
    const local = new FakeChannel();
    const remote = new FakeChannel();
    const fan = createFanOutDisplayChannel([
      { origin: 'local', channel: local },
      { origin: 'remote', channel: remote },
    ]);
    let ahora = 0;
    const emitter = new DisplayEmitter({
      createTransport: () => new BroadcastChannelTransport({ terminalId: TERMINAL, channelFactory: () => fan, now: () => ahora }),
      isEnabled: () => true,
      schedule: () => () => undefined,
    });
    emitter.start({ organizationId: 120, currency: 'COP' });

    const avisos: Array<boolean | null> = [];
    emitter.onDisplayCapabilitiesChange((c) => avisos.push(c === null ? null : c.touch));

    // Arranque: el monitor local se anuncia y, justo después, la tableta. Dos
    // avisos, y los dos son cambios DE VERDAD (primero solo se conocía el
    // monitor; luego apareció una pantalla táctil).
    local.inject(alive(MONITOR, 0));
    remote.inject(alive(TABLETA, 0));
    expect(avisos).toEqual([false, true]);

    // Diez segundos de latidos heterogéneos sin que nada cambie de verdad.
    avisos.length = 0;
    for (let s = 1; s <= 10; s++) {
      ahora = s * 1000;
      local.inject(alive(MONITOR, ahora));
      if (s % 5 === 0) remote.inject(alive(TABLETA, ahora));
    }

    // Antes salía [false, true, false, true]: alternaba cada 5 s para siempre.
    expect(avisos).toEqual([]);
    // Y el texto del aviso ya no cambia mientras la situación no cambie.
    const touch = resolveNoticeTouch(emitter.lastDisplayCapabilities, undefined);
    expect(touch).toBe(true);
    expect(resolveTipWaitingNotice({ phase: 'pending', displayMode: 'tip', connected: true, touch, presetsCount: 3 })?.kind).toBe('waiting');
    emitter.stop();
  });
});

describe('upMessageListenerGate · mismo filtro que el transporte (ronda 4 · 4)', () => {
  const INSTANCIA = 'instancia-de-esta-ventana';

  it('un `up` dirigido a OTRA instancia ni abre la compuerta ni saca el carrito por el tubo remoto', () => {
    const inner = new FakeChannel();
    const gated = createListenerGatedChannel(inner, {
      now: () => 0,
      gate: upMessageListenerGate(TERMINAL, () => INSTANCIA),
      beatIntervalMs: 0,
    });
    gated.onmessage = () => undefined;

    inner.inject(alive(MONITOR, 1, { toInstanceId: 'instancia-de-otra-pestana' }));
    expect(gated.hasListener).toBe(false);
    gated.postMessage({ t: 'state', state: { total: 123456 } });
    expect(inner.posted).toHaveLength(0);

    // El mismo mensaje para ESTA instancia sí la despierta: entonces sale el
    // `state` que la compuerta había RETENIDO (ronda 3 · 1) y el siguiente.
    inner.inject(alive(MONITOR, 2, { toInstanceId: INSTANCIA }));
    expect(gated.hasListener).toBe(true);
    expect(inner.posted).toHaveLength(1);
    gated.postMessage({ t: 'state', state: { total: 123456 } });
    expect(inner.posted).toHaveLength(2);
  });

  it('sin destinatario (presencia) despierta siempre; con la instancia aún sin conocer, un mensaje DIRIGIDO no abre (ronda 4 · C3)', () => {
    const inner = new FakeChannel();
    const gated = createListenerGatedChannel(inner, { now: () => 0, gate: upMessageListenerGate(TERMINAL, () => INSTANCIA), beatIntervalMs: 0 });
    gated.onmessage = () => undefined;
    inner.inject(alive(MONITOR));
    expect(gated.hasListener).toBe(true);

    // Antes de la ronda 4 · C3 esto «se comportaba como antes»: sin instancia
    // conocida no se comparaba el destinatario y un `up` dirigido a OTRA
    // pestaña abría la pata remota, justo lo que el transporte descarta
    // siempre (su `instanceId` nunca es null). Ahora se falla cerrado.
    const otro = new FakeChannel();
    const sinInstancia = createListenerGatedChannel(otro, { now: () => 0, gate: upMessageListenerGate(TERMINAL, () => null), beatIntervalMs: 0 });
    sinInstancia.onmessage = () => undefined;
    otro.inject(alive(MONITOR, 1, { toInstanceId: 'cualquiera' }));
    expect(sinInstancia.hasListener).toBe(false);

    // Lo que NO va dirigido a nadie sigue despertando aunque la instancia no se conozca.
    otro.inject(alive(MONITOR, 2));
    expect(sinInstancia.hasListener).toBe(true);
  });

  it('el predicado es UNO: lo que la compuerta ignora es exactamente lo que `receive` descarta', () => {
    const local = new FakeChannel();
    const fan = createFanOutDisplayChannel([{ origin: 'local', channel: local }]);
    const transport = new BroadcastChannelTransport({ terminalId: TERMINAL, channelFactory: () => fan, now: () => 1000, __testInstanceId: INSTANCIA });
    const gate = upMessageListenerGate(TERMINAL, () => INSTANCIA);

    const casos: unknown[] = [
      alive(MONITOR, 1, { toInstanceId: 'otra' }),
      alive(MONITOR, 1, { terminalId: '99999999-2222-4333-8444-555555555555' }),
      'basura',
      { v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'tip_selected', cartId: 'c1', kind: 'percent', value: 10, toInstanceId: 'otra' },
    ];
    for (const caso of casos) {
      expect(gate(caso)).toBe('ignora');
      expect(isUpMessageForInstance(caso, TERMINAL, INSTANCIA)).toBe(false);
      local.inject(caso);
      expect(transport.lastDisplaySeenAt).toBeNull();
    }
    // Y lo que sí es para esta instancia, las dos lo aceptan.
    const bueno = alive(MONITOR, 1, { toInstanceId: INSTANCIA });
    expect(gate(bueno)).toBe('abre');
    local.inject(bueno);
    expect(transport.lastDisplaySeenAt).toBe(1000);
  });
});
