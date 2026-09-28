/**
 * TESTER de la Fase 3, parte B — ronda 3. Sondas ADVERSARIAS sobre el
 * transporte remoto y la pantalla emparejable: no repiten lo que ya fija
 * `f3b-ronda3*.test.ts`, sino que intentan romperlo.
 *
 * 1. `/pair` ignora TODO lo que no sea `code` (organización y terminal en el
 *    body, regla 5 del CLAUDE.md).
 * 2. El cubo por IP se gasta también con los canjes CORRECTOS, y un 429 ya
 *    no lleva al respaldo: una tienda con varias tabletas tras el mismo NAT
 *    puede quedarse sin arrancar ninguna durante la ventana.
 * 3. Un canje que NUNCA responde (portal cautivo) deja el emparejamiento
 *    bloqueado: no hay `AbortController` ni tope en ninguna de las tres
 *    llamadas de `remoteDisplay.ts`.
 * 4. Canal ajeno, terminal ajena, seq repetido e `instanceId` ajeno en el
 *    transporte REMOTO.
 * 5. `pos_terminal_secrets` solo aparece en código de servidor.
 *
 * Fixtures sin nombres de organizaciones reales (ids y descripciones).
 */

import { createHash } from 'node:crypto';
import { makeSupabaseDouble, type RecordedCall, type SupabaseDouble } from './f3a-supabaseDouble';

interface SecretRow {
  terminal_id: string;
  organization_id: number;
  pairing_code: string | null;
  pairing_code_expires_at: string | null;
  display_token_hash: string | null;
}
interface TerminalRow {
  id: string;
  organization_id: number;
  is_active: boolean;
}

const state: { secrets: SecretRow[]; terminals: TerminalRow[] } = { secrets: [], terminals: [] };

function matches(row: Record<string, unknown>, call: RecordedCall): boolean {
  return call.filters.every(([op, col, value]) => {
    const v = row[col];
    if (op === 'eq') return v === value;
    if (op === 'gt') return typeof v === 'string' && typeof value === 'string' && v > value;
    return false;
  });
}

function joinTerminal(row: SecretRow): Record<string, unknown> {
  const t = state.terminals.find((x) => x.id === row.terminal_id);
  return {
    ...row,
    'pos_terminals.is_active': t?.is_active,
    pos_terminals: t ? { id: t.id, organization_id: t.organization_id, is_active: t.is_active } : null,
  };
}

function serviceResponder(call: RecordedCall) {
  if (call.table !== 'pos_terminal_secrets') throw new Error(`tabla inesperada: ${call.table}`);
  const embed = call.op === 'select' && /pos_terminals!inner/.test(call.columns ?? '');
  const rows = state.secrets.filter((r) => matches(embed ? joinTerminal(r) : (r as unknown as Record<string, unknown>), call));
  if (call.op === 'update') {
    for (const r of rows) Object.assign(r, call.payload);
    return { data: rows.map((r) => ({ terminal_id: r.terminal_id })), error: null };
  }
  const out = embed ? rows.map(joinTerminal).filter((r) => r.pos_terminals !== null) : rows;
  return { data: call.limit === undefined ? (out[0] ?? null) : out.slice(0, call.limit), error: null };
}

let serviceDb: SupabaseDouble;
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => serviceDb }));
jest.mock('@/lib/security/rateLimitStore', () => ({ getRateLimitStore: () => null }));

import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { POST as pair } from '@/app/api/pos/display/pair/route';
import { _resetRateLimits } from '@/lib/security/rateLimit';
import { PAIR_RATE_LIMIT } from '@/lib/pos/display/server/displayTokens';
import {
  DISPLAY_API_TIMEOUT_MS,
  HEARTBEAT_INFLIGHT_MAX_MS,
  isRemoteBootstrap,
  pairingCodeFingerprint,
  resolveRedeemFailure,
  resolvePairingSubmit,
  resolveRemoteIntent,
  startRemoteHeartbeat,
  fetchRemoteBootstrap,
  type FetchLike,
  type RemoteApiFailure,
  type StoredRemoteDisplay,
} from '@/lib/pos/display/remoteDisplay';
import { DISPLAY_DOWN_EVENT, SupabaseBroadcastReceiver } from '@/lib/pos/display/supabaseBroadcastTransport';
import { displayChannelName } from '@/lib/pos/display/transport';
import { RealtimeBus, createRealtimeDouble } from './f3b-supabaseRealtimeDouble';

