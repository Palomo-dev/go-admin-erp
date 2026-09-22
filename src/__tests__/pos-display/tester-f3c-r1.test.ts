/**
 * QA adversarial de la Fase 3, parte C (lado caja), ronda 1.
 *
 * No repite lo que ya prueban f3c-*.test.ts: aquí se intenta ROMPER la
 * compuerta de oyente y el canal compuesto con datos que el propio
 * transporte descarta, y se fijan las guardas estáticas de seguridad
 * (middleware, `pos_terminal_secrets`, service-role fuera del navegador).
 *
 * Los tests que documentaban un DEFECTO en la ronda 1 llevan ahora
 * «CORREGIDO (ronda 2 · N)» y fijan el comportamiento arreglado, para que el
 * defecto no vuelva. Se añade además el bloque que fija la expresión de la
 * política del canal Realtime de la caja (qa crítico 1), que es lo que impide
 * que el canal de una terminal siga abierto a toda la organización.
 */

import fs from 'fs';
import path from 'path';
import { createFanOutDisplayChannel, createListenerGatedChannel, upMessageListenerGate, REMOTE_LISTENER_TTL_MS } from '@/lib/pos/display/multiChannel';
import { createCajaDisplayChannel } from '@/lib/pos/display/cajaChannel';
import { DISPLAY_DOWN_EVENT, DISPLAY_UP_EVENT, type SupabaseChannelLike, type SupabaseClientLike } from '@/lib/pos/display/supabaseBroadcastTransport';
import { PROTOCOL_VERSION, type DownMessage, type UpMessage } from '@/lib/pos/display/protocol';
import { BroadcastChannelTransport, STALE_AFTER_MS, type DisplayChannel, type DisplayChannelEvent } from '@/lib/pos/display/transport';
import { readDisplayPresence, readDisplayPresenceView, withPresenceOrigins, describePresenceOrigins } from '@/lib/pos/display/presence';

const RAIZ = path.resolve(__dirname, '../../..');
const TERMINAL = '11111111-2222-4333-8444-555555555555';
/** Terminal de OTRA caja: lo que el transporte descarta por `terminalId`. */
const AJENA = '99999999-8888-4777-8666-555555555555';
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

// ---------------------------------------------------------------------------
// 1. La compuerta se gobierna con datos SIN VALIDAR
// ---------------------------------------------------------------------------

