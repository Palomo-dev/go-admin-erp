/**
 * Fase 3, parte C (lado caja) · RONDA DE CIERRE. Cubre la lista congelada por
 * el orquestador:
 *
 * C1. La caja solo emite en remoto si está VINCULADA a la terminal Y la fila
 *     existe, activa, leída del SERVIDOR con el cliente de la sesión (RLS).
 *     Si la lectura falla o no devuelve fila: nada de canal remoto (fail
 *     closed) y el indicador del POS lo dice. La guarda circular
 *     `isRegisteredActiveTerminal` —que comparaba un id de localStorage con
 *     otro id de localStorage vía `getLinkedTerminal()`— se borró.
 * C2. `esperarSalidaAnterior` borra su entrada de `salidasEnVuelo` también al
 *     VENCER el plazo: si no, una salida que no resuelve nunca dejaba a todas
 *     las aperturas siguientes del mismo topic pagando el plazo entero.
 * C3. `upMessageListenerGate` aplica el MISMO descarte por `toInstanceId` que
 *     `receive` incluso mientras la instancia no se conoce, y un
 *     `display_bye` solo duerme la compuerta si viene firmado con la
 *     instancia que la abrió.
 * C4. El pestillo de revocación sobrevive a una recarga (estado duradero en
 *     localStorage) y solo se suelta cuando la ruta CONFIRMA un código nuevo.
 *
 * Sin nombres de organizaciones: ids y números.
 */

import { createCajaDisplayChannel } from '@/lib/pos/display/cajaChannel';
import { createListenerGatedChannel, upMessageListenerGate } from '@/lib/pos/display/multiChannel';
import { isUpMessageForInstance, PROTOCOL_VERSION, type DisplayCapabilities } from '@/lib/pos/display/protocol';
import {
  clearRemoteDisplayRevoked,
  isRemoteDisplayRevoked,
  markRemoteDisplayRevoked,
  REMOTE_DISPLAY_REVOKED_STATE_KEY,
  resetRemoteDisplayRevocations,
  type RevocationStorage,
} from '@/lib/pos/display/revocation';
import type { DisplayChannel, DisplayChannelEvent } from '@/lib/pos/display/transport';
import fs from 'fs';
import path from 'path';

const RAIZ = path.resolve(__dirname, '../../..');
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

const TERMINAL = '11111111-2222-4333-8444-555555555555';
const INSTANCIA = 'instancia-de-esta-caja';
const TABLETA: DisplayCapabilities = { touch: true, width: 800, height: 1280 };

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

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
  inject(data: unknown, origin: 'local' | 'remote' = 'remote'): void {
    this.onmessage?.({ data, origin });
  }
}

const alive = (at: number, extra: Record<string, unknown> = {}): unknown => ({
  v: PROTOCOL_VERSION,
  terminalId: TERMINAL,
  t: 'display_alive',
  at,
  capabilities: TABLETA,
  ...extra,
});

const bye = (extra: Record<string, unknown> = {}): unknown => ({
  v: PROTOCOL_VERSION,
  terminalId: TERMINAL,
  t: 'display_bye',
  ...extra,
});

/** Almacenamiento con memoria, como el localStorage de un navegador. */
function storageFalso(inicial: Record<string, string> = {}): RevocationStorage & { datos: Map<string, string> } {
  const datos = new Map<string, string>(Object.entries(inicial));
  return {
    datos,
    setItem(key: string, value: string) {
      datos.set(key, value);
    },
    getItem(key: string) {
      return datos.get(key) ?? null;
    },
  };
}

beforeEach(() => {
  resetRemoteDisplayRevocations();
});

// ---------------------------------------------------------------------------
// C1 · la pata remota solo se abre con la terminal verificada en el servidor
// ---------------------------------------------------------------------------

