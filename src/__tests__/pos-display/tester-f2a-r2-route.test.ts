/**
 * TESTER · Fase 2, parte A, RONDA 2 · PATCH /api/pos/terminals/[id]:
 * cuerpos límite y fallos que pos-terminals-route.test.ts no ejercita.
 *
 * - `is_active: null` / `"true"` / `1` → 400 (booleano estricto).
 * - `branch_id`, `organization_id` ajeno en camelCase, `display_last_seen_at`
 *   en el body → 400 (strict) o 403 (ajeno), nunca se escriben.
 * - Nombre de 81 → 400; nombre solo NBSP → 400; código «  caja-1 » → CAJA-1.
 * - JSON malformado → 400 INVALID_JSON (no 500).
 * - Error RLS 42501 de la base → 500 UPDATE_FAILED (no se confunde con 409).
 * - `hasOrgAdminOrPermission` que lanza → 500 y sin escritura (fail-closed).
 * - Cajero con id inválido → 403 (el rol se juzga antes que el id).
 * - Nunca escribe organization_id ni branch_id; siempre escribe updated_at ISO.
 */

const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

interface Update {
  payload: Record<string, unknown>;
  filters: Array<[string, unknown]>;
}
const db: { updates: Update[]; row: unknown; error: { code?: string; message: string } | null } = { updates: [], row: null, error: null };

const supabase = {
  from: (table: string) => {
    if (table !== 'pos_terminals') throw new Error(`tabla inesperada: ${table}`);
    const update: Update = { payload: {}, filters: [] };
    const chain = {
      update: (payload: Record<string, unknown>) => {
        update.payload = payload;
        db.updates.push(update);
        return chain;
      },
      eq: (col: string, value: unknown) => {
        update.filters.push([col, value]);
        return chain;
      },
      select: () => chain,
      maybeSingle: async () => (db.error ? { data: null, error: db.error } : { data: db.row, error: null }),
    };
    return chain;
  },
};

const session = {
  organizationId: 120,
  userId: 'u-1',
  roleId: 4,
  roleName: 'x',
  isSuperAdmin: false,
  organizationName: 'Org 120',
  memberId: 1,
  supabase: supabase as never,
};
const hasOrgAdminOrPermission = jest.fn(async () => false);
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError,
  getServerOrgContext: jest.fn(async () => session),
  hasOrgAdminOrPermission: (...a: unknown[]) => hasOrgAdminOrPermission(...(a as [])),
}));

import { NextRequest } from 'next/server';
import { PATCH } from '@/app/api/pos/terminals/[id]/route';

const T1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: T1, organization_id: 120, branch_id: 7, name: 'Caja 1', code: 'CAJA-1', is_active: true,
    display_last_seen_at: null, created_at: '2026-09-21T10:00:00.000Z', updated_at: '2026-09-21T10:00:00.000Z', ...overrides,
  };
}

function patchRaw(id: string, body: string, query = '') {
  const req = new NextRequest(`http://localhost/api/pos/terminals/${id}${query}`, {
    method: 'PATCH',
    body,
    headers: { 'content-type': 'application/json' },
  });
  return PATCH(req, { params: Promise.resolve({ id }) });
}
const patch = (id: string, body: unknown, query = '') => patchRaw(id, JSON.stringify(body), query);