describe('compuerta de oyente · lo que abre y cierra el tubo remoto no está validado', () => {
  it('CORREGIDO (ronda 2 · 3): la basura por el tubo remoto NO abre la compuerta y nada sale por Realtime', () => {
    let now = 0;
    const inner = new FakeChannel();
    const gated = createListenerGatedChannel(inner, { now: () => now, gate: upMessageListenerGate(TERMINAL) });

    // Estado de reposo: sin oyente no sale nada.
    gated.postMessage({ t: 'state' });
    expect(inner.posted).toHaveLength(0);

    // Nada que el transporte descartaría gobierna ya la compuerta.
    for (const basura of ['hola', 42, null, { sin: 'tipo' }, { t: 123 }, { v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'display_alive' }]) {
      inner.inject(basura);
      expect(gated.hasListener).toBe(false);
      gated.postMessage({ t: 'state' });
      now += REMOTE_LISTENER_TTL_MS;
    }
    expect(inner.posted).toHaveLength(0);

    // La tableta legítima sí la abre.
    inner.inject(up('display_alive'));
    expect(gated.hasListener).toBe(true);
  });

  it('CORREGIDO: un `up` de OTRA terminal —que el transporte descarta— tampoco abre la compuerta', () => {
    const now = 0;
    const local = new FakeChannel();
    const remoto = new FakeChannel();
    const gated = createListenerGatedChannel(remoto, { now: () => now, gate: upMessageListenerGate(TERMINAL) });
    const canal = createFanOutDisplayChannel([
      { origin: 'local', channel: local },
      { origin: 'remote', channel: gated },
    ]);
    const transporte = new BroadcastChannelTransport({ terminalId: TERMINAL, channelFactory: () => canal, now: () => now });

    // La pantalla de OTRA caja (o un miembro de la organización con sesión) habla.
    remoto.inject({ v: PROTOCOL_VERSION, terminalId: AJENA, t: 'display_alive', at: 1, capabilities: CAPS });

    // El transporte lo descarta (no anota presencia) y la compuerta sigue dormida:
    // el carrito NO viaja por Realtime.
    expect(transporte.lastDisplaySeenByOrigin).toEqual({ local: null, remote: null });
    expect(gated.hasListener).toBe(false);
    transporte.publish({ t: 'state', state: { total: 1234 } } as never);
    expect(types(remoto.posted)).toEqual([]);
    expect(types(local.posted)).toEqual(['state']);
    transporte.close();
  });

  it('CORREGIDO: un `display_bye` forjado con terminalId ajeno ya no silencia el tubo remoto', () => {
    const now = 1_000;
    const local = new FakeChannel();
    const remoto = new FakeChannel();
    const gated = createListenerGatedChannel(remoto, { now: () => now, gate: upMessageListenerGate(TERMINAL), beatIntervalMs: 0 });
    const canal = createFanOutDisplayChannel([
      { origin: 'local', channel: local },
      { origin: 'remote', channel: gated },
    ]);
    const transporte = new BroadcastChannelTransport({ terminalId: TERMINAL, channelFactory: () => canal, now: () => now });

    // La tableta legítima se anuncia: presencia remota y compuerta abierta.
    remoto.inject(up('display_alive'));
    expect(transporte.lastDisplaySeenByOrigin.remote).toBe(now);
    transporte.publish({ t: 'state', state: { total: 1 } } as never);
    expect(remoto.posted).toHaveLength(1);

    // Un tercero con acceso al canal (tableta revocada dentro de los 5 min de su JWT,
    // u otro miembro de la organización) manda un display_bye que NO es de esta terminal.
    remoto.inject({ v: PROTOCOL_VERSION, terminalId: AJENA, t: 'display_bye', at: 2, capabilities: CAPS });

    // El transporte lo descarta y la compuerta tampoco se lo cree: la caja sigue
    // publicando y el indicador sigue diciendo la verdad.
    expect(transporte.lastDisplaySeenByOrigin.remote).toBe(1_000);
    const vista = readDisplayPresenceView({ lastDisplaySeenAt: transporte.lastDisplaySeenAt, isEmitting: true, lastDisplaySeenByOrigin: transporte.lastDisplaySeenByOrigin }, now);
    expect(vista.connected).toBe(true);
    expect(describePresenceOrigins(vista.origins)).toBe('remote');

    transporte.publish({ t: 'state', state: { total: 2 } } as never);
    expect(remoto.posted).toHaveLength(2);
    expect(local.posted).toHaveLength(2);

    // El `display_bye` de la tableta de ESTA terminal sí la duerme.
    remoto.inject(up('display_bye'));
    expect(gated.hasListener).toBe(false);
    transporte.close();
  });

  it('el `bye` del cierre de la caja no sale por el tubo remoto con la compuerta dormida (limitación declarada)', () => {
    let now = 0;
    const remoto = new FakeChannel();
    const gated = createListenerGatedChannel(remoto, { now: () => now, gate: upMessageListenerGate(TERMINAL) });
    const canal = createFanOutDisplayChannel([{ origin: 'remote', channel: gated }]);
    const transporte = new BroadcastChannelTransport({ terminalId: TERMINAL, channelFactory: () => canal, now: () => now });
    remoto.inject(up('display_alive'));
    now += REMOTE_LISTENER_TTL_MS; // silencio: la compuerta duerme
    transporte.close();
    expect(types(remoto.posted)).not.toContain('bye');
  });

  it('el TTL es estricto: justo en el instante de vencimiento ya no publica', () => {
    let now = 0;
    const inner = new FakeChannel();
    const gated = createListenerGatedChannel(inner, { now: () => now, listenerTtlMs: 1000, beatIntervalMs: 0 });
    inner.inject(up('display_alive'));
    now = 999;
    gated.postMessage({ t: 'a' });
    now = 1000;
    gated.postMessage({ t: 'b' });
    expect(types(inner.posted)).toEqual(['a']);
  });
});