describe('C1 · la caja solo emite en remoto con la terminal verificada contra el servidor', () => {
  it('posDisplay.ts: la guarda exige vínculo local Y fila del servidor, y distingue «no existe» de «no se pudo comprobar»', () => {
    const src = leer('src/lib/pos/display/posDisplay.ts');
    // Ya no existe la guarda circular: nadie vuelve a leer el id de localStorage para compararlo consigo mismo.
    expect(src).not.toMatch(/await PosTerminalsService\.getLinkedTerminal\(\)/);
    expect(src).toMatch(/isRegisteredTerminal: terminalVinculadaYVerificada/);
    // 1) vínculo: el id que el transporte estampa es el vinculado en esta caja.
    expect(src).toMatch(/vinculada === null \|\| vinculada !== terminalId/);
    // 2) servidor: la fila se lee por ese id exacto con el cliente de la sesión (RLS).
    expect(src).toMatch(/PosTerminalsService\.getTerminalById\(terminalId\)/);
    // Fail closed con motivo distinguible.
    expect(src).toMatch(/estadoPataRemota = 'sin-verificar'/);
    expect(src).toMatch(/estadoPataRemota = 'sin-vinculo'/);
    expect(src).toMatch(/export function getRemoteDisplayLegStatus/);
  });

  it('posTerminalsService.getTerminalById lee por id con la sesión, devuelve null sin fila y LANZA si la consulta falla', () => {
    const src = leer('src/lib/services/posTerminalsService.ts');
    const cuerpo = src.slice(src.indexOf('static async getTerminalById'), src.indexOf('static async getLinkedTerminal'));
    expect(cuerpo).toMatch(/\.from\('pos_terminals'\)/);
    expect(cuerpo).toMatch(/\.eq\('id', id\)/);
    expect(cuerpo).toMatch(/\.eq\('organization_id', orgId\)/);
    // Sin try/catch que se trague el error: quien pregunta tiene que poder fallar cerrado con motivo.
    expect(cuerpo).toMatch(/if \(error\) throw error;/);
    expect(cuerpo).not.toMatch(/catch/);
  });

  it('el indicador del POS dice que no hay pantalla remota cuando la pata no se abrió', () => {
    const src = leer('src/components/pos/display/CustomerDisplayIndicator.tsx');
    expect(src).toMatch(/getRemoteDisplayLegStatus\(\)/);
    expect(src).toMatch(/remoteLegStatus === 'sin-vinculo'/);
    expect(src).toMatch(/remoteLegStatus === 'sin-verificar'/);
    expect(src).toMatch(/indicator\.remoteUnlinked/);
    expect(src).toMatch(/indicator\.remoteUnverified/);
    for (const idioma of ['es', 'en', 'fr', 'pt']) {
      const mensajes = JSON.parse(leer(`messages/${idioma}.json`)) as {
        posCustomerDisplay: { indicator: Record<string, string> };
      };
      expect(typeof mensajes.posCustomerDisplay.indicator.remoteUnlinked).toBe('string');
      expect(typeof mensajes.posCustomerDisplay.indicator.remoteUnverified).toBe('string');
    }
  });

  it('una comprobación que dice «no» (sin vínculo o sin poder comprobar) deja la caja muda por Realtime', async () => {
    const rt = realtimeConSalidaControlable();
    const canal = createCajaDisplayChannel(TERMINAL, {
      local: () => new FakeChannel(),
      realtime: rt.client,
      isRegisteredTerminal: async () => false,
    });
    expect(await canal.remoteAttached).toBe(false);
    expect(rt.canales).toHaveLength(0);
    canal.close();
  });

  it('una comprobación que LANZA tampoco abre el canal (fail closed, sin romper la caja)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const rt = realtimeConSalidaControlable();
    const canal = createCajaDisplayChannel(TERMINAL, {
      local: () => new FakeChannel(),
      realtime: rt.client,
      isRegisteredTerminal: async () => {
        throw new Error('sin sesión');
      },
    });
    expect(await canal.remoteAttached).toBe(false);
    expect(rt.canales).toHaveLength(0);
    canal.close();
    warn.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// C2 · la salida que no termina no hipoteca las aperturas siguientes
// ---------------------------------------------------------------------------

interface CanalDoble {
  topic: string;
  enviados: unknown[];
  entregar: (payload: unknown) => void;
}

/** Cliente de Realtime con `unsubscribe` que nunca resuelve (socket colgado). */
function realtimeConSalidaControlable(options: { salidaCuelga?: boolean } = {}) {
  const canales: CanalDoble[] = [];
  const client = {
    channel(topic: string) {
      const oyentes: Array<(m: { payload?: unknown }) => void> = [];
      const entry: CanalDoble = {
        topic,
        enviados: [],
        entregar: (payload: unknown) => oyentes.forEach((cb) => cb({ payload })),
      };
      canales.push(entry);
      const ch = {
        on: (_t: string, _filter: { event: string }, cb: (m: { payload?: unknown }) => void) => {
          oyentes.push(cb);
          return ch;
        },
        send: async (args: { event: string; payload: unknown }) => {
          entry.enviados.push(args.payload);
          return 'ok';
        },
        subscribe: (cb?: (status: string) => void) => {
          cb?.('SUBSCRIBED');
          return ch;
        },
        unsubscribe: async () => (options.salidaCuelga ? new Promise(() => undefined) : 'ok'),
      };
      return ch;
    },
    removeChannel: async () => 'ok',
  };
  return { canales, client: client as never };
}

describe('C2 · una salida que no termina se olvida al vencer el plazo', () => {
  it('el aviso de «no terminó de salir» se da UNA vez: la apertura siguiente ya no espera al muerto', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const rt = realtimeConSalidaControlable({ salidaCuelga: true });
    const deps = {
      local: () => new FakeChannel(),
      realtime: rt.client,
      isRegisteredTerminal: async () => true,
      salidaTimeoutMs: 20,
    };

    const primero = createCajaDisplayChannel(TERMINAL, deps);
    expect(await primero.remoteAttached).toBe(true);
    primero.close(); // su `leaving` no resolverá NUNCA: queda anotado en salidasEnVuelo

    const segundo = createCajaDisplayChannel(TERMINAL, deps);
    expect(await segundo.remoteAttached).toBe(true);
    const avisos = () => warn.mock.calls.filter((c) => String(c[0]).includes('no terminó de salir')).length;
    expect(avisos()).toBe(1);

    // El segundo sigue abierto (no vuelve a anotar salida). Antes de la ronda
    // de cierre la entrada seguía en el mapa y este tercero volvía a esperar el
    // plazo entero y a avisar; ahora no hay a quién esperar.
    const tercero = createCajaDisplayChannel(TERMINAL, deps);
    expect(await tercero.remoteAttached).toBe(true);
    expect(avisos()).toBe(1);

    segundo.close();
    tercero.close();
    await flush();
    warn.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// C3 · los dos abusos de la compuerta de oyente
// ---------------------------------------------------------------------------

describe('C3 · abuso 1: un `up` DIRIGIDO a otra instancia no abre la pata mientras la instancia no se conoce', () => {
  it('lo que el transporte descarta siempre, la compuerta ya no lo acepta ni con la instancia sin resolver', () => {
    const inner = new FakeChannel();
    // La celda de instancia del transporte todavía está vacía (el canal se abre
    // DENTRO del constructor): así era como se colaba el mensaje dirigido.
    const instancia: { id: string | null } = { id: null };
    const gated = createListenerGatedChannel(inner, {
      now: () => 0,
      gate: upMessageListenerGate(TERMINAL, () => instancia.id),
      beatIntervalMs: 0,
    });
    gated.onmessage = () => undefined;

    const dirigidoAOtra = alive(1, { toInstanceId: 'instancia-de-otra-pestana' });
    inner.inject(dirigidoAOtra);
    expect(gated.hasListener).toBe(false);
    gated.postMessage({ t: 'state', state: { total: 987654 } });
    expect(inner.posted).toHaveLength(0);

    // Y es EXACTAMENTE lo que `receive` haría con ese mensaje (su instanceId nunca es null).
    instancia.id = INSTANCIA;
    expect(isUpMessageForInstance(dirigidoAOtra, TERMINAL, INSTANCIA)).toBe(false);

    // La pantalla legítima —que sigue a ESTA caja— sí la abre, y sale el state retenido.
    inner.inject(alive(2, { toInstanceId: INSTANCIA }));
    expect(gated.hasListener).toBe(true);
    expect(inner.posted).toHaveLength(1);
  });
});

describe('C3 · abuso 2: un `display_bye` forjado no duerme la pata remota', () => {
  it('solo cierra la despedida firmada con la instancia que ABRIÓ la compuerta', () => {
    const inner = new FakeChannel();
    const gated = createListenerGatedChannel(inner, {
      now: () => 0,
      gate: upMessageListenerGate(TERMINAL, () => INSTANCIA),
      beatIntervalMs: 0,
    });
    gated.onmessage = () => undefined;

    inner.inject(alive(1));
    expect(gated.hasListener).toBe(true);

    // Cualquier miembro activo de la sucursal puede escribir en el canal y el
    // terminalId va en el nombre del topic: una despedida anónima o firmada con
    // otra instancia es trivial de construir y no puede apagar la pantalla.
    inner.inject(bye());
    expect(gated.hasListener).toBe(true);
    inner.inject(bye({ ackInstanceId: 'instancia-de-un-tercero' }));
    expect(gated.hasListener).toBe(true);
    gated.postMessage({ t: 'state', state: { total: 4200 } });
    expect(inner.posted).toHaveLength(1);

    // La pantalla que de verdad seguía a esta caja sí se despide.
    inner.inject(bye({ ackInstanceId: INSTANCIA }));
    expect(gated.hasListener).toBe(false);
  });

  it('con la instancia aún sin conocer, NINGUNA despedida cierra: se prefiere caducar por silencio', () => {
    const inner = new FakeChannel();
    const gated = createListenerGatedChannel(inner, {
      now: () => 0,
      gate: upMessageListenerGate(TERMINAL, () => null),
      beatIntervalMs: 0,
    });
    gated.onmessage = () => undefined;

    inner.inject(alive(1));
    expect(gated.hasListener).toBe(true);
    inner.inject(bye());
    inner.inject(bye({ ackInstanceId: INSTANCIA }));
    expect(gated.hasListener).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// C4 · el pestillo de revocación sobrevive a la recarga y se suelta cuando toca
// ---------------------------------------------------------------------------

describe('C4 · el pestillo de revocación es duradero', () => {
  it('se guarda un MAPA: revocar A y emparejar B después no suelta el pestillo de A', () => {
    const otra = '99999999-2222-4333-8444-555555555555';
    const storage = storageFalso();
    markRemoteDisplayRevoked(TERMINAL, storage);
    markRemoteDisplayRevoked(otra, storage);
    clearRemoteDisplayRevoked(otra, storage);

    const guardado = JSON.parse(storage.datos.get(REMOTE_DISPLAY_REVOKED_STATE_KEY) ?? '{}') as Record<string, number>;
    expect(Object.keys(guardado)).toEqual([TERMINAL]);
    expect(typeof guardado[TERMINAL]).toBe('number');

    // Una carga posterior (mismo navegador, módulo recién evaluado) lo recupera.
    resetRemoteDisplayRevocations();
    expect(isRemoteDisplayRevoked(TERMINAL, storage)).toBe(true);
    expect(isRemoteDisplayRevoked(otra, storage)).toBe(false);
  });

  it('soltar el pestillo se guarda también: la carga siguiente ya no lo encuentra', () => {
    const storage = storageFalso();
    markRemoteDisplayRevoked(TERMINAL, storage);
    clearRemoteDisplayRevoked(TERMINAL, storage);
    resetRemoteDisplayRevocations();
    expect(isRemoteDisplayRevoked(TERMINAL, storage)).toBe(false);
  });

  it('un estado guardado ilegible no rompe la caja ni echa pestillos que nadie pidió', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const storage = storageFalso({ [REMOTE_DISPLAY_REVOKED_STATE_KEY]: '{no es json' });
    expect(isRemoteDisplayRevoked(TERMINAL, storage)).toBe(false);
    warn.mockRestore();

    const lista = storageFalso({ [REMOTE_DISPLAY_REVOKED_STATE_KEY]: '["' + TERMINAL + '"]' });
    resetRemoteDisplayRevocations();
    expect(isRemoteDisplayRevoked(TERMINAL, lista)).toBe(false);
  });

  it('el pestillo echado en esta carga manda sobre un estado guardado más viejo (la hidratación solo añade)', () => {
    const storage = storageFalso();
    markRemoteDisplayRevoked(TERMINAL, null); // pestillo en memoria, sin almacenamiento
    expect(isRemoteDisplayRevoked(TERMINAL, storage)).toBe(true);
  });

  it('el diálogo de emparejamiento solo suelta el pestillo con un código NUEVO confirmado, no al abrirse', () => {
    const src = leer('src/components/pos/display/PairingCodeDialog.tsx');
    expect(src).toMatch(/const emitidoNuevo = next\.reused === false && options\.reuse !== true;/);
    expect(src).toMatch(/if \(emitidoNuevo\) clearRemoteDisplayRevoked\(terminalId\);/);
    // La petición automática de apertura pide `reuse: true`, así que nunca suelta el pestillo.
    expect(src).toMatch(/void request\(\{ reuse: true \}\)/);
  });
});