beforeEach(() => {
  db.updates = [];
  db.row = row();
  db.error = null;
  session.roleId = 2;
  session.isSuperAdmin = false;
  hasOrgAdminOrPermission.mockReset();
  hasOrgAdminOrPermission.mockImplementation(async () => false);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('PATCH /api/pos/terminals/[id] · cuerpos límite (ronda 2)', () => {
  it.each([
    ['is_active null', { is_active: null }],
    ['is_active "true"', { is_active: 'true' }],
    ['is_active 1', { is_active: 1 }],
    ['branch_id (no es parcheable)', { name: 'X', branch_id: 3 }],
    ['display_last_seen_at', { display_last_seen_at: '2026-01-01T00:00:00Z' }],
    ['name de 81', { name: 'a'.repeat(81) }],
    ['name solo NBSP', { name: '  ' }],
    ['code con espacio interno', { code: 'CAJA 1' }],
    ['code de 21', { code: 'A'.repeat(21) }],
    ['body array', [{ name: 'X' }]],
    ['body string', 'X'],
    ['body null', null],
  ])('%s → 400 INVALID_BODY y la tabla no se toca', async (_label, body) => {
    const res = await patch(T1, body);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'INVALID_BODY' });
    expect(db.updates).toHaveLength(0);
  });

  it('JSON malformado → 400 INVALID_JSON (no 500)', async () => {
    const res = await patchRaw(T1, '{ name: ');
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'INVALID_JSON' });
    expect(db.updates).toHaveLength(0);
  });

  it('organización ajena en camelCase (orgId) junto a un parche válido → 403 y sin escritura, aunque el rol sea admin', async () => {
    const res = await patch(T1, { name: 'X', orgId: 999 });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'FOREIGN_ORGANIZATION' });
    expect(db.updates).toHaveLength(0);
  });

  it('código «  caja-1 » → CAJA-1; nombre con espacios alrededor se recorta; updated_at ISO; nunca organization_id/branch_id en el update', async () => {
    const res = await patch(T1, { name: '  Caja principal  ', code: '  caja-1 ' });
    expect(res.status).toBe(200);
    const [u] = db.updates;
    expect(u.payload.name).toBe('Caja principal');
    expect(u.payload.code).toBe('CAJA-1');
    expect(typeof u.payload.updated_at).toBe('string');
    expect(() => new Date(u.payload.updated_at as string).toISOString()).not.toThrow();
    expect(Object.keys(u.payload).sort()).toEqual(['code', 'name', 'updated_at']);
    expect(u.filters).toEqual([
      ['id', T1],
      ['organization_id', 120],
    ]);
  });

  it('error RLS 42501 de la base (with_check) → 500 UPDATE_FAILED, no 409', async () => {
    db.error = { code: '42501', message: 'new row violates row-level security policy' };
    const res = await patch(T1, { name: 'X' });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: 'UPDATE_FAILED' });
  });

  it('hasOrgAdminOrPermission que LANZA con un cajero → 500 INTERNAL y sin escritura (fail-closed, nunca 200)', async () => {
    session.roleId = 4;
    hasOrgAdminOrPermission.mockImplementation(async () => {
      throw new Error('rpc caída');
    });
    const res = await patch(T1, { name: 'X' });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: 'INTERNAL' });
    expect(db.updates).toHaveLength(0);
  });

  it('cajero con id que no es UUID → 403 ADMIN_REQUIRED (el rol se juzga antes que el id: no se filtra si un id existe)', async () => {
    session.roleId = 4;
    const res = await patch('no-uuid', { name: 'X' });
    expect(res.status).toBe(403);
  });

  it('is_active false solo: el update lleva is_active y updated_at, nada más; la fila devuelta es la de la base', async () => {
    db.row = row({ is_active: false });
    const res = await patch(T1, { is_active: false });
    expect(res.status).toBe(200);
    expect(Object.keys(db.updates[0].payload).sort()).toEqual(['is_active', 'updated_at']);
    expect((await res.json()).data.is_active).toBe(false);
  });

  it('rol Manager (5) con sesión de OTRA organización en cabecera: el update filtra por la organización de la sesión y una fila ajena → 404', async () => {
    session.roleId = 5;
    session.organizationId = 121;
    db.row = null; // el filtro organization_id = 121 no devuelve la fila de la 120
    const res = await patch(T1, { name: 'X' });
    expect(res.status).toBe(404);
    expect(db.updates[0].filters).toContainEqual(['organization_id', 121]);
    session.organizationId = 120;
  });
});