describe('presencia · un solo reloj y un solo criterio', () => {
  it('CORREGIDO (ronda 2 · 6): el hook lee UNA vez con UN instante, y `connected` sigue a `origins` aunque los relojes difieran', () => {
    const fuente = { lastDisplaySeenAt: 1_000, isEmitting: true, lastDisplaySeenByOrigin: { local: null, remote: 1_000 } };
    // Aun forzando dos instantes distintos, el mapa por origen manda: no queda el estado
    // intermedio «conectada» sin origen que perdía el sufijo «(remota)».
    const snapshot = readDisplayPresence(fuente, 3_999);
    const vista = withPresenceOrigins(snapshot, fuente, 4_000, STALE_AFTER_MS);
    expect(vista.connected).toBe(false);
    expect(vista.origins).toEqual([]);
    expect(vista.connected).toBe(vista.origins.length > 0);

    // Y con el umbral por defecto la tableta sigue viva a los 3 s: late cada 5.
    const viva = readDisplayPresenceView(fuente, 4_000);
    expect(viva.connected).toBe(true);
    expect(describePresenceOrigins(viva.origins)).toBe('remote');
  });
});

// ---------------------------------------------------------------------------
// 2. Fan-out: suplantación del origen y aislamiento de fallos
// ---------------------------------------------------------------------------

describe('canal compuesto · el origen no se puede suplantar desde el payload', () => {
  it('un `up` que trae `origin: "remote"` dentro del mensaje llegando por la pata local se cuenta como LOCAL', () => {
    const local = new FakeChannel();
    const canal = createFanOutDisplayChannel([{ origin: 'local', channel: local }]);
    const transporte = new BroadcastChannelTransport({ terminalId: TERMINAL, channelFactory: () => canal, now: () => 5 });
    local.inject({ ...up('display_alive'), origin: 'remote' });
    expect(transporte.lastDisplaySeenByOrigin).toEqual({ local: 5, remote: null });
    transporte.close();
  });

  it('CORREGIDO (ronda 2 · 4): un handler que lanza al recibir queda aislado por pata, igual que al publicar', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const a = new FakeChannel();
    const b = new FakeChannel();
    const canal = createFanOutDisplayChannel([
      { origin: 'remote', channel: a },
      { origin: 'local', channel: b },
    ]);
    let entregados = 0;
    canal.onmessage = (e) => {
      entregados += 1;
      if (e.origin === 'remote') throw new Error('receptor roto');
    };
    // No sube al callback de supabase-js: aviso por consola y se sigue.
    expect(() => a.inject(up('display_alive'))).not.toThrow();
    expect(warn).toHaveBeenCalled();
    // La otra pata sigue entregando con normalidad.
    expect(() => b.inject(up('display_alive'))).not.toThrow();
    expect(entregados).toBe(2);
    warn.mockRestore();
    canal.close();
  });
});

// ---------------------------------------------------------------------------
// 3. cajaChannel: ciclo de vida del canal de Supabase
// ---------------------------------------------------------------------------

interface FakeRealtime {
  client: SupabaseClientLike;
  channels: Array<{ name: string; opts: unknown; sent: Array<{ event: string; payload: unknown }>; listeners: Map<string, (m: { payload?: unknown }) => void>; unsubscribed: number; subscribeCb: ((s: string, e?: Error) => void) | null }>;
  removed: number;
}

