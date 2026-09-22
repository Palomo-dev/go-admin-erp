/**
 * Fase 3, parte C: el indicador del POS distingue si la pantalla viva es la
 * ventana local, la tableta remota o ambas (origen del heartbeat).
 *
 * - resolvePresentOrigins / describePresenceOrigins: criterio puro.
 * - readDisplayPresence conserva la forma exacta de F0–F2 (sin `origins`);
 *   readDisplayPresenceView / withPresenceOrigins la añaden.
 * - isSamePresence: un cambio de origen es un cambio visible.
 * - Con el transporte real sobre el canal compuesto: alive remoto → ['remote'],
 *   alive por ambos → ['local', 'remote'], bye de uno → queda el otro.
 * - El indicador mapea `both` → originBoth y la etiqueta con origen existe en
 *   los cuatro idiomas.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  DEFAULT_STALE_BY_ORIGIN,
  DISCONNECTED_PRESENCE,
  DISCONNECTED_PRESENCE_VIEW,
  describePresenceOrigins,
  isSamePresence,
  readDisplayPresence,
  readDisplayPresenceView,
  resolvePresentOrigins,
  staleForOrigin,
  withPresenceOrigins,
} from '@/lib/pos/display/presence';
import { REMOTE_STALE_AFTER_MS } from '@/lib/pos/display/supabaseBroadcastTransport';
import { createFanOutDisplayChannel } from '@/lib/pos/display/multiChannel';
import { PROTOCOL_VERSION, type UpMessage } from '@/lib/pos/display/protocol';
import { BroadcastChannelTransport, STALE_AFTER_MS, type DisplayChannel, type DisplayChannelEvent } from '@/lib/pos/display/transport';

const TERMINAL = '11111111-2222-4333-8444-555555555555';
const CAPS = { touch: false, width: 800, height: 600 };
const up = (t: UpMessage['t']): UpMessage => ({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t, at: 1, capabilities: CAPS }) as unknown as UpMessage;

class FakeChannel implements DisplayChannel {
  onmessage: ((event: DisplayChannelEvent) => void) | null = null;
  postMessage(): void {}
  close(): void {}
  inject(data: unknown): void {
    this.onmessage?.({ data });
  }
}

describe('resolvePresentOrigins / describePresenceOrigins', () => {
  it('sin mapa por origen todo cuenta como local (emisor anterior a F3-C)', () => {
    expect(resolvePresentOrigins(undefined, 1_000, 1_500)).toEqual(['local']);
    expect(resolvePresentOrigins(null, 1_000, 1_000 + STALE_AFTER_MS)).toEqual([]);
    expect(resolvePresentOrigins(undefined, null, 5)).toEqual([]);
  });

  it('con mapa: solo los orígenes frescos, en orden local → remote', () => {
    expect(resolvePresentOrigins({ local: 1_000, remote: 1_000 }, 1_000, 2_000)).toEqual(['local', 'remote']);
    expect(resolvePresentOrigins({ local: null, remote: 1_000 }, 1_000, 2_000)).toEqual(['remote']);
    // Con un umbral único explícito, los dos orígenes se juzgan igual (compatibilidad).
    expect(resolvePresentOrigins({ local: 1_000, remote: 0 }, 1_000, 4_000, STALE_AFTER_MS)).toEqual([]);
    expect(resolvePresentOrigins({ local: 0, remote: 3_000 }, 3_000, 3_500, STALE_AFTER_MS)).toEqual(['remote']);
  });

  it('por defecto cada origen lleva SU umbral: la tableta late cada 5 s y no se da por muerta a los 3 (ronda 2 · 2)', () => {
    expect(DEFAULT_STALE_BY_ORIGIN).toEqual({ local: STALE_AFTER_MS, remote: REMOTE_STALE_AFTER_MS });
    expect(staleForOrigin(DEFAULT_STALE_BY_ORIGIN, 'remote')).toBe(15_000);
    expect(staleForOrigin(777, 'remote')).toBe(777);
    // 5 s de silencio: la ventana local ya cuenta como muerta, la tableta no.
    expect(resolvePresentOrigins({ local: 0, remote: 0 }, 0, 5_000)).toEqual(['remote']);
    // 15 s: también la tableta.
    expect(resolvePresentOrigins({ local: 0, remote: 0 }, 0, REMOTE_STALE_AFTER_MS)).toEqual([]);
  });

  it('describePresenceOrigins: local / remote / both / null', () => {
    expect(describePresenceOrigins(['local'])).toBe('local');
    expect(describePresenceOrigins(['remote'])).toBe('remote');
    expect(describePresenceOrigins(['local', 'remote'])).toBe('both');
    expect(describePresenceOrigins(['remote', 'local'])).toBe('both');
    expect(describePresenceOrigins([])).toBeNull();
    expect(describePresenceOrigins(undefined)).toBeNull();
  });
});

describe('readDisplayPresence conserva su forma; la vista añade origins', () => {
  const source = (byOrigin: { local: number | null; remote: number | null } | null, seen: number | null) => ({
    lastDisplaySeenAt: seen,
    isEmitting: true,
    lastDisplaySeenByOrigin: byOrigin,
  });

  it('la instantánea de F0–F2 tiene EXACTAMENTE connected, emitting, reason y lastSeenAt', () => {
    expect(Object.keys(readDisplayPresence(source({ local: null, remote: 1_000 }, 1_000), 1_500)).sort()).toEqual(['connected', 'emitting', 'lastSeenAt', 'reason']);
    expect(Object.keys(DISCONNECTED_PRESENCE).sort()).toEqual(['connected', 'emitting', 'lastSeenAt', 'reason']);
    expect(DISCONNECTED_PRESENCE_VIEW).toEqual({ ...DISCONNECTED_PRESENCE, origins: [] });
  });

  it('readDisplayPresenceView: connected y origins coinciden; sin pantalla, origins vacío', () => {
    expect(readDisplayPresenceView(source({ local: null, remote: 1_000 }, 1_000), 1_500)).toEqual({
      connected: true,
      emitting: true,
      reason: null,
      lastSeenAt: 1_000,
      origins: ['remote'],
    });
    expect(readDisplayPresenceView(source({ local: 900, remote: 1_000 }, 1_000), 1_500).origins).toEqual(['local', 'remote']);
    expect(readDisplayPresenceView(source({ local: null, remote: 1_000 }, 1_000), 1_000 + REMOTE_STALE_AFTER_MS).origins).toEqual([]);
    expect(readDisplayPresenceView(source(null, null), 5)).toMatchObject({ connected: false, origins: [] });
  });

  it('connected sigue a origins también cuando el umbral del origen es más largo que el de la instantánea', () => {
    // Tableta vista hace 5 s: por encima de STALE_AFTER_MS, por debajo de REMOTE_STALE_AFTER_MS.
    const vista = readDisplayPresenceView(source({ local: null, remote: 0 }, 0), 5_000);
    expect(vista).toMatchObject({ connected: true, origins: ['remote'] });
    expect(describePresenceOrigins(vista.origins)).toBe('remote');
  });

  it('withPresenceOrigins no lanza aunque la fuente falle al leer el origen', () => {
    const snapshot = { connected: true, emitting: true, reason: null, lastSeenAt: 1_000 };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const throwing = {
      lastDisplaySeenAt: 1_000,
      isEmitting: true,
      get lastDisplaySeenByOrigin(): never {
        throw new Error('roto');
      },
    };
    expect(withPresenceOrigins(snapshot, throwing, 1_500)).toEqual({ ...snapshot, origins: [] });
    warn.mockRestore();
  });

  it('isSamePresence: mismo estado con distinto origen NO es igual (el indicador debe repintar); sin origins se compara como antes', () => {
    const base = { connected: true, emitting: true, reason: null, lastSeenAt: 1 };
    expect(isSamePresence({ ...base, origins: ['local'] }, { ...base, origins: ['remote'] })).toBe(false);
    expect(isSamePresence({ ...base, origins: ['local'] }, { ...base, origins: ['local', 'remote'] })).toBe(false);
    expect(isSamePresence({ ...base, origins: ['local'] }, { ...base, lastSeenAt: 99, origins: ['local'] })).toBe(true);
    expect(isSamePresence(base, { ...base, lastSeenAt: 2 })).toBe(true);
  });
});

describe('con el transporte real sobre el canal compuesto', () => {
  it('alive por la pata remota → ["remote"]; por las dos → ["local","remote"]; bye de la remota → ["local"]; silencio → []', () => {
    let now = 10_000;
    const local = new FakeChannel();
    const remote = new FakeChannel();
    const transport = new BroadcastChannelTransport({
      terminalId: TERMINAL,
      now: () => now,
      channelFactory: () =>
        createFanOutDisplayChannel([
          { origin: 'local', channel: local },
          { origin: 'remote', channel: remote },
        ]),
    });
    const source = {
      isEmitting: true,
      get lastDisplaySeenAt() {
        return transport.lastDisplaySeenAt;
      },
      get lastDisplaySeenByOrigin() {
        return transport.lastDisplaySeenByOrigin;
      },
    };
    const view = () => readDisplayPresenceView(source, now);

    expect(view()).toMatchObject({ connected: false, origins: [] });
    remote.inject(up('display_alive'));
    expect(view()).toMatchObject({ connected: true, origins: ['remote'] });
    local.inject(up('display_alive'));
    expect(view()).toMatchObject({ connected: true, origins: ['local', 'remote'] });
    // La despedida por el tubo remoto va FIRMADA con la instancia de esta caja
    // (F3-C ronda 5 · 3): es lo que hace la pantalla emparejada, y sin la firma
    // la caja la ignora y espera al silencio.
    remote.inject({ ...(up('display_bye') as unknown as Record<string, unknown>), ackInstanceId: transport.instanceId });
    expect(view()).toMatchObject({ connected: true, origins: ['local'] });
    now += STALE_AFTER_MS;
    expect(view()).toMatchObject({ connected: false, origins: [] });
    transport.close();
  });
});

describe('indicador · etiqueta con origen', () => {
  const root = path.resolve(__dirname, '../../..');
  const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

  it('el indicador lee `origins` de la presencia, mapea local/remote/both y conserva el ternario canónico de la etiqueta', () => {
    const src = read('src/components/pos/display/CustomerDisplayIndicator.tsx');
    expect(src).toMatch(/const \{ connected, emitting, reason, origins \} = useCustomerDisplayPresence\(\)/);
    expect(src).toMatch(/ORIGIN_LABEL_KEY = \{ local: 'originLocal', remote: 'originRemote', both: 'originBoth' \}/);
    expect(src).toMatch(/describePresenceOrigins\(origins\)/);
    expect(src).toMatch(/t\('indicator\.connectedWithOrigin', \{ origin: t\(`indicator\.\$\{ORIGIN_LABEL_KEY\[originKind\]\}`\) \}\)/);
    // Emparejar y revocar desde el menú, con los diálogos FUERA del DropdownMenu.
    expect(src).toMatch(/t\('menu\.pair'\)/);
    expect(src).toMatch(/t\('menu\.revoke'\)/);
    expect(src.indexOf('<PairingCodeDialog')).toBeGreaterThan(src.indexOf('</DropdownMenu>'));
    expect(src.indexOf('<RevokeRemoteDisplayDialog')).toBeGreaterThan(src.indexOf('</DropdownMenu>'));
  });

  it('el hook devuelve la vista con origins y sigue pasando el entorno al criterio de presencia', () => {
    const hook = read('src/components/pos/display/useCustomerDisplayPresence.ts');
    // Ronda 2 · 6: UNA sola lectura con UN solo `Date.now()`, y el umbral por origen.
    expect(hook).toMatch(/readDisplayPresenceView\(getPosDisplayEmitter\(\), Date\.now\(\), DEFAULT_STALE_BY_ORIGIN, getPosDisplayEnvironment\(\)\)/);
    expect((hook.match(/Date\.now\(\)/g) ?? []).length).toBe(1);
    expect(hook).toMatch(/DisplayPresenceView/);
  });

  it('indicator.connectedWithOrigin lleva {origin} y originLocal/originRemote/originBoth existen en es/en/fr/pt', () => {
    for (const loc of ['es', 'en', 'fr', 'pt']) {
      const m = JSON.parse(read(`messages/${loc}.json`)) as { posCustomerDisplay: { indicator: Record<string, string>; menu: Record<string, string> } };
      expect(m.posCustomerDisplay.indicator.connectedWithOrigin).toContain('{origin}');
      for (const k of ['originLocal', 'originRemote', 'originBoth']) expect(m.posCustomerDisplay.indicator[k].trim().length).toBeGreaterThan(0);
      for (const k of ['pair', 'revoke']) expect(m.posCustomerDisplay.menu[k].trim().length).toBeGreaterThan(0);
    }
    const es = JSON.parse(read('messages/es.json')) as { posCustomerDisplay: { indicator: Record<string, string> } };
    expect(es.posCustomerDisplay.indicator.connected).toBe('Pantalla del cliente conectada'); // el texto del PLAN no cambia
  });
});
