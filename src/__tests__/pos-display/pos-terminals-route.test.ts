/**
 * Fase 2 (parte A, ronda 2) · PATCH /api/pos/terminals/[id] (PLAN §7:
 * Admin/manager; regla dura 6: el rol se resuelve en el servidor).
 *
 * `getServerOrgContext` va doblado (sesión de la organización 120 con el
 * rol que cada caso fija); `readOrgBody`, `isOrgAdminLike` e `isTerminalId`
 * son los reales. `hasOrgAdminOrPermission` (cargo con `admin.full_access`,
 * consulta a la base) se dobla y por defecto niega.
 *
 * - Cajero (rol 4) → 403 ADMIN_REQUIRED, sin tocar la tabla.
 * - Admin (rol 2), Manager (rol 5), super admin y cargo con permiso → 200.
 * - Organización ajena en el body o en la query → 403 FOREIGN_ORGANIZATION.
 * - Id que no es UUID / body vacío o con claves de más → 400.
 * - Código repetido (23505) → 409 DUPLICATE_CODE; fila ajena → 404.
 * - El código se normaliza a mayúsculas; nunca viaja organization_id del body.
 */

const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

interface Update {
  payload: Record<string, unknown>;
  filters: Array<[string, unknown]>;
  columns?: string;
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
      select: (columns: string) => {
        update.columns = columns;
        return chain;
      },
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
import { POS_MANAGER_ROLE_ID, canManagePosTerminalsSync } from '@/lib/pos/display/terminalPermissions';

const T1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: T1,
    organization_id: 120,
    branch_id: 7,
    name: 'Caja 1',
    code: 'CAJA-1',
    is_active: true,
    display_last_seen_at: null,
    created_at: '2026-09-21T10:00:00.000Z',
    updated_at: '2026-09-21T10:00:00.000Z',
    ...overrides,
  };
}