function fakeRealtime(): FakeRealtime {
  const fake: FakeRealtime = { channels: [], removed: 0, client: null as unknown as SupabaseClientLike };
  fake.client = {
    channel(name, opts) {
      const entry = { name, opts, sent: [] as Array<{ event: string; payload: unknown }>, listeners: new Map<string, (m: { payload?: unknown }) => void>(), unsubscribed: 0, subscribeCb: null as ((s: string, e?: Error) => void) | null };
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
          entry.subscribeCb = cb ?? null;
          return ch;
        },
        unsubscribe: async () => {
          entry.unsubscribed += 1;
          return 'ok';
        },
      };
      return ch;
    },
    removeChannel: async () => {
      fake.removed += 1;
      return 'ok';
    },
  };
  return fake;
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('createCajaDisplayChannel · ciclo de vida', () => {
  it('el canal privado lleva private:true, self:false y el nombre pos-display:<id>; al cerrar sale del canal y lo suelta', async () => {
    const rt = fakeRealtime();
    const canal = createCajaDisplayChannel(TERMINAL, { local: () => new FakeChannel(), realtime: rt.client, isRegisteredTerminal: async () => true });
    expect(await canal.remoteAttached).toBe(true);
    expect(rt.channels[0].name).toBe(`pos-display:${TERMINAL}`);
    expect(rt.channels[0].opts).toEqual({ config: { private: true, broadcast: { self: false, ack: false } } });
    expect([...rt.channels[0].listeners.keys()]).toEqual([DISPLAY_UP_EVENT]);
    canal.close();
    await flush();
    expect(rt.channels[0].unsubscribed).toBe(1);
    expect(rt.removed).toBe(1);
  });

  it('CORREGIDO (ronda 2 · 5): cerrar y reabrir en el acto espera a que el canal anterior haya SALIDO antes de abrir el siguiente', async () => {
    const rt = fakeRealtime();
    const a = createCajaDisplayChannel(TERMINAL, { local: () => new FakeChannel(), realtime: rt.client, isRegisteredTerminal: async () => true });
    await a.remoteAttached;
    a.close(); // el unsubscribe va en un `leave()` asíncrono, pero ahora queda anotado
    const b = createCajaDisplayChannel(TERMINAL, { local: () => new FakeChannel(), realtime: rt.client, isRegisteredTerminal: async () => true });
    await b.remoteAttached;
    // Dos canales con el mismo nombre, sí, pero NUNCA vivos a la vez: cuando el segundo
    // se cuelga, el primero ya salió y el cliente lo soltó.
    expect(rt.channels.map((c) => c.name)).toEqual([`pos-display:${TERMINAL}`, `pos-display:${TERMINAL}`]);
    expect(rt.channels[0].unsubscribed).toBe(1);
    expect(rt.removed).toBe(1);
    b.close();
    await flush();
  });

  it('nada se publica por Realtime antes de que la pantalla remota hable (coste cero sin tableta)', async () => {
    const rt = fakeRealtime();
    const canal = createCajaDisplayChannel(TERMINAL, { local: () => new FakeChannel(), realtime: rt.client, isRegisteredTerminal: async () => true });
    await canal.remoteAttached;
    rt.channels[0].subscribeCb?.('SUBSCRIBED');
    const transporte = new BroadcastChannelTransport({ terminalId: TERMINAL, channelFactory: () => canal, now: () => 1 });
    transporte.publish({ t: 'hello' } as never);
    transporte.publish({ t: 'state' } as never);
    expect(rt.channels[0].sent).toHaveLength(0);
    // Y en cuanto pide snapshot (con un `up` válido de ESTA terminal), la respuesta
    // de la misma vuelta ya sale. Desde la ronda 3 sale ADEMÁS el hello y el state
    // que la compuerta retuvo mientras dormía: sin eso, una tableta que vuelve nunca
    // recuperaba el carrito que se publicó durante el sueño (qa · 1 y 3). El coste
    // cero sin tableta no cambia: lo retenido solo sale cuando la tableta habla.
    rt.channels[0].listeners.get(DISPLAY_UP_EVENT)?.({ payload: up('need_snapshot') });
    expect(rt.channels[0].sent.map((s) => (s.payload as { t: string }).t)).toEqual(['hello', 'state']);
    transporte.publish({ t: 'hello' } as never);
    expect(rt.channels[0].sent.map((s) => s.event)).toEqual([DISPLAY_DOWN_EVENT, DISPLAY_DOWN_EVENT, DISPLAY_DOWN_EVENT]);
    transporte.close();
    await flush();
  });
});

// ---------------------------------------------------------------------------
// 4. Guardas estáticas de seguridad
// ---------------------------------------------------------------------------

function leer(rel: string): string {
  return fs.readFileSync(path.join(RAIZ, rel), 'utf8');
}

function archivosBajo(dir: string, filtro: (p: string) => boolean): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (filtro(full)) out.push(full);
    }
  };
  walk(path.join(RAIZ, dir));
  return out;
}

