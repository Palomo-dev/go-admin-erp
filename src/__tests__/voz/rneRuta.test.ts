/**
 * /api/crm/voice-agents/campaigns/[id]/rne — puertas del servidor.
 *
 *  - Sin sesión → 401 (lo pone `withOrg`).
 *  - POST sin permiso de administrador → 403 y el servicio no se toca.
 *  - Organización ajena en el cuerpo → 403 FOREIGN_ORGANIZATION (`readOrgBody`
 *    REAL, no un doble) y el servicio no se toca.
 *  - El servicio recibe SIEMPRE la organización de la sesión.
 *
 * `withOrg` se sustituye por un doble con su misma semántica (sesión → 401,
 * `admin: true` → 403, `OrgContextError` → JSON con su código): el real
 * necesita cookies y Supabase. `readOrgBody` es el de producción.
 */

import { NextRequest } from 'next/server';
import { fakeSupabase, makeDb } from '@/app/api/crm/__tests__/ola1Fake';
let userClient: ReturnType<typeof fakeSupabase>;

const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
const { readOrgBody } = jest.requireActual<typeof import('@/lib/security/organizationBody')>('@/lib/security/organizationBody');

const sesion: { ctx: Record<string, unknown> | null; admin: boolean } = { ctx: null, admin: false };

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError,
  readOrgBody,
  hasOrgAdminOrPermission: jest.fn(async (_ctx: unknown, code: string) => code === 'crm.opportunities.view' || sesion.admin),
  withOrg:
    (handler: (ctx: unknown, req: Request, rp: unknown) => Promise<Response>, opts?: { admin?: boolean }) =>
    async (req: Request, rp: unknown) => {
      try {
        if (!sesion.ctx) throw new OrgContextError('No autenticado', 401, 'UNAUTHENTICATED');
        if (opts?.admin && !sesion.admin) throw new OrgContextError('Requiere administrador', 403, 'FORBIDDEN');
        return await handler(sesion.ctx, req, rp);
      } catch (err) {
        if (err instanceof OrgContextError) {
          const e = err as InstanceType<typeof OrgContextError>;
          return new Response(JSON.stringify({ error: e.message, code: e.code }), { status: e.statusCode });
        }
        throw err;
      }
    },
}));

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn(() => ({ service: true })) }));

const registrar = jest.fn();
jest.mock('@/lib/services/crm/voiceAgent/rneService', () => {
  class RneValidationError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 400) {
      super(message);
      this.statusCode = statusCode;
    }
  }
  return { RneValidationError, registrarVerificacionRne: (...a: unknown[]) => registrar(...a) };
});

const ultima = jest.fn();
jest.mock('@/lib/services/crm/voiceAgent/cumplimiento', () => ({
  ultimaVerificacionRne: (...a: unknown[]) => ultima(...a),
}));

import { GET, POST } from '@/app/api/crm/voice-agents/campaigns/[id]/rne/route';
import { RneValidationError } from '@/lib/services/crm/voiceAgent/rneService';

const CAMPANA = '0a9d96a9-29f7-4aad-b457-c6167c078393';
const rp = (id = CAMPANA) => ({ params: Promise.resolve({ id }) });
const url = (id = CAMPANA) => `http://localhost/api/crm/voice-agents/campaigns/${id}/rne`;
const post = (body: unknown, id = CAMPANA) =>
  POST(new NextRequest(url(id), { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }), rp(id));

beforeEach(() => {
  userClient = fakeSupabase(makeDb({ voice_agent_campaigns: [{ id: CAMPANA, organization_id: 7 }] }));
  sesion.ctx = { organizationId: 7, userId: 'u-1', supabase: userClient };
  sesion.admin = true;
  registrar.mockReset();
  ultima.mockReset();
});

