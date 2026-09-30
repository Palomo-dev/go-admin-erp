/**
 * Rutas de apoyo de la interfaz de reportes v2:
 * - `GET /api/reportes/permisos` resuelve en el servidor qué botones se
 *   muestran (exportar, firmar, reabrir, administrar), nunca por el rol.
 * - `POST /api/reportes/solicitar-acceso` avisa a los administradores de la
 *   organización de la sesión (por `role_id`/`is_super_admin`), una vez cada
 *   `ESPERA_SOLICITUD_MS`; una organización ajena en el body es 403.
 */
import { fakeTablas } from './fakeTablas';

const ORG = 120;
const YO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ADMIN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DUENO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CAJERO = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const guion = { roleId: 4, permisos: new Set<string>() };
let sesion = fakeTablas({});
let servicio = fakeTablas({});

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => servicio }));
jest.mock('@/lib/utils/orgContext', () => {
  const { OrgContextError: Err } = jest.requireActual('@/lib/utils/orgContextError');
  const { readOrgBody } = jest.requireActual('@/lib/security/organizationBody');
  return {
    OrgContextError: Err,
    readOrgBody,
    hasOrgAdminOrPermission: jest.fn(async (s: { roleId: number }, code = 'admin.full_access') => s.roleId === 1 || s.roleId === 2 || guion.permisos.has(code)),
    withOrg:
      (handler: (c: unknown, r: Request, p: unknown) => Promise<Response>) =>
      async (req: Request, params: unknown) => {
        const ctx = { userId: YO, organizationId: ORG, roleId: guion.roleId, isSuperAdmin: false, memberId: 55, supabase: sesion };
        try {
          return await handler(ctx, req, params);
        } catch (err) {
          if (err instanceof Err) {
            const e = err as { message: string; code: string; statusCode: number };
            return new Response(JSON.stringify({ error: e.message, code: e.code }), { status: e.statusCode });
          }
          throw err;
        }
      },
  };
});

import { GET as permisos } from '@/app/api/reportes/permisos/route';
import { POST as solicitar } from '@/app/api/reportes/solicitar-acceso/route';
import { ESPERA_SOLICITUD_MS, TIPO_SOLICITUD_ACCESO } from '../solicitudAcceso.server';

const pedir = (body: unknown) =>
  new Request('http://x/api/reportes/solicitar-acceso', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

function miembros() {
  return [
    { organization_id: ORG, user_id: YO, role_id: 4, is_super_admin: false, is_active: true },
    { organization_id: ORG, user_id: ADMIN, role_id: 2, is_super_admin: false, is_active: true },
    { organization_id: ORG, user_id: DUENO, role_id: 7, is_super_admin: true, is_active: true },
    { organization_id: ORG, user_id: CAJERO, role_id: 5, is_super_admin: false, is_active: true },
  ];
}

beforeEach(() => {
  guion.roleId = 4;
  guion.permisos = new Set();
  sesion = fakeTablas(
    { organization_members: miembros(), profiles: [{ id: YO, first_name: 'Laura', last_name: 'Gómez', email: 'laura@example.com' }] },
    { fn_create_org_notification: () => 'n-1' },
  );
  servicio = fakeTablas({ notifications: [] });
});

describe('GET /api/reportes/permisos', () => {
  test('responde cada permiso resuelto en el servidor', async () => {
    guion.permisos = new Set(['reports.export', 'finance.approve']);
    const r = await permisos(new Request('http://x/api/reportes/permisos'), undefined as never);
    expect(r.status).toBe(200);
    expect((await r.json()).resultado).toEqual({ exportar: true, firmar: true, reabrir: false, admin: false });
  });

  test('un administrador (rol 2) los tiene todos', async () => {
    guion.roleId = 2;
    const r = await permisos(new Request('http://x/api/reportes/permisos'), undefined as never);
    expect((await r.json()).resultado).toEqual({ exportar: true, firmar: true, reabrir: true, admin: true });
  });
});

describe('POST /api/reportes/solicitar-acceso', () => {
  test('notifica solo a los administradores activos (rol 1/2 o super admin), no a quien pide ni al cajero', async () => {
    const r = await solicitar(pedir({ reportId: 'estado-resultados', sucursalId: 3 }), undefined as never);
    expect(r.status).toBe(200);
    expect((await r.json()).resultado).toEqual({ notificados: 2, repetida: false });
    const llamadas = sesion.llamadas.filter((l) => l.nombre === 'fn_create_org_notification');
    expect(llamadas.map((l) => l.args.p_recipient_user_id).sort()).toEqual([ADMIN, DUENO].sort());
    for (const l of llamadas) {
      expect(l.args.p_organization_id).toBe(ORG);
      expect(l.args.p_type).toBe(TIPO_SOLICITUD_ACCESO);
      expect(l.args.p_metadata).toMatchObject({ solicitante: YO, report_id: 'estado-resultados', branch_id: 3 });
      expect(String(l.args.p_content)).toContain('Laura Gómez');
    }
  });

  test('una solicitud reciente no vuelve a notificar', async () => {
    servicio = fakeTablas({
      notifications: [
        { id: 'n-0', organization_id: ORG, payload: { type: TIPO_SOLICITUD_ACCESO, solicitante: YO }, created_at: new Date(Date.now() - 60_000).toISOString() },
      ],
    });
    const r = await solicitar(pedir({}), undefined as never);
    expect((await r.json()).resultado).toEqual({ notificados: 0, repetida: true });
    expect(sesion.llamadas.filter((l) => l.nombre === 'fn_create_org_notification')).toHaveLength(0);
  });

  test('pasada la espera, se puede pedir otra vez', async () => {
    servicio = fakeTablas({
      notifications: [
        { id: 'n-0', organization_id: ORG, payload: { type: TIPO_SOLICITUD_ACCESO, solicitante: YO }, created_at: new Date(Date.now() - ESPERA_SOLICITUD_MS - 60_000).toISOString() },
      ],
    });
    const r = await solicitar(pedir({}), undefined as never);
    expect((await r.json()).resultado.notificados).toBe(2);
  });

  test('una organización ajena en el body es 403 y no notifica', async () => {
    const r = await solicitar(pedir({ organization_id: 999 }), undefined as never);
    expect(r.status).toBe(403);
    expect(sesion.llamadas).toHaveLength(0);
  });

  test('sin administradores a quien avisar: 409', async () => {
    sesion = fakeTablas({ organization_members: miembros().filter((m) => m.user_id === YO || m.user_id === CAJERO), profiles: [] });
    const r = await solicitar(pedir({}), undefined as never);
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe('sin_administradores');
  });

  test('un reportId con caracteres raros es 400', async () => {
    const r = await solicitar(pedir({ reportId: '../x' }), undefined as never);
    expect(r.status).toBe(400);
  });
});