describe('ritmo del canal remoto · lo que la parte B (ronda 2) pide y la parte C ya aplica', () => {
  it('CORREGIDO (ronda 2 · 2): la pata remota lleva su propio ritmo de latido, sin tocar el del tubo local', () => {
    const cableado = leer('src/lib/pos/display/cajaChannel.ts') + leer('src/lib/pos/display/multiChannel.ts');
    expect(leer('src/lib/pos/display/supabaseBroadcastTransport.ts')).toContain('REMOTE_BEAT_INTERVAL_MS');
    expect(cableado).toContain('REMOTE_BEAT_INTERVAL_MS');
    expect(cableado).toContain('beatIntervalMs');
    // El ritmo es del TUBO, no del transporte: subir `heartbeatIntervalMs` ralentizaría
    // también la presencia de la ventana local, que comparte transporte.
    expect(cableado).not.toContain('heartbeatIntervalMs');
  });

  it('CORREGIDO: el criterio de presencia tiene un umbral por origen; la tableta late cada 5 s y no parpadea a los 3', () => {
    // Un `display_alive` remoto de hace 5 s (el ritmo remoto de la parte B) sigue vivo.
    const fuente = { lastDisplaySeenAt: 0, isEmitting: true, lastDisplaySeenByOrigin: { local: null, remote: 0 } };
    const vista = readDisplayPresenceView(fuente, 5_000);
    expect(vista.connected).toBe(true);
    expect(vista.origins).toEqual(['remote']);
    expect(describePresenceOrigins(vista.origins)).toBe('remote');
    // A los 15 s (tres latidos remotos perdidos) sí se da por muerta.
    expect(readDisplayPresenceView(fuente, 15_000)).toMatchObject({ connected: false, origins: [] });
    // Y una ventana LOCAL callada 5 s sigue contando como muerta: su umbral no cambió.
    const local = { lastDisplaySeenAt: 0, isEmitting: true, lastDisplaySeenByOrigin: { local: 0, remote: null } };
    expect(readDisplayPresenceView(local, 5_000)).toMatchObject({ connected: false, origins: [] });
    expect(leer('src/lib/pos/display/presence.ts')).toContain('REMOTE_STALE_AFTER_MS');
    expect(leer('src/components/pos/display/useCustomerDisplayPresence.ts')).toContain('DEFAULT_STALE_BY_ORIGIN');
  });
});

