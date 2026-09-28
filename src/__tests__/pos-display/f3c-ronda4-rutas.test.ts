/**
 * Fase 3, parte C · ronda 4, lado servidor:
 *
 * 3. `POST /api/pos/display/revoke` limpia además
 *    `pos_terminals.display_last_seen_at`: sin eso la tarjeta seguía pintando
 *    el punto VERDE con «hace menos de un minuto» hasta tres minutos después
 *    de revocar, y el administrador no sabía si la revocación surtió efecto.
 * 5. `POST /api/pos/terminals/[id]/pairing-code` reutiliza el código VIGENTE
 *    cuando el cliente lo pide (`{ reuse: true }`, lo que hace el diálogo al
 *    abrirse) y lleva cubo de tasa por usuario.
 *
 * Mismos dobles que la parte A: service-role y cliente de sesión falsos,
 * rate limit REAL en memoria.
 */

const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

import { makeSupabaseDouble, eqValue, type RecordedCall, type SupabaseDouble } from './f3a-supabaseDouble';

const T1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

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
  display_last_seen_at: string | null;
}

const state: { secrets: SecretRow[]; terminals: TerminalRow[] } = { secrets: [], terminals: [] };

function matches(row: Record<string, unknown>, call: RecordedCall): boolean {
  return call.filters.every(([op, col, value]) => {
    const v = row[col];
    if (op === 'eq') return v === value;
    if (op === 'neq') return v !== value;
    if (op === 'gt') return typeof v === 'string' && typeof value === 'string' && v > value;
    return false;
  });
}

function serviceResponder(call: RecordedCall) {
  if (call.table === 'pos_terminal_secrets') {
    const rows = state.secrets.filter((r) => matches(r as unknown as Record<string, unknown>, call));
    if (call.op === 'update' || call.op === 'upsert') {
      if (call.op === 'upsert') {
        const id = (call.payload as { terminal_id?: string })?.terminal_id;
        const existente = state.secrets.find((r) => r.terminal_id === id);
        if (existente) Object.assign(existente, call.payload);
        else state.secrets.push(Object.assign({ terminal_id: '', organization_id: 0, pairing_code: null, pairing_code_expires_at: null, display_token_hash: null }, call.payload) as SecretRow);
      } else {
        for (const r of rows) Object.assign(r, call.payload);
      }
      return { data: rows.map((r) => ({ terminal_id: r.terminal_id })), error: null };
    }
    return { data: call.limit === undefined ? (rows[0] ?? null) : rows.slice(0, call.limit), error: null };
  }
  if (call.table === 'pos_terminals') {
    const rows = state.terminals.filter((r) => matches(r as unknown as Record<string, unknown>, call));
    if (call.op === 'update') {
      for (const r of rows) Object.assign(r, call.payload);
      return { data: null, error: null };
    }
    return { data: rows[0] ?? null, error: null };
  }
  throw new Error(`tabla inesperada: ${call.table}`);
}

let serviceDb: SupabaseDouble;
let sessionDb: SupabaseDouble;
const session = {
  organizationId: 120,
  userId: 'u-1',
  roleId: 2,
  roleName: 'x',
  isSuperAdmin: false,
  organizationName: 'Org 120',
  memberId: 1,
  get supabase() {
    return sessionDb as never;
  },
};
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError,
  ORG_BODY_KEYS: jest.requireActual<typeof import('@/lib/security/organizationBody')>('@/lib/security/organizationBody').ORG_BODY_KEYS,
  getServerOrgContext: jest.fn(async () => session),
  hasOrgAdminOrPermission: jest.fn(async () => false),
  readOrgBody: jest.requireActual<typeof import('@/lib/security/organizationBody')>('@/lib/security/organizationBody').readOrgBody,
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => serviceDb }));
jest.mock('@/lib/security/rateLimitStore', () => ({ getRateLimitStore: () => null }));

import { NextRequest } from 'next/server';
import { POST as revoke } from '@/app/api/pos/display/revoke/route';
import { POST as pairingCode } from '@/app/api/pos/terminals/[id]/pairing-code/route';
import { _resetRateLimits } from '@/lib/security/rateLimit';
import { PAIRING_CODE_RATE_LIMIT } from '@/lib/pos/display/server/displayTokens';

