/**
 * Canal de la pantalla del cliente sobre el relay de Go Admin Desktop.
 *
 * Se simula el proceso principal con un bus en memoria que replica la
 * semántica acordada: `send` entrega a TODOS los renderers menos al emisor.
 * Encima corren el transporte y el receptor reales, sin BroadcastChannel.
 */
import { BroadcastChannelReceiver, BroadcastChannelTransport, displayChannelName } from '@/lib/pos/display/transport';
import {
  createDesktopDisplayChannel,
  isDesktopDisplayBridgeAvailable,
  isDisplayTransportAvailable,
  resolveDisplayChannelFactory,
} from '@/lib/pos/display/desktopChannel';
import type { DisplayState } from '@/lib/pos/display/protocol';

type Handler = (payload: unknown) => void;

/** Bus que imita electron/src/main/broadcast.ts: cada renderer tiene su propio puente. */
class FakeMainProcess {
  private readonly renderers = new Map<string, Set<Handler>>();

  bridgeFor(rendererId: string) {
    const handlers = new Set<Handler>();
    this.renderers.set(rendererId, handlers);
    return {
      send: (payload: unknown) => {
        // structured clone: lo que cruza el IPC nunca es la misma referencia, y
        // llega en otra vuelta del bucle de eventos, como el IPC real.
        const cloned = JSON.parse(JSON.stringify(payload)) as unknown;
        setTimeout(() => {
          for (const [id, set] of this.renderers) {
            if (id === rendererId) continue;
            for (const h of set) h(cloned);
          }
        }, 0);
      },
      onMessage: (handler: Handler) => {
        handlers.add(handler);
        return () => handlers.delete(handler);
      },
    };
  }
}

const TERMINAL = '11111111-1111-4111-8111-111111111111';
const OTRA_TERMINAL = '22222222-2222-4222-8222-222222222222';

function instalarPuente(bridge: ReturnType<FakeMainProcess['bridgeFor']> | undefined) {
  const w = globalThis as unknown as { window?: { goAdminDesktop?: { posDisplay?: unknown } } };
  if (!w.window) w.window = {};
  w.window.goAdminDesktop = bridge ? { posDisplay: bridge } : undefined;
}

const estadoVacio: DisplayState = { mode: 'idle', cart: null, payment: null, tip: null, thanks: null };

/** Deja pasar las vueltas del bucle que necesita el relay (dos saltos: subida y bajada). */
const relay = () => new Promise<void>((r) => setTimeout(r, 15));

afterEach(() => {
  instalarPuente(undefined);
});

describe('desktopChannel', () => {
  test('sin puente no está disponible y la fábrica es undefined (cae a BroadcastChannel)', () => {
    instalarPuente(undefined);
    expect(isDesktopDisplayBridgeAvailable()).toBe(false);
    expect(resolveDisplayChannelFactory()).toBeUndefined();
    // En Node ≥ 18 BroadcastChannel existe, así que el transporte sigue disponible.
    expect(isDisplayTransportAvailable()).toBe(true);
  });

  test('con puente, la fábrica crea canales y hello/state cruzan de la caja a la pantalla', async () => {
    const main = new FakeMainProcess();
    const caja = main.bridgeFor('caja');
    const pantalla = main.bridgeFor('pantalla');

    instalarPuente(caja);
    expect(isDesktopDisplayBridgeAvailable()).toBe(true);
    const transporte = new BroadcastChannelTransport({ terminalId: TERMINAL, channelFactory: createDesktopDisplayChannel });
    // Flujo real: la pantalla pide need_snapshot y la caja responde con announce(hello, state).
    transporte.onUp((msg) => {
      if (msg.t === 'need_snapshot') transporte.announce({ t: 'hello', organizationId: 1, cashier: { name: 'Caja 1' }, sessionOpen: true }, estadoVacio);
    });

    instalarPuente(pantalla);
    const receptor = new BroadcastChannelReceiver({ terminalId: TERMINAL, channelFactory: createDesktopDisplayChannel, presenceIntervalMs: 0 });
    const recibidos: string[] = [];
    receptor.onDown((msg) => recibidos.push(msg.t));

    receptor.send({ t: 'need_snapshot', capabilities: { touch: true, width: 1920, height: 1080 } });
    await relay();
    await relay();

    expect(recibidos).toEqual(['hello', 'state']);
    expect(receptor.activeInstanceId).toBe(transporte.instanceId);

    receptor.close();
    transporte.close(false);
  });

  test('la subida (need_snapshot) llega a la caja por el mismo relay', async () => {
    const main = new FakeMainProcess();
    const caja = main.bridgeFor('caja');
    const pantalla = main.bridgeFor('pantalla');

    instalarPuente(caja);
    const transporte = new BroadcastChannelTransport({ terminalId: TERMINAL, channelFactory: createDesktopDisplayChannel });
    const subidas: string[] = [];
    transporte.onUp((msg) => subidas.push(msg.t));

    instalarPuente(pantalla);
    const receptor = new BroadcastChannelReceiver({ terminalId: TERMINAL, channelFactory: createDesktopDisplayChannel, presenceIntervalMs: 0 });
    receptor.send({ t: 'need_snapshot', capabilities: { touch: false, width: 1024, height: 768 } });
    await relay();

    expect(subidas).toEqual(['need_snapshot']);

    receptor.close();
    transporte.close(false);
  });

  test('el filtrado por canal separa dos cajas en la misma máquina', async () => {
    const main = new FakeMainProcess();
    const caja = main.bridgeFor('caja');
    const pantallaOtra = main.bridgeFor('pantalla-otra');

    instalarPuente(caja);
    const transporte = new BroadcastChannelTransport({ terminalId: TERMINAL, channelFactory: createDesktopDisplayChannel });

    instalarPuente(pantallaOtra);
    const receptorOtra = new BroadcastChannelReceiver({ terminalId: OTRA_TERMINAL, channelFactory: createDesktopDisplayChannel, presenceIntervalMs: 0 });
    const recibidos: string[] = [];
    receptorOtra.onDown((msg) => recibidos.push(msg.t));

    transporte.announce({ t: 'hello', organizationId: 1, cashier: null, sessionOpen: false }, estadoVacio);
    await relay();
    expect(recibidos).toEqual([]);

    receptorOtra.close();
    transporte.close(false);
  });

  test('quien envía no se recibe a sí mismo, y close() da de baja el listener', async () => {
    const main = new FakeMainProcess();
    const solo = main.bridgeFor('solo');
    instalarPuente(solo);

    const canal = createDesktopDisplayChannel(TERMINAL);
    const vistos: unknown[] = [];
    canal.onmessage = (ev) => vistos.push(ev.data);
    canal.postMessage({ hola: 1 });
    await relay();
    expect(vistos).toEqual([]);

    const otro = main.bridgeFor('otro');
    canal.close();
    otro.send({ channel: displayChannelName(TERMINAL), data: { tarde: true } });
    await relay();
    expect(vistos).toEqual([]);
  });

  test('un payload que no es sobre del relay se ignora sin romper', async () => {
    const main = new FakeMainProcess();
    const a = main.bridgeFor('a');
    const b = main.bridgeFor('b');
    instalarPuente(a);
    const canal = createDesktopDisplayChannel(TERMINAL);
    const vistos: unknown[] = [];
    canal.onmessage = (ev) => vistos.push(ev.data);
    b.send('basura');
    b.send({ channel: 42, data: 1 });
    b.send(null);
    await relay();
    expect(vistos).toEqual([]);
    canal.close();
  });
});
