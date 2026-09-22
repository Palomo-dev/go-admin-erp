/**
 * TESTER · Fase 3, parte C, ronda 4 · lado servidor.
 *
 * Encadena las DOS rutas que el administrador usa seguidas —«Revocar» y
 * luego «Emparejar otro dispositivo»— para fijar el hecho del que depende el
 * defecto de `tester-f3c-r4.test.ts`: tras `/revoke` la petición de apertura
 * del diálogo (`reuse: true`) NO reutiliza nada, porque `/revoke` dejó
 * `pairing_code` en NULL, y la ruta responde `reused: false`.
 *
 * Mismos dobles que la parte A. Sin nombres de organizaciones.
 */

const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

import { makeSupabaseDouble, type RecordedCall, type SupabaseDouble } from './f3a-supabaseDouble';

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
        else
          state.secrets.push(
            Object.assign({ terminal_id: '', organization_id: 0, pairing_code: null, pairing_code_expires_at: null, display_token_hash: null }, call.payload) as SecretRow,
          );
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

function revokeReq(body: unknown) {
  return revoke(
    new NextRequest('http://localhost/api/pos/display/revoke', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  );
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
  state.secrets = [
    {
      terminal_id: T1,
      organization_id: 120,
      pairing_code: '482913',
      pairing_code_expires_at: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
      display_token_hash: 'h',
    },
  ];
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('Revocar y volver a emparejar · lo que responden las rutas encadenadas', () => {
  it('`/revoke` deja `pairing_code` en NULL, así que el `reuse` del diálogo no tiene qué reutilizar', async () => {
    expect((await revokeReq({ terminalId: T1 })).status).toBe(200);
    expect(state.secrets[0].pairing_code).toBeNull();
    expect(state.secrets[0].pairing_code_expires_at).toBeNull();
    expect(state.secrets[0].display_token_hash).toBeNull();
  });

  it('DEFECTO · abrir el diálogo tras revocar responde `reused: false`, que es lo único que el cliente mira para soltar el pestillo', async () => {
    await revokeReq({ terminalId: T1 });
    const { data } = await (await codeReq({ reuse: true })).json();
    expect(data.code).toMatch(/^[0-9]{6}$/);
    // Pedía reutilizar y le dieron uno nuevo. El cliente exige
    // `reused === false && options.reuse !== true`, así que con esta respuesta
    // NO suelta el pestillo: la tableta que se empareje con `data.code` no
    // recibirá nada de esta caja.
    expect(data.reused).toBe(false);
  });

  it('la respuesta no distingue «te doy uno nuevo porque no había» de «te doy uno nuevo porque me lo pediste»', async () => {
    await revokeReq({ terminalId: T1 });
    const conReuse = (await (await codeReq({ reuse: true })).json()).data;
    _resetRateLimits();
    const sinReuse = (await (await codeReq()).json()).data;
    // Mismos campos y mismo `reused`: el cliente no tiene forma de saber que
    // el primero también estrenó código.
    expect(Object.keys(conReuse).sort()).toEqual(Object.keys(sinReuse).sort());
    expect(conReuse.reused).toBe(sinReuse.reused);
  });
});
