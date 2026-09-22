/**
 * Fase 3, parte A · POST /api/pos/terminals/[id]/pairing-code (PLAN §7).
 *
 * `getServerOrgContext` doblado (sesión de la organización 120 con el rol de
 * cada caso); `readOrgBody`, `isOrgAdminLike`, `isTerminalId` y los
 * generadores reales. El cliente de sesión (RLS) lee `pos_terminals`; el
 * service-role escribe `pos_terminal_secrets`, y solo tras rol + organización.
 */

const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

import { makeSupabaseDouble, eqValue, type RecordedCall, type SupabaseDouble } from './f3a-supabaseDouble';

const T1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const state: { terminal: { id: string; organization_id: number; is_active: boolean } | null; clashes: number; writeError: boolean } = {
  terminal: null,
  clashes: 0,
  writeError: false,
};

function sessionResponder(call: RecordedCall) {
  if (call.table !== 'pos_terminals') throw new Error(`tabla inesperada en sesión: ${call.table}`);
  const ok = state.terminal && eqValue(call, 'id') === state.terminal.id && eqValue(call, 'organization_id') === state.terminal.organization_id;
  return { data: ok ? state.terminal : null, error: null };
}
function serviceResponder(call: RecordedCall) {
  if (call.table !== 'pos_terminal_secrets') throw new Error(`tabla inesperada en service-role: ${call.table}`);
  if (call.op === 'select') {
    const n = state.clashes;
    state.clashes = Math.max(0, n - 1);
    return { data: n > 0 ? [{ terminal_id: 'otra' }] : [], error: null };
  }
  return { data: null, error: state.writeError ? { message: 'boom' } : null };
}

let sessionDb: SupabaseDouble;
let serviceDb: SupabaseDouble;

const session = {
  organizationId: 120,
  userId: 'u-1',
  roleId: 4,
  roleName: 'x',
  isSuperAdmin: false,
  organizationName: 'Org 120',
  memberId: 1,
  get supabase() {
    return sessionDb as never;
  },
};
const hasOrgAdminOrPermission = jest.fn(async () => false);
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError,
  getServerOrgContext: jest.fn(async () => session),
  hasOrgAdminOrPermission: (...a: unknown[]) => hasOrgAdminOrPermission(...(a as [])),
  readOrgBody: jest.requireActual<typeof import('@/lib/security/organizationBody')>('@/lib/security/organizationBody').readOrgBody,
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => serviceDb }));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/pos/terminals/[id]/pairing-code/route';
import { PAIRING_CODE_TTL_MS } from '@/lib/pos/display/server/displayTokens';
import { _resetRateLimits } from '@/lib/security/rateLimit';

