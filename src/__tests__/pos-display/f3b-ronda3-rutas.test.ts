/**
 * Fase 3, parte B — ronda 3 · 4: el cubo GLOBAL de `/api/pos/display/pair`
 * solo lo consumen los canjes que FALLAN.
 *
 * Antes se registraba con TODOS los intentos, así que 120 peticiones por
 * minuto desde cualquier sitio dejaban sin emparejar a todas las
 * organizaciones del despliegue durante la ventana; y como ese 429 era una
 * de las entradas al respaldo silencioso del canje, también servía para
 * empujar una pantalla contra la caja equivocada.
 *
 * El service-role va doblado (`makeSupabaseDouble`); el rate limit es el
 * REAL en memoria (`_resetRateLimits`, store persistente nulo).
 * Fixtures sin nombres de organizaciones reales (ids y descripciones).
 */

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

import { NextRequest } from 'next/server';
import { POST as pair } from '@/app/api/pos/display/pair/route';
import { _resetRateLimits } from '@/lib/security/rateLimit';
import { PAIR_GLOBAL_RATE_LIMIT, PAIR_GLOBAL_SLOW_RATE_LIMIT } from '@/lib/pos/display/server/displayTokens';

/** Una terminal por código: cada canje correcto gasta el suyo. */
function seed(count: number): string[] {
  const codes: string[] = [];
  const expires = new Date(Date.now() + 4 * 60 * 1000).toISOString();
  for (let i = 0; i < count; i += 1) {
    const id = `aaaaaaaa-bbbb-4ccc-8ddd-${String(i).padStart(12, '0')}`;
    const code = String(100000 + i);
    codes.push(code);
    state.terminals.push({ id, organization_id: 120, is_active: true });
    state.secrets.push({ terminal_id: id, organization_id: 120, pairing_code: code, pairing_code_expires_at: expires, display_token_hash: null });
  }
  return codes;
}

/** Cada petición desde su propia IP: así el cubo por IP (10 / 15 min) nunca es el que bloquea. */
const pairReq = (code: string, ip: string) =>
  pair(
    new NextRequest('http://localhost/api/pos/display/pair', {
      method: 'POST',
      body: JSON.stringify({ code }),
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    }),
  );

beforeEach(() => {
  state.secrets = [];
  state.terminals = [];
  serviceDb = makeSupabaseDouble(serviceResponder);
  _resetRateLimits();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('F3-B ronda 3 · 4: el cubo global de /pair solo lo gastan los canjes fallidos', () => {
  it('más canjes CORRECTOS que el límite global: todos pasan', async () => {
    const total = PAIR_GLOBAL_RATE_LIMIT.limit + 10;
    const codes = seed(total);
    for (let i = 0; i < total; i += 1) {
      const res = await pairReq(codes[i], `198.18.${Math.floor(i / 250)}.${i % 250}`);
      expect(res.status).toBe(200);
    }
    expect(state.secrets.every((s) => s.display_token_hash !== null)).toBe(true);
  });

  it('los canjes FALLIDOS sí lo agotan: a partir de ahí un código equivocado es 429 y el bueno pasa por el carril lento', async () => {
    const [code] = seed(1);
    for (let i = 0; i < PAIR_GLOBAL_RATE_LIMIT.limit; i += 1) {
      expect((await pairReq('999999', `198.19.${Math.floor(i / 250)}.${i % 250}`)).status).toBe(404);
    }
    const bloqueado = await pairReq('999999', '198.19.9.9');
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.headers.get('Retry-After')).not.toBeNull();
    // El código BUENO sí pasa (ronda 5 · 4): el abuso de un tercero no puede
    // apagar el emparejamiento de una organización que no tiene nada que ver.
    expect((await pairReq(code, '198.19.9.10')).status).toBe(200);
    expect(state.secrets[0].display_token_hash).not.toBeNull();
  });

  it('agotados el global Y el carril lento, tampoco se toca la base', async () => {
    seed(1);
    const lecturas = () => serviceDb.calls.filter((c) => c.table === 'pos_terminal_secrets' && c.op === 'select').length;
    for (let i = 0; i < PAIR_GLOBAL_RATE_LIMIT.limit; i += 1) {
      expect((await pairReq('999999', `198.19.${Math.floor(i / 250)}.${i % 250}`)).status).toBe(404);
    }
    for (let i = 0; i < PAIR_GLOBAL_SLOW_RATE_LIMIT.limit; i += 1) {
      expect((await pairReq('999999', `198.20.${Math.floor(i / 250)}.${i % 250}`)).status).toBe(429);
    }
    const antes = lecturas();
    expect((await pairReq('999999', '198.20.9.9')).status).toBe(429);
    expect(lecturas()).toBe(antes);
  });
});
