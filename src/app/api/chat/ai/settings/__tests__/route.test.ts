/**
 * PATCH /api/chat/ai/settings: la configuración del chat IA solo la cambia
 * quien tiene `admin.full_access` (resuelto en el servidor), la organización
 * sale de la sesión y el body pasa por zod.
 */
import { OrgContextError } from '@/lib/utils/orgContextError';

const tienePermiso = jest.fn();
let escrituras: { op: string; tabla: string; valores?: unknown; filtro?: unknown }[];
let filaExistente: Record<string, unknown> | null;

function fakeSupabase() {
  return {
    from(tabla: string) {
      const estado: { op: string; valores?: unknown; filtro?: unknown } = { op: 'select' };
      const q = {
        select: () => q,
        eq: (_c: string, v: unknown) => {
          estado.filtro = v;
          return q;
        },
        update: (valores: unknown) => {
          estado.op = 'update';
          estado.valores = valores;
          return q;
        },
        insert: (valores: unknown) => {
          estado.op = 'insert';
          estado.valores = valores;
          if (tabla === 'chat_audit_logs') {
            escrituras.push({ op: 'insert', tabla, valores });
            return Promise.resolve({ error: null });
          }
          return q;
        },
        maybeSingle: async () => {
          if (estado.op === 'select') return { data: filaExistente, error: null };
          escrituras.push({ op: estado.op, tabla, valores: estado.valores, filtro: estado.filtro });
          return { data: { organization_id: 120, ...(filaExistente ?? {}), ...(estado.valores as object) }, error: null };
        },
      };
      return q;
    },
  };
}

const ctx = { userId: 'u-1', organizationId: 120, roleId: 3, isSuperAdmin: false, memberId: 7, supabase: fakeSupabase() };

jest.mock('@/lib/utils/orgContext', () => {
  const { readOrgBody } = jest.requireActual('@/lib/security/organizationBody');
  const { OrgContextError: Err } = jest.requireActual('@/lib/utils/orgContextError');
  return {
    getServerOrgContext: async () => ctx,
    readOrgBody,
    OrgContextError: Err,
    requireOrgAdminOrPermission: async (c: unknown, codigo: string) => {
      if (!(await tienePermiso(c, codigo))) throw new Err('Requiere rol de administrador de la organización', 403, 'ADMIN_REQUIRED');
    },
  };
});

import { PATCH } from '../route';

const peticion = (body: unknown) =>
  new Request('https://erp.example/api/chat/ai/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(() => {
  escrituras = [];
  filaExistente = { organization_id: 120, model: 'gpt-4o-mini', is_active: true };
  ctx.supabase = fakeSupabase();
  tienePermiso.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

test('sin permiso de administrador: 403 y no se escribe nada', async () => {
  tienePermiso.mockResolvedValue(false);
  const res = await PATCH(peticion({ model: 'gpt-4o' }));
  expect(res.status).toBe(403);
  expect(escrituras).toEqual([]);
  expect(tienePermiso).toHaveBeenCalledWith(ctx, 'admin.full_access');
});

test('otra organización en el body: 403 aunque tenga permiso', async () => {
  tienePermiso.mockResolvedValue(true);
  const res = await PATCH(peticion({ organization_id: 999, model: 'gpt-4o' }));
  expect(res.status).toBe(403);
  expect(((await res.json()) as { code: string }).code).toBe('FOREIGN_ORGANIZATION');
  expect(escrituras).toEqual([]);
});

test('con permiso: 200, actualiza la fila de la organización de la sesión y audita', async () => {
  tienePermiso.mockResolvedValue(true);
  const res = await PATCH(peticion({ organization_id: 120, model: 'gpt-4o', temperature: 0.4, is_active: false }));
  expect(res.status).toBe(200);
  const upd = escrituras.find((e) => e.tabla === 'ai_settings')!;
  expect(upd.op).toBe('update');
  expect(upd.filtro).toBe(120);
  expect(upd.valores).toMatchObject({ model: 'gpt-4o', temperature: 0.4, is_active: false });
  expect(upd.valores).not.toHaveProperty('organization_id');
  expect(escrituras.some((e) => e.tabla === 'chat_audit_logs')).toBe(true);
});

test('sin fila: la crea con la organización de la sesión', async () => {
  tienePermiso.mockResolvedValue(true);
  filaExistente = null;
  const res = await PATCH(peticion({ is_active: true }));
  expect(res.status).toBe(200);
  expect(escrituras.find((e) => e.tabla === 'ai_settings')).toMatchObject({ op: 'insert', valores: { organization_id: 120, is_active: true } });
});

test.each([
  ['créditos (columna no permitida)', { credits_remaining: 999999 }],
  ['temperatura fuera del CHECK', { temperature: 3 }],
  ['tono que la base rechaza', { tone: 'empathetic' }],
  ['body vacío', {}],
])('400 con %s', async (_n, body) => {
  tienePermiso.mockResolvedValue(true);
  const res = await PATCH(peticion(body));
  expect(res.status).toBe(400);
  expect(escrituras).toEqual([]);
});

test('el error de sesión se respeta (401)', async () => {
  const { getServerOrgContext } = jest.requireMock('@/lib/utils/orgContext') as { getServerOrgContext: () => Promise<unknown> };
  const original = getServerOrgContext;
  (jest.requireMock('@/lib/utils/orgContext') as Record<string, unknown>).getServerOrgContext = async () => {
    throw new OrgContextError('Sin sesión', 401, 'UNAUTHENTICATED');
  };
  const res = await PATCH(peticion({ model: 'x' }));
  (jest.requireMock('@/lib/utils/orgContext') as Record<string, unknown>).getServerOrgContext = original;
  expect(res.status).toBe(401);
});