describe('política del canal Realtime de la caja · atada a la sucursal, no a la organización', () => {
  const MIGRACION = 'supabase/migrations/20260922200000_pos_display_caja_sucursal_del_usuario.sql';

  it('la migración existe con su reversión y recrea las DOS políticas de la caja', () => {
    const sql = leer(MIGRACION);
    expect(leer('supabase/rollbacks/20260922200000_pos_display_caja_sucursal_del_usuario_rollback.sql').length).toBeGreaterThan(0);
    for (const politica of ['pos_display_caja_recibe', 'pos_display_caja_envia']) {
      expect(sql).toContain(`drop policy if exists ${politica} on realtime.messages;`);
      expect(sql).toContain(`create policy ${politica} on realtime.messages`);
    }
    // Las de la PANTALLA no se tocan: su JWT ya la ata a su propio topic.
    expect(sql).not.toContain('pos_display_pantalla_');
  });

  it('la expresión ata al suscriptor con la terminal: sucursal del usuario, con excepción por rol; nunca pertenencia a secas', () => {
    const sql = leer(MIGRACION);
    // Ya no basta con VER la terminal: hay que ser miembro activo de SU organización…
    expect(sql).toContain('om.organization_id = t.organization_id');
    expect(sql).toContain('om.user_id = (select auth.uid())');
    expect(sql).toContain('om.is_active = true');
    // …y trabajar en su sucursal, o tener rol de administración (por id, nunca por nombre).
    expect(sql).toContain('mb.branch_id = t.branch_id');
    expect(sql).toContain('mb.organization_member_id = om.id');
    expect(sql).toContain('om.role_id in (1, 2, 5)');
    expect(sql).toContain('om.is_super_admin = true');
    expect(sql).toContain("check_user_permission((select auth.uid()), t.organization_id, 'admin.full_access')");
    // La terminal sigue teniendo que estar activa y el topic sigue siendo un UUID estricto.
    expect(sql).toContain('t.is_active');
    expect(sql).toMatch(/\^pos-display:\(\[0-9a-fA-F\]\{8\}-/);
    // Solo broadcast: ni presence ni postgres_changes.
    expect((sql.match(/extension = 'broadcast'/g) ?? []).length).toBe(2);
    expect(sql).not.toContain('postgres_changes');
    // Sin credenciales dentro del .sql (el repositorio es público).
    expect(sql).not.toMatch(/service_role|eyJ[A-Za-z0-9_-]{10}/);
  });

  it('la reversión deja constancia de lo que vuelve a abrir', () => {
    const rollback = leer('supabase/rollbacks/20260922200000_pos_display_caja_sucursal_del_usuario_rollback.sql');
    expect(rollback).toContain('drop policy if exists pos_display_caja_recibe on realtime.messages;');
    expect(rollback).toContain('drop policy if exists pos_display_caja_envia on realtime.messages;');
    expect(rollback).not.toContain('member_branches');
    expect(rollback).toMatch(/AVISO/);
  });
});

describe('guardas de seguridad de la parte C', () => {
  it('el middleware excluye /api/pos/display/ del matcher y /pos-display sigue siendo ruta pública', () => {
    const mw = leer('src/middleware.ts');
    expect(mw).toMatch(/api\/pos\/display\//);
    const matcher = mw.slice(mw.indexOf('matcher'));
    expect(matcher).toContain('api/pos/display/');
    expect(mw).toContain("pathname === '/pos-display'");
  });

  it('`pos_terminal_secrets` solo aparece en código de servidor (rutas y lib/pos/display/server) o en comentarios', () => {
    const fuentes = archivosBajo('src', (p) => /\.(ts|tsx)$/.test(p) && !p.includes('__tests__'));
    const ofensores: string[] = [];
    for (const file of fuentes) {
      const texto = fs.readFileSync(file, 'utf8');
      if (!/from\(['"]pos_terminal_secrets['"]\)/.test(texto)) continue;
      const rel = path.relative(RAIZ, file).replace(/\\/g, '/');
      const esServidor = rel.startsWith('src/app/api/') || rel.startsWith('src/lib/pos/display/server/');
      if (!esServidor) ofensores.push(rel);
    }
    expect(ofensores).toEqual([]);
  });

  it('ningún componente de la parte C importa el cliente service-role ni el de servidor', () => {
    for (const rel of [
      'src/components/pos/display/PairingCodeDialog.tsx',
      'src/components/pos/display/RevokeRemoteDisplayDialog.tsx',
      'src/components/pos/configuracion/pantalla-cliente/DispositivoRemotoSection.tsx',
      'src/components/pos/display/CustomerDisplayIndicator.tsx',
      'src/lib/pos/display/multiChannel.ts',
      'src/lib/pos/display/cajaChannel.ts',
      'src/lib/pos/display/remotePairing.ts',
    ]) {
      const texto = leer(rel);
      expect(texto).not.toMatch(/server-service|getServiceClient|SUPABASE_SERVICE_ROLE|SUPABASE_JWT_SECRET/);
    }
  });

  it('el cableado nuevo no usa postgres_changes ni escribe en tablas por mensaje', () => {
    for (const rel of ['src/lib/pos/display/multiChannel.ts', 'src/lib/pos/display/cajaChannel.ts', 'src/lib/pos/display/remotePairing.ts']) {
      const texto = leer(rel);
      expect(texto).not.toMatch(/postgres_changes/);
      expect(texto).not.toMatch(/\.from\(/);
    }
  });

  it('el servicio manda la organización en la cabecera, nunca en el body, para emparejar y revocar', () => {
    const svc = leer('src/lib/services/posTerminalsService.ts');
    const bloque = svc.slice(svc.indexOf('async function postDisplayRoute'), svc.indexOf('/** Respuesta `{ data }`'));
    expect(bloque).toContain("'X-Organization-Id': String(orgId)");
    expect(bloque).not.toMatch(/organization_id/);
    // Ronda 4 · 5: el body lleva como mucho `{ reuse: true }`; la organización sigue en la cabecera.
    expect(svc).toContain('/pairing-code`, orgId, body, ');
    expect(svc).toContain("const body = options.reuse === true ? { reuse: true } : {};");
    expect(svc).toContain("'/api/pos/display/revoke', orgId, { terminalId: id }");
  });
});