function patch(id: string, body: unknown, query = '') {
  const req = new NextRequest(`http://localhost/api/pos/terminals/${id}${query}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  return PATCH(req, { params: Promise.resolve({ id }) });
}

let warn: jest.SpyInstance;
beforeEach(() => {
  db.updates = [];
  db.row = row();
  db.error = null;
  session.roleId = 4;
  session.isSuperAdmin = false;
  hasOrgAdminOrPermission.mockReset();
  hasOrgAdminOrPermission.mockImplementation(async () => false);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('canManagePosTerminalsSync (criterio síncrono: por id de rol, nunca por nombre)', () => {
  it('super admin, rol 1, rol 2 y Manager (rol 5) pasan; Cliente (3) y Empleado (4) no', () => {
    expect(POS_MANAGER_ROLE_ID).toBe(5);
    expect(canManagePosTerminalsSync({ isSuperAdmin: true, roleId: 99 })).toBe(true);
    expect(canManagePosTerminalsSync({ isSuperAdmin: false, roleId: 1 })).toBe(true);
    expect(canManagePosTerminalsSync({ isSuperAdmin: false, roleId: 2 })).toBe(true);
    expect(canManagePosTerminalsSync({ isSuperAdmin: false, roleId: 5 })).toBe(true);
    expect(canManagePosTerminalsSync({ isSuperAdmin: false, roleId: 3 })).toBe(false);
    expect(canManagePosTerminalsSync({ isSuperAdmin: false, roleId: 4 })).toBe(false);
  });
});

describe('PATCH /api/pos/terminals/[id] · permisos', () => {
  it('cajero (rol 4, sin permiso por cargo) → 403 ADMIN_REQUIRED, registro y la tabla no se toca', async () => {
    const res = await patch(T1, { name: 'Otra' });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'ADMIN_REQUIRED' });
    expect(hasOrgAdminOrPermission).toHaveBeenCalledTimes(1);
    expect(db.updates).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/sin rol admin\/manager/), expect.objectContaining({ organizationId: 120, userId: 'u-1', roleId: 4 }));
  });

  it('admin (rol 2) → 200 sin consultar el permiso por cargo', async () => {
    session.roleId = 2;
    const res = await patch(T1, { name: 'Caja principal' });
    expect(res.status).toBe(200);
    expect(hasOrgAdminOrPermission).not.toHaveBeenCalled();
    expect(db.updates).toHaveLength(1);
  });

  it('manager (rol 5) → 200', async () => {
    session.roleId = 5;
    const res = await patch(T1, { is_active: false });
    expect(res.status).toBe(200);
    expect(db.updates[0].payload).toMatchObject({ is_active: false });
  });

  it('cajero con cargo que tiene admin.full_access (check_user_permission) → 200', async () => {
    hasOrgAdminOrPermission.mockImplementation(async () => true);
    const res = await patch(T1, { name: 'Caja principal' });
    expect(res.status).toBe(200);
  });

  it('organización ajena en el body → 403 FOREIGN_ORGANIZATION antes de mirar el rol y sin escritura', async () => {
    session.roleId = 2;
    const res = await patch(T1, { name: 'Otra', organization_id: 999 });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'FOREIGN_ORGANIZATION' });
    expect(hasOrgAdminOrPermission).not.toHaveBeenCalled();
    expect(db.updates).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/organization_id ajeno/), expect.objectContaining({ session: 120, body: 999 }));
  });

  it('organización ajena en la query → 403 FOREIGN_ORGANIZATION', async () => {
    session.roleId = 2;
    const res = await patch(T1, { name: 'Otra' }, '?orgId=999');
    expect(res.status).toBe(403);
    expect(db.updates).toHaveLength(0);
  });

  it('la organización de la sesión en el body (o camelCase) no es ajena: 200', async () => {
    session.roleId = 2;
    expect((await patch(T1, { name: 'Otra', organizationId: 120 })).status).toBe(200);
  });
});

describe('PATCH /api/pos/terminals/[id] · cuerpo, fila y errores', () => {
  beforeEach(() => {
    session.roleId = 2;
  });

  it('actualiza por id Y organización de la sesión, solo columnas de identidad, y devuelve la fila', async () => {
    db.row = row({ name: 'Caja principal', code: 'PRINCIPAL' });
    const res = await patch(T1, { name: ' Caja principal ', code: ' principal ' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: row({ name: 'Caja principal', code: 'PRINCIPAL' }) });
    const u = db.updates[0];
    expect(u.payload).toEqual({ name: 'Caja principal', code: 'PRINCIPAL', updated_at: expect.any(String) });
    expect(u.filters).toEqual([
      ['id', T1],
      ['organization_id', 120],
    ]);
    expect(u.columns?.split(',').map((c) => c.trim())).toEqual(['id', 'organization_id', 'branch_id', 'name', 'code', 'is_active', 'display_last_seen_at', 'created_at', 'updated_at']);
  });

  it('nunca escribe organization_id, branch_id ni columnas que no sean nombre/código/activo', async () => {
    const res = await patch(T1, { name: 'x', branch_id: 99 });
    expect(res.status).toBe(400); // .strict(): claves de más → 400
    expect(db.updates).toHaveLength(0);
  });

  it('id que no es UUID → 400 INVALID_ID; body vacío → 400 INVALID_BODY; código inválido → 400', async () => {
    expect((await patch('caja-1', { name: 'x' })).status).toBe(400);
    expect(await (await patch('caja-1', { name: 'x' })).json()).toMatchObject({ code: 'INVALID_ID' });
    expect(await (await patch(T1, {})).json()).toMatchObject({ code: 'INVALID_BODY' });
    expect((await patch(T1, { code: 'con espacio' })).status).toBe(400);
    expect((await patch(T1, { name: '   ' })).status).toBe(400);
    expect((await patch(T1, { name: 'x'.repeat(81) })).status).toBe(400);
    expect((await patch(T1, { is_active: 'no' })).status).toBe(400);
    expect(db.updates).toHaveLength(0);
  });

  it('código repetido en la sucursal (23505) → 409 DUPLICATE_CODE', async () => {
    db.error = { code: '23505', message: 'duplicate key value violates unique constraint "pos_terminals_code_unico"' };
    const res = await patch(T1, { code: 'CAJA-2' });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'DUPLICATE_CODE' });
  });

  it('fila inexistente o de otra organización (RLS/filtro no devuelve nada) → 404', async () => {
    db.row = null;
    const res = await patch(T1, { name: 'x' });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('otro error de la base → 500 sin filtrar el mensaje interno', async () => {
    db.error = { message: 'connection reset' };
    const res = await patch(T1, { name: 'x' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'No se pudo actualizar la terminal', code: 'UPDATE_FAILED' });
  });

  it('sin sesión (getServerOrgContext lanza 401) → 401 con su código', async () => {
    const orgContext = jest.requireMock<{ getServerOrgContext: jest.Mock }>('@/lib/utils/orgContext');
    orgContext.getServerOrgContext.mockImplementationOnce(async () => {
      throw new OrgContextError('No autenticado', 401, 'UNAUTHENTICATED');
    });
    const res = await patch(T1, { name: 'x' });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});