const T1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const T2 = 'cccccccc-dddd-4eee-8fff-000000000000';
const TOKEN = 'D'.repeat(43);
const sha256 = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex');

function seedOne(code: string, orgId = 120, terminalId = T1): void {
  state.terminals.push({ id: terminalId, organization_id: orgId, is_active: true });
  state.secrets.push({
    terminal_id: terminalId,
    organization_id: orgId,
    pairing_code: code,
    pairing_code_expires_at: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
    display_token_hash: null,
  });
}

const pairReq = (body: unknown, ip: string) =>
  pair(
    new NextRequest('http://localhost/api/pos/display/pair', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    }),
  );

beforeEach(() => {
  state.secrets = [];
  state.terminals = [];
  serviceDb = makeSupabaseDouble(serviceResponder);
  _resetRateLimits();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. La organización NUNCA sale del body
// ---------------------------------------------------------------------------

describe('tester F3-B r3 · /pair: nada del body salvo el código', () => {
  it('organization_id, organizationId y terminalId en el body se ignoran: la terminal sale de la fila del código', async () => {
    seedOne('482913', 120, T1);
    // Una segunda organización con su propia terminal; el atacante la nombra en el body.
    state.terminals.push({ id: T2, organization_id: 999, is_active: true });
    state.secrets.push({ terminal_id: T2, organization_id: 999, pairing_code: '111111', pairing_code_expires_at: new Date(Date.now() + 60_000).toISOString(), display_token_hash: null });

    const res = await pairReq({ code: '482913', organization_id: 999, organizationId: 999, terminalId: T2, org_id: 999 }, '198.51.100.7');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { terminalId: string; token: string } };
    expect(body.data.terminalId).toBe(T1);
    // La terminal de la otra organización sigue intacta.
    expect(state.secrets.find((s) => s.terminal_id === T2)?.display_token_hash).toBeNull();
    // Ningún filtro de la consulta usó un valor del body.
    const filtros = serviceDb.calls.flatMap((c) => c.filters.map(([, col, value]) => `${col}=${String(value)}`));
    expect(filtros).not.toContain('organization_id=999');
    expect(filtros).not.toContain('terminal_id=' + T2);
  });

  it('`code` que no es exactamente seis dígitos (número, con espacios, con signo) → 400 sin tocar la base', async () => {
    seedOne('482913');
    const lecturas = () => serviceDb.calls.filter((c) => c.op === 'select').length;
    for (const [i, code] of [482913, ' 482913', '482913 ', '+82913', '48291３', '0482913', null].entries()) {
      const res = await pairReq({ code }, `198.51.101.${i}`);
      expect([400, 404]).toContain(res.status);
      expect(res.status).toBe(400);
    }
    expect(lecturas()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. El cubo por IP y el 429 sin respaldo
// ---------------------------------------------------------------------------

describe('tester F3-B r3 · el cubo por IP cuenta los canjes CORRECTOS y el 429 ya no tiene respaldo', () => {
  it('varias tabletas tras el mismo NAT: al undécimo canje del cuarto de hora la IP entera recibe 429', async () => {
    const ip = '203.0.113.44';
    // Diez emparejamientos legítimos de la misma tienda (diez tabletas, o una que rearranca).
    for (let i = 0; i < PAIR_RATE_LIMIT.limit; i += 1) {
      const code = String(200000 + i);
      const id = `aaaaaaaa-bbbb-4ccc-8ddd-${String(i).padStart(12, '0')}`;
      seedOne(code, 120, id);
      expect((await pairReq({ code }, ip)).status).toBe(200);
    }
    // El siguiente código es perfectamente válido y la respuesta es 429.
    seedOne('299999', 120, T2);
    const bloqueado = await pairReq({ code: '299999' }, ip);
    expect(bloqueado.status).toBe(429);
    expect(state.secrets.find((s) => s.terminal_id === T2)?.display_token_hash).toBeNull();
  });

  it('ese 429 cae al emparejamiento guardado si el código es el PROPIO (ronda 4 · B3); con otro, pide código nuevo', async () => {
    const codigoPropio = '482913';
    const stored: StoredRemoteDisplay = { v: 1, token: TOKEN, terminalId: T1, pairedAt: '', codeHash: sha256(codigoPropio) };
    const rate: RemoteApiFailure = { ok: false, kind: 'http', status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 60 };
    // Antes se excluía el 429; eso dejaba sin arrancar al quiosco que agotó
    // el cubo reintentando su propio código gastado, con su token vivo.
    expect(resolveRedeemFailure(rate, stored, sha256(codigoPropio)).kind).toBe('fallback');
    expect(resolveRedeemFailure(rate, stored, sha256('100200')).kind).toBe('ask_code');
    // Con 404 (el mismo código, ya gastado) sí hay respaldo: es el caso del quiosco.
    const gone: RemoteApiFailure = { ok: false, kind: 'http', status: 404, code: 'CODE_INVALID', retryAfterSeconds: null };
    expect(resolveRedeemFailure(gone, stored, sha256(codigoPropio)).kind).toBe('fallback');
  });

  it('el 429 manda `Retry-After` en la CABECERA, pero `retryAfterSeconds` lo busca en el BODY: siempre queda en null', async () => {
    const ip = '203.0.113.90';
    for (let i = 0; i < PAIR_RATE_LIMIT.limit; i += 1) {
      await pairReq({ code: '999999' }, ip);
    }
    const res = await pairReq({ code: '999999' }, ip);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).not.toBeNull();
    const body = (await res.json()) as Record<string, unknown>;
    // El parser de remoteDisplay.ts lee `body.retryAfter`; la ruta no lo manda.
    expect(body.retryAfter).toBeUndefined();
  });

  it('con token guardado, `?pair=` vacío NO lleva a la pantalla de emparejamiento: el token guardado gana', () => {
    const stored: StoredRemoteDisplay = { v: 1, token: TOKEN, terminalId: T1, pairedAt: '' };
    expect(resolveRemoteIntent('?pair=', stored).kind).toBe('remote');
    expect(resolveRemoteIntent('?pair=12', stored).kind).toBe('remote');
    // Sin token sí: es el único camino a «teclear el código».
    expect(resolveRemoteIntent('?pair=', null).kind).toBe('ask_code');
  });

  it('un emparejamiento guardado SIN huella (origen no seguro) nunca tiene respaldo, ni con su propio código', async () => {
    const stored: StoredRemoteDisplay = { v: 1, token: TOKEN, terminalId: T1, pairedAt: '' };
    const gone: RemoteApiFailure = { ok: false, kind: 'http', status: 404, code: 'CODE_INVALID', retryAfterSeconds: null };
    expect(resolveRedeemFailure(gone, stored, sha256('482913')).kind).toBe('ask_code');
    expect(resolveRedeemFailure(gone, stored, null).kind).toBe('ask_code');
  });

  /**
   * Hasta la ronda 3 esto afirmaba lo contrario («sin huella el quiosco en
   * http pide código en cada arranque»), que era el defecto: en un origen no
   * seguro —una tableta apuntada a la instancia por IP de la LAN— el respaldo
   * no se aplicaba nunca y cada reinicio dejaba la pantalla pidiendo código
   * con un emparejamiento vivo. La ronda 4 (QA-2) cae a una huella NO
   * criptográfica con prefijo propio: la huella no protege ningún secreto
   * (seis dígitos se invierten igual desde un sha256), solo responde «¿es el
   * mismo código con el que me emparejé?» contra un valor del propio
   * dispositivo.
   */
  it('sin crypto.subtle hay huella no criptográfica: el quiosco en http conserva su respaldo', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
    try {
      const huella = await pairingCodeFingerprint('482913');
      expect(huella).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
      expect(await pairingCodeFingerprint('100200')).not.toBe(huella);
      // Con esa huella guardada, su propio código gastado sí cae al respaldo.
      const stored: StoredRemoteDisplay = { v: 1, token: TOKEN, terminalId: T1, pairedAt: '', codeHash: huella! };
      const gone: RemoteApiFailure = { ok: false, kind: 'http', status: 404, code: 'CODE_INVALID', retryAfterSeconds: null };
      expect(resolveRedeemFailure(gone, stored, huella).kind).toBe('fallback');
    } finally {
      if (original) Object.defineProperty(globalThis, 'crypto', original);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Peticiones que nunca responden: no hay tope en ninguna
// ---------------------------------------------------------------------------

describe('tester F3-B r3 · una petición que nunca responde bloquea la pantalla', () => {
  const neverFetch: FetchLike = () => new Promise(() => undefined);

  /**
   * CORREGIDO en la ronda 4 · B1: `callDisplayApi` corre cada petición contra
   * `DISPLAY_API_TIMEOUT_MS` y la aborta. Lo que antes era una promesa colgada
   * para siempre —y con ella el bootstrap sin reintento— es ahora un fallo de
   * red normal, que el camino ya sabía reintentar con retroceso. A los 30 ms
   * sigue sin resolverse, que es lo correcto: el plazo son diez segundos.
   */
  it('/bootstrap colgado: a los 30 ms sigue en vuelo, pero hay tope y aborto (ronda 4 · B1)', async () => {
    const race = await Promise.race([
      fetchRemoteBootstrap(TOKEN, neverFetch).then(() => 'resuelta' as const),
      new Promise<'colgada'>((resolve) => {
        setTimeout(() => resolve('colgada'), 30);
      }),
    ]);
    expect(race).toBe('colgada');
    const src = fs.readFileSync(path.join(process.cwd(), 'src/lib/pos/display/remoteDisplay.ts'), 'utf8');
    expect(src).toMatch(/AbortController/);
    expect(DISPLAY_API_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('/heartbeat colgado: dentro del plazo `beat()` no solapa (pasado HEARTBEAT_INFLIGHT_MAX_MS sí sale otro: ronda 4 · B2)', async () => {
    let llamadas = 0;
    const fetchFn: FetchLike = () => {
      llamadas += 1;
      return new Promise(() => undefined);
    };
    const hb = startRemoteHeartbeat({ token: TOKEN, fetchFn, onCredential: () => undefined, onRevoked: () => undefined, immediate: true });
    await Promise.resolve();
    expect(llamadas).toBe(1);
    void hb.beat();
    void hb.beat();
    await Promise.resolve();
    // Dentro del tope sigue habiendo UNA sola petición en vuelo.
    expect(llamadas).toBe(1);
    expect(HEARTBEAT_INFLIGHT_MAX_MS).toBeGreaterThan(0);
    expect(hb.stopped).toBe(false);
    hb.stop();
  });

  it('con un canje en vuelo, `resolvePairingSubmit` rechaza TODO hasta que la promesa se resuelva', () => {
    expect(resolvePairingSubmit('482913', true)).toBeNull();
    expect(resolvePairingSubmit('111111', true)).toBeNull();
    expect(resolvePairingSubmit('482913', false)).toBe('482913');
  });
});

// ---------------------------------------------------------------------------
// 4. Canal ajeno, terminal ajena, seq y instancia
// ---------------------------------------------------------------------------

describe('tester F3-B r3 · el transporte remoto descarta lo ajeno', () => {
  const IA = '11111111-1111-4111-8111-111111111111';
  const IB = '22222222-2222-4222-8222-222222222222';
  const hello = (terminalId: string, instanceId: string, seq: number) => ({
    v: 1,
    t: 'hello',
    seq,
    terminalId,
    instanceId,
    cashier: null,
    sessionOpen: true,
    organizationId: 120,
  });
  const hb = (terminalId: string, instanceId: string, seq: number) => ({ v: 1, t: 'heartbeat', seq, terminalId, instanceId, at: seq });

  function open(terminalId: string, channelName: string) {
    const bus = new RealtimeBus();
    const double = createRealtimeDouble({ bus });
    const received: unknown[] = [];
    const receiver = new SupabaseBroadcastReceiver({ terminalId, channelName, client: double.client });
    receiver.onDown((msg) => received.push(msg));
    return { bus, double, received, receiver };
  }

  it('un sobre de OTRA terminal publicado en el canal al que la pantalla está unida se descarta', () => {
    const { double, received, receiver } = open(T1, displayChannelName(T1));
    double.channels[0].inject(DISPLAY_DOWN_EVENT, hello(T2, IA, 0));
    double.channels[0].inject(DISPLAY_DOWN_EVENT, hb(T2, IA, 1));
    expect(received).toHaveLength(0);
    expect(receiver.activeInstanceId).toBeNull();
    receiver.close(false);
  });

  it('seq repetido o menor de la instancia adoptada se descarta', () => {
    const { double, received, receiver } = open(T1, displayChannelName(T1));
    double.channels[0].inject(DISPLAY_DOWN_EVENT, hello(T1, IA, 5));
    expect(received).toHaveLength(1);
    double.channels[0].inject(DISPLAY_DOWN_EVENT, hb(T1, IA, 5)); // seq repetido
    double.channels[0].inject(DISPLAY_DOWN_EVENT, hb(T1, IA, 3)); // seq menor
    double.channels[0].inject(DISPLAY_DOWN_EVENT, hb(T1, IB, 9)); // instancia sin hello
    expect(received).toHaveLength(1);
    expect(receiver.lastSeq).toBe(5);
    expect(receiver.activeInstanceId).toBe(IA);
    receiver.close(false);
  });

  it('una pantalla emparejada a T1 que recibe el canal de T2 no adopta nada (defensa tras isRemoteBootstrap)', () => {
    const { double, received, receiver } = open(T1, displayChannelName(T2));
    expect(double.channels[0].topic).toBe(displayChannelName(T2));
    double.channels[0].inject(DISPLAY_DOWN_EVENT, hello(T2, IA, 0));
    expect(received).toHaveLength(0);
    receiver.close(false);
  });

  it('isRemoteBootstrap rechaza un canal que no corresponde a la terminal', () => {
    const base = {
      terminal: { id: T1, name: 'Caja 1', code: 'C1', branchId: 1 },
      brand: { organizationId: 120, name: '', logoUrl: null, primaryColor: null, secondaryColor: null, timezone: 'America/Bogota' },
      settings: {},
      locale: 'es',
      currency: 'COP',
      realtime: { channel: displayChannelName(T1), token: 'jwt', expiresAt: '' },
    };
    expect(isRemoteBootstrap(base)).toBe(true);
    expect(isRemoteBootstrap({ ...base, realtime: { ...base.realtime, channel: displayChannelName(T2) } })).toBe(false);
    expect(isRemoteBootstrap({ ...base, realtime: { ...base.realtime, channel: 'realtime:all' } })).toBe(false);
  });

  it('el canal remoto SIEMPRE se abre privado y sin `self`', () => {
    const { double, receiver } = open(T1, displayChannelName(T1));
    expect(double.channels[0].opts.config.private).toBe(true);
    expect(double.channels[0].opts.config.broadcast.self).toBe(false);
    receiver.close(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Secretos y middleware
// ---------------------------------------------------------------------------

describe('tester F3-B r3 · superficie de servidor', () => {
  const root = process.cwd();

  it('`from(\'pos_terminal_secrets\')` solo en rutas de servidor o en lib/pos/display/server', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        const text = fs.readFileSync(full, 'utf8');
        if (/from\(\s*['"]pos_terminal_secrets['"]\s*\)/.test(text)) hits.push(path.relative(root, full).replace(/\\/g, '/'));
      }
    };
    walk(path.join(root, 'src'));
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      expect(hit).toMatch(/^src\/(app\/api\/.+\/route\.ts|lib\/pos\/display\/server\/.+\.ts)$/);
    }
  });

  it('ningún módulo con `use client` menciona el token ni la tabla de secretos fuera de un comentario', () => {
    const sospechosos: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        const text = fs.readFileSync(full, 'utf8');
        if (!/^['"]use client['"]/m.test(text)) continue;
        const sinComentarios = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        if (/pos_terminal_secrets|display_token_hash|SUPABASE_JWT_SECRET|SUPABASE_SERVICE_ROLE/.test(sinComentarios)) {
          sospechosos.push(path.relative(root, full).replace(/\\/g, '/'));
        }
      }
    };
    walk(path.join(root, 'src'));
    expect(sospechosos).toEqual([]);
  });

  it('el middleware excluye /api/pos/display/ del matcher y /pos-display de la sesión', () => {
    const mw = fs.readFileSync(path.join(root, 'src/middleware.ts'), 'utf8');
    expect(mw).toMatch(/api\/pos\/display\//);
    const matcher = /matcher:\s*\[([\s\S]*?)\]/.exec(mw)?.[1] ?? '';
    expect(matcher).toMatch(/api\/pos\/display\//);
    expect(mw).toMatch(/pathname === '\/pos-display'/);
  });
});