function revokeReq(body: unknown) {
  return revoke(new NextRequest('http://localhost/api/pos/display/revoke', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
}
function codeReq(body?: unknown) {
  const req = new NextRequest(`http://localhost/api/pos/terminals/${T1}/pairing-code`, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
  });
  return pairingCode(req, { params: Promise.resolve({ id: T1 }) });
}

beforeEach(() => {
  _resetRateLimits();
  serviceDb = makeSupabaseDouble(serviceResponder);
  sessionDb = makeSupabaseDouble((call) => {
    if (call.table !== 'pos_terminals') throw new Error(`tabla inesperada en sesión: ${call.table}`);
    const row = state.terminals.find((r) => matches(r as unknown as Record<string, unknown>, call));
    return { data: row ?? null, error: null };
  });
  state.terminals = [{ id: T1, organization_id: 120, is_active: true, display_last_seen_at: new Date().toISOString() }];
  state.secrets = [{ terminal_id: T1, organization_id: 120, pairing_code: '482913', pairing_code_expires_at: new Date(Date.now() + 4 * 60 * 1000).toISOString(), display_token_hash: 'h' }];
  session.roleId = 2;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('POST /api/pos/display/revoke · la UI deja de decir «conectada» (ronda 4 · 3)', () => {
  it('borra el hash Y la última señal de la pantalla remota, en la fila de ESTA organización', async () => {
    const res = await revokeReq({ terminalId: T1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { terminalId: T1, revoked: true } });
    expect(state.secrets[0].display_token_hash).toBeNull();
    expect(state.terminals[0].display_last_seen_at).toBeNull();
    const update = serviceDb.calls.filter((c) => c.table === 'pos_terminals' && c.op === 'update').pop();
    expect(eqValue(update!, 'organization_id')).toBe(120);
    expect(eqValue(update!, 'id')).toBe(T1);
  });

  it('es idempotente: revocar dos veces deja lo mismo y sigue devolviendo revoked', async () => {
    await revokeReq({ terminalId: T1 });
    const res = await revokeReq({ terminalId: T1 });
    expect(res.status).toBe(200);
    expect(state.terminals[0].display_last_seen_at).toBeNull();
  });

  it('terminal de otra organización → 404 y NO se toca su última señal', async () => {
    state.terminals = [{ id: T1, organization_id: 121, is_active: true, display_last_seen_at: 'antes' }];
    expect((await revokeReq({ terminalId: T1 })).status).toBe(404);
    expect(state.terminals[0].display_last_seen_at).toBe('antes');
    expect(serviceDb.calls.some((c) => c.op === 'update')).toBe(false);
  });
});

describe('POST /api/pos/terminals/[id]/pairing-code · reutilización y cubo (ronda 4 · 5)', () => {
  it('con `reuse` devuelve el código VIGENTE sin quemarlo ni alargarlo', async () => {
    const antes = { ...state.secrets[0] };
    const res = await codeReq({ reuse: true });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toEqual({ terminalId: T1, code: antes.pairing_code, expiresAt: antes.pairing_code_expires_at, reused: true });
    // No se escribió nada: el código dictado sigue sirviendo.
    expect(serviceDb.calls.some((c) => c.op === 'upsert' || c.op === 'update')).toBe(false);
    expect(state.secrets[0]).toEqual(antes);
  });

  it('con `reuse` y el código vencido (o sin código) emite uno nuevo', async () => {
    state.secrets[0].pairing_code_expires_at = new Date(Date.now() - 1000).toISOString();
    const vencido = state.secrets[0].pairing_code;
    const res = await codeReq({ reuse: true });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.reused).toBe(false);
    expect(data.code).toMatch(/^[0-9]{6}$/);
    expect(state.secrets[0].pairing_code).toBe(data.code);
    expect(data.code === vencido).toBe(false);
  });

  it('sin `reuse` («Generar otro código») emite uno nuevo que pisa al anterior, y lo declara', async () => {
    const anterior = state.secrets[0].pairing_code;
    const { data } = await (await codeReq()).json();
    expect(data.reused).toBe(false);
    expect(state.secrets[0].pairing_code).toBe(data.code);
    expect(state.secrets[0].pairing_code).not.toBe(anterior);
  });

  it('la reutilización exige la organización de la SESIÓN en el filtro, no la del cliente', async () => {
    await codeReq({ reuse: true });
    const lectura = serviceDb.calls.find((c) => c.table === 'pos_terminal_secrets' && c.op === 'select')!;
    expect(eqValue(lectura, 'organization_id')).toBe(120);
    expect(eqValue(lectura, 'terminal_id')).toBe(T1);
  });

  it('cubo por usuario: pasado el límite → 429 con Retry-After y sin escribir', async () => {
    expect(PAIRING_CODE_RATE_LIMIT).toMatchObject({ limit: 30, windowMs: 15 * 60 * 1000 });
    for (let i = 0; i < PAIRING_CODE_RATE_LIMIT.limit; i++) {
      expect((await codeReq()).status).toBe(200);
    }
    const escrituras = serviceDb.calls.filter((c) => c.op === 'upsert').length;
    const res = await codeReq();
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe('RATE_LIMITED');
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(serviceDb.calls.filter((c) => c.op === 'upsert')).toHaveLength(escrituras);
  });

  it('el cajero no consume el cupo del administrador: el 403 llega antes que el cubo', async () => {
    session.roleId = 4;
    for (let i = 0; i < PAIRING_CODE_RATE_LIMIT.limit + 5; i++) {
      expect((await codeReq()).status).toBe(403);
    }
    session.roleId = 2;
    expect((await codeReq()).status).toBe(200);
  });
});