function post(id: string, body?: unknown, query = '') {
  const req = new NextRequest(`http://localhost/api/pos/terminals/${id}/pairing-code${query}`, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
  });
  return POST(req, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  // La ruta lleva cubo de tasa por usuario desde F3-C ronda 4 · 5: sin esto,
  // los casos de este archivo comparten cupo entre sí.
  _resetRateLimits();
  sessionDb = makeSupabaseDouble(sessionResponder);
  serviceDb = makeSupabaseDouble(serviceResponder);
  state.terminal = { id: T1, organization_id: 120, is_active: true };
  state.clashes = 0;
  state.writeError = false;
  session.roleId = 2;
  session.isSuperAdmin = false;
  hasOrgAdminOrPermission.mockReset();
  hasOrgAdminOrPermission.mockImplementation(async () => false);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('POST /api/pos/terminals/[id]/pairing-code', () => {
  it('admin → 200 con código de 6 dígitos, caducidad a 5 min y upsert del secreto con la organización DE LA SESIÓN', async () => {
    const before = Date.now();
    const res = await post(T1);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const { data } = await res.json();
    expect(data.terminalId).toBe(T1);
    expect(data.code).toMatch(/^[0-9]{6}$/);
    const expires = new Date(data.expiresAt).getTime();
    expect(expires - before).toBeGreaterThanOrEqual(PAIRING_CODE_TTL_MS - 50);
    expect(expires - before).toBeLessThanOrEqual(PAIRING_CODE_TTL_MS + 5000);

    const write = serviceDb.calls.find((c) => c.op === 'upsert');
    expect(write?.table).toBe('pos_terminal_secrets');
    expect(write?.opts).toEqual({ onConflict: 'terminal_id' });
    expect(write?.payload).toMatchObject({ terminal_id: T1, organization_id: 120, pairing_code: data.code, pairing_code_expires_at: data.expiresAt });
    // El código nuevo no toca el hash de una pantalla ya emparejada.
    expect(write?.payload).not.toHaveProperty('display_token_hash');
  });

  it('cajero (rol 4) → 403 ADMIN_REQUIRED sin tocar ninguna tabla', async () => {
    session.roleId = 4;
    const res = await post(T1);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('ADMIN_REQUIRED');
    expect(sessionDb.calls).toHaveLength(0);
    expect(serviceDb.calls).toHaveLength(0);
  });

  it('manager (rol 5), super admin y cargo con admin.full_access → 200', async () => {
    session.roleId = 5;
    expect((await post(T1)).status).toBe(200);
    session.roleId = 4;
    session.isSuperAdmin = true;
    expect((await post(T1)).status).toBe(200);
    session.isSuperAdmin = false;
    hasOrgAdminOrPermission.mockImplementation(async () => true);
    expect((await post(T1)).status).toBe(200);
  });

  it('organización ajena en el body o en la query → 403 FOREIGN_ORGANIZATION antes de escribir', async () => {
    let res = await post(T1, { organization_id: 999 });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('FOREIGN_ORGANIZATION');
    res = await post(T1, undefined, '?organizationId=999');
    expect(res.status).toBe(403);
    expect(serviceDb.calls).toHaveLength(0);
  });

  it('id que no es UUID → 400; terminal ajena o inexistente → 404; inactiva → 409; nunca se escribe', async () => {
    expect((await post('nope')).status).toBe(400);
    state.terminal = { id: T1, organization_id: 121, is_active: true };
    expect((await post(T1)).status).toBe(404);
    state.terminal = { id: T1, organization_id: 120, is_active: false };
    const res = await post(T1);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('TERMINAL_INACTIVE');
    expect(serviceDb.calls).toHaveLength(0);
  });

  it('la lectura de la terminal va por el cliente de SESIÓN filtrando por la organización de la sesión', async () => {
    await post(T1);
    const read = sessionDb.calls[0];
    expect(read.table).toBe('pos_terminals');
    expect(eqValue(read, 'organization_id')).toBe(120);
    expect(eqValue(read, 'id')).toBe(T1);
  });

  it('un código que colisiona con otro vigente se vuelve a generar', async () => {
    state.clashes = 2;
    const res = await post(T1);
    expect(res.status).toBe(200);
    const checks = serviceDb.calls.filter((c) => c.op === 'select');
    expect(checks).toHaveLength(3);
    for (const c of checks) {
      expect(c.filters.map(([op, col]) => `${op}:${col}`)).toEqual(['eq:pairing_code', 'gt:pairing_code_expires_at', 'neq:terminal_id']);
    }
  });

  it('sin código libre tras 5 intentos → 503; escritura fallida → 500', async () => {
    state.clashes = 5;
    expect((await post(T1)).status).toBe(503);
    state.clashes = 0;
    state.writeError = true;
    const res = await post(T1);
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe('WRITE_FAILED');
  });

  it('sin sesión (OrgContextError 401) → 401 JSON', async () => {
    const { getServerOrgContext } = jest.requireMock<{ getServerOrgContext: jest.Mock }>('@/lib/utils/orgContext');
    getServerOrgContext.mockImplementationOnce(async () => {
      throw new OrgContextError('No autenticado', 401, 'UNAUTHENTICATED');
    });
    const res = await post(T1);
    expect(res.status).toBe(401);
    expect(serviceDb.calls).toHaveLength(0);
  });
});