describe('GET', () => {
  test.each(['organization_id=999', 'organizationId=999', 'orgId=999', 'org_id=999', 'organization_id=7&organization_id=999'])('organización ajena en query se rechaza antes de consultar RNE: %s', async query => {
    const res = await GET(new NextRequest(url() + '?' + query), rp());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('FOREIGN_ORGANIZATION');
    expect(ultima).not.toHaveBeenCalled();
  });
  test.each([
    { evidence_available: false, audience_unchanged: false, changed_targets: 0 },
    { evidence_available: true, audience_unchanged: false, changed_targets: 1 },
  ])('una fecha futura no habilita una constancia sin evidencia válida: %j', async evidence => {
    ultima.mockResolvedValue({ valid_until: '2999-01-01T00:00:00Z', numbers_in_file: 2, ...evidence });
    const res = await GET(new NextRequest(url()), rp());
    expect(res.status).toBe(200);
    expect((await res.json()).data.vigente).toBe(false);
  });
  test('una constancia futura con cero números no habilita llamadas', async () => {
    ultima.mockResolvedValue({ valid_until: '2999-01-01T00:00:00Z', numbers_in_file: 0 });
    const res = await GET(new NextRequest(url()), rp());
    expect((await res.json()).data.vigente).toBe(false);
  });
  test('sin sesión → 401', async () => {
    sesion.ctx = null;
    const res = await GET(new NextRequest(url()), rp());
    expect(res.status).toBe(401);
    expect(ultima).not.toHaveBeenCalled();
  });

  test('miembro: devuelve la última verificación con la organización de la sesión y el permiso del servidor', async () => {
    sesion.admin = false;
    ultima.mockResolvedValue({ id: 'c1', valid_until: '2999-01-01T00:00:00Z', checked_at: '2026-09-30T00:00:00Z', numbers_in_file: 2 });
    const res = await GET(new NextRequest(url()), rp());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(ultima).toHaveBeenCalledWith(userClient, 7, CAMPANA);
    expect(body.data.vigente).toBe(true);
    expect(body.puede_verificar).toBe(false);
  });

  test('id de campaña que no es un uuid → 400', async () => {
    const res = await GET(new NextRequest(url('no-uuid')), rp('no-uuid'));
    expect(res.status).toBe(400);
  });
});

describe('POST', () => {
  test('sin sesión → 401', async () => {
    sesion.ctx = null;
    expect((await post({ contenido: '3001112233' })).status).toBe(401);
    expect(registrar).not.toHaveBeenCalled();
  });

  test('miembro sin permiso de administrador → 403', async () => {
    sesion.admin = false;
    expect((await post({ contenido: '3001112233' })).status).toBe(403);
    expect(registrar).not.toHaveBeenCalled();
  });

  test('organización ajena en el cuerpo → 403 FOREIGN_ORGANIZATION', async () => {
    const res = await post({ organization_id: 999, contenido: '3001112233' });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('FOREIGN_ORGANIZATION');
    expect(registrar).not.toHaveBeenCalled();
  });

  test('el servicio recibe la organización de la SESIÓN y el usuario', async () => {
    registrar.mockResolvedValue({ excluded_targets: 2, numbers_in_file: 10 });
    const res = await post({ nombre_archivo: 'rne.csv', contenido: '3001112233\n3004445566' });
    expect(res.status).toBe(200);
    expect(registrar).toHaveBeenCalledWith({ service: true }, 7, CAMPANA, 'u-1', {
      nombre: 'rne.csv',
      contenido: '3001112233\n3004445566',
    });
    expect((await res.json()).data.excluded_targets).toBe(2);
  });

  test('error de validación del servicio → su código (413, 404, 400)', async () => {
    registrar.mockRejectedValue(new RneValidationError('El archivo supera 8 MB.', 413));
    expect((await post({ contenido: 'x' })).status).toBe(413);
    registrar.mockRejectedValue(new RneValidationError('Campaña no encontrada', 404));
    expect((await post({ contenido: 'x' })).status).toBe(404);
  });
});
