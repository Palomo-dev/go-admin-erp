/**
 * TESTER · Fase 3, parte C (lado caja) · ronda 3 sobre la entrega de la
 * ronda 5 del builder. Fase de SEGURIDAD: estos tests INTENTAN ROMPER las
 * defensas nuevas, no confirmarlas.
 *
 * Cada `describe` corresponde a un ataque. Los que están marcados como
 * DEFECTO fallan a propósito contra el código actual: documentan el agujero
 * con los pasos exactos para reproducirlo. No se arregla nada aquí.
 */

import { createCajaDisplayChannel } from '@/lib/pos/display/cajaChannel';
import { PROTOCOL_VERSION, type DisplayCapabilities } from '@/lib/pos/display/protocol';
import {
  markRemoteDisplayRevoked,
  REMOTE_DISPLAY_REVOKED_KEY,
  resetRemoteDisplayRevocations,
} from '@/lib/pos/display/revocation';
import type { DisplayChannel, DisplayChannelEvent } from '@/lib/pos/display/transport';

const TERMINAL = '11111111-2222-4333-8444-555555555555';
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
}

const alive = (at: number): unknown => ({
  v: PROTOCOL_VERSION,
  terminalId: TERMINAL,
  t: 'display_alive',
  at,
  capabilities: TABLETA,
});

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

interface CanalFalso {
  name: string;
  sent: Array<{ event: string; payload: unknown }>;
  listeners: Map<string, (m: { payload?: unknown }) => void>;
}

function fakeRealtime() {
  const channels: CanalFalso[] = [];
  const client = {
    channel(name: string) {
      const entry: CanalFalso = { name, sent: [], listeners: new Map() };
      channels.push(entry);
      const ch = {
        on: (_t: string, filter: { event: string }, cb: (m: { payload?: unknown }) => void) => {
          entry.listeners.set(filter.event, cb);
          return ch;
        },
        send: async (args: { event: string; payload: unknown }) => {
          entry.sent.push({ event: args.event, payload: args.payload });
          return 'ok';
        },
        subscribe: (cb?: (status: string) => void) => {
          cb?.('SUBSCRIBED');
          return ch;
        },
        unsubscribe: async () => 'ok',
      };
      return ch;
    },
    removeChannel: async () => 'ok',
  };
  return { channels, client: client as never };
}

/** La tableta REVOCADA ignora su 401 y sigue latiendo con el JWT que le queda (<= 5 min). */
function tabletaRevocadaLatiendo(entry: CanalFalso) {
  const listener = [...entry.listeners.values()][0];
  listener?.({ payload: alive(1) });
}

/** Almacenamiento mínimo que recuerda lo escrito, como el localStorage de un navegador real. */
function storageFalso() {
  const datos = new Map<string, string>();
  return {
    datos,
    setItem(key: string, value: string) {
      datos.set(key, value);
    },
  };
}

beforeEach(() => {
  resetRemoteDisplayRevocations();
});

// ---------------------------------------------------------------------------
// ATAQUE 1 · recargar la caja borra el pestillo de «Revocar»
// ---------------------------------------------------------------------------

describe('DEFECTO · el pestillo de revocación no sobrevive a una recarga de la caja', () => {
  it('tras revocar y RECARGAR la página, la pata remota vuelve a nacer abierta y la tableta revocada recibe el carrito', async () => {
    // 1. El administrador revoca. Se escribe la marca en localStorage (es lo
    //    único que el módulo persiste) y la pata queda cerrada en esta carga.
    const storage = storageFalso();
    markRemoteDisplayRevoked(TERMINAL, storage);
    expect(storage.datos.get(REMOTE_DISPLAY_REVOKED_KEY)).toContain(TERMINAL);

    // 2. El cajero recarga el POS (F5). Los módulos se reevalúan: el `Set`
    //    `revocadas` nace vacío. Nada lee REMOTE_DISPLAY_REVOKED_KEY al
    //    arrancar, así que el pestillo se pierde aunque la marca siga ahí.
    jest.resetModules();
    const { createCajaDisplayChannel: crearTrasRecarga } = await import('@/lib/pos/display/cajaChannel');
    const { isRemoteDisplayRevoked: revocadaTrasRecarga } = await import('@/lib/pos/display/revocation');

    // ESPERADO: la caja recién cargada sabe que esta terminal está revocada.
    expect(revocadaTrasRecarga(TERMINAL)).toBe(true);

    // 3. Y por tanto la pata remota no debe publicar nada aunque la tableta
    //    revocada siga latiendo con su JWT de Realtime todavía vivo.
    const rt = fakeRealtime();
    const canal = crearTrasRecarga(TERMINAL, {
      local: () => new FakeChannel(),
      realtime: rt.client,
      isRegisteredTerminal: async () => true,
    });
    expect(await canal.remoteAttached).toBe(true);
    const entry = rt.channels[0];

    tabletaRevocadaLatiendo(entry);
    canal.postMessage({ v: PROTOCOL_VERSION, seq: 1, terminalId: TERMINAL, instanceId: 'i1', t: 'state', state: { mode: 'order' } });

    // ESPERADO: cero mensajes hacia el dispositivo revocado.
    expect(entry.sent).toHaveLength(0);

    canal.close();
    await flush();
  });
});

// ---------------------------------------------------------------------------
// ATAQUE 2 · la marca de OTRA ventana no se aplica si la caja arranca después
// ---------------------------------------------------------------------------

describe('DEFECTO · revocar desde Configuración no alcanza a una caja que se abre después', () => {
  it('la marca ya escrita en localStorage no cierra la pata de una pestaña de POS abierta a continuación', async () => {
    // El administrador revoca desde la tarjeta de Configuración (otra pestaña).
    // El evento `storage` solo llega a las pestañas YA abiertas; una pestaña de
    // POS que se abre después solo tiene la marca en localStorage.
    const storage = storageFalso();
    markRemoteDisplayRevoked(TERMINAL, storage);

    jest.resetModules();
    const { isRemoteDisplayRevoked: revocadaEnPestanaNueva } = await import('@/lib/pos/display/revocation');

    // ESPERADO: la pestaña nueva lee la marca al arrancar y nace con el pestillo echado.
    expect(revocadaEnPestanaNueva(TERMINAL)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CONTROL · lo que SÍ funciona dentro de una misma carga (no debe romperse)
// ---------------------------------------------------------------------------

describe('control · dentro de la misma carga el pestillo sí corta', () => {
  it('revocar con la pata colgada deja la pata muda y sorda', async () => {
    const rt = fakeRealtime();
    const canal = createCajaDisplayChannel(TERMINAL, {
      local: () => new FakeChannel(),
      realtime: rt.client,
      isRegisteredTerminal: async () => true,
    });
    expect(await canal.remoteAttached).toBe(true);
    const entry = rt.channels[0];

    tabletaRevocadaLatiendo(entry);
    canal.postMessage({ v: PROTOCOL_VERSION, seq: 1, terminalId: TERMINAL, instanceId: 'i1', t: 'state', state: { mode: 'order' } });
    expect(entry.sent).toHaveLength(1);

    markRemoteDisplayRevoked(TERMINAL, null);
    tabletaRevocadaLatiendo(entry);
    canal.postMessage({ v: PROTOCOL_VERSION, seq: 2, terminalId: TERMINAL, instanceId: 'i1', t: 'state', state: { mode: 'payment' } });
    expect(entry.sent).toHaveLength(1);

    canal.close();
    await flush();
  });
});
