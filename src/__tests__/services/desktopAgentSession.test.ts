/**
 * POST /api/desktop/agent-session — código de vinculación del agente de
 * impresión de Go Admin Desktop (2026-09-28).
 *
 * Desde que la ventana del Desktop se sirve desde el Next embebido
 * (127.0.0.1, sin clave de servicio), el código lo pide el proceso principal
 * a app.goadmin.io con `Authorization: Bearer` y `X-Organization-Id`, sin
 * cookies. Se comprueba:
 *  - Bearer válido + membresía activa → token_hash del correo DEL TOKEN.
 *  - Bearer inválido → 401 JSON; sin organización explícita → 400; sin
 *    membresía → 403. En ninguno se genera enlace.
 *  - Servidor sin clave de servicio → 503 JSON `SIN_CLAVE_SERVIDOR` (antes
 *    500 sin cuerpo: el Desktop mostraba solo el mensaje genérico).
 */

const mockGetUser = jest.fn();
const mockMembership = jest.fn();
const mockGenerateLink = jest.fn();
const mockCookieUser = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
    from: () => {
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => {
          (q as { filtros: Array<[string, unknown]> }).filtros.push([col, val]);
          return q;
        },
        filtros: [] as Array<[string, unknown]>,
        maybeSingle: async () => mockMembership(q.filtros),
      };
      return q;
    },
  })),
}));

jest.mock('@/lib/supabase/server-user', () => ({
  getServerUserClient: jest.fn(async () => ({
    auth: { getUser: async () => mockCookieUser() },
    from: () => ({}),
  })),
}));

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn() }));
jest.mock('@/lib/security/webhookSignatures', () => ({
  verifyCronSecret: jest.fn(),
  WebhookError: class extends Error {},
}));

jest.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({ auth: { admin: { generateLink: (...a: unknown[]) => mockGenerateLink(...a) } } }),
}));

jest.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
  headers: async () => new Headers(),
}));

import { POST } from '@/app/api/desktop/agent-session/route';

const params = { params: Promise.resolve({}) };

function peticion(headers: Record<string, string>) {
  return new Request('https://app.goadmin.io/api/desktop/agent-session', { method: 'POST', headers });
}

const MIEMBRO = {
  id: 7,
  organization_id: 42,
  is_super_admin: false,
  role_id: 3,
  organizations: { name: 'Org 42' },
  roles: { name: 'Cajero' },
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'cajero@example.com' } }, error: null });
  mockMembership.mockResolvedValue({ data: MIEMBRO, error: null });
  mockGenerateLink.mockResolvedValue({ data: { properties: { hashed_token: 'hash-1' } }, error: null });
  mockCookieUser.mockResolvedValue({ data: { user: null }, error: new Error('sin sesión') });
});

describe('POST /api/desktop/agent-session con Bearer (proceso principal del Desktop)', () => {
  it('token válido + miembro activo → código del correo del token, sin cookies', async () => {
    const res = await POST(peticion({ Authorization: 'Bearer tok', 'X-Organization-Id': '42' }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ token_hash: 'hash-1', email: 'cajero@example.com', organization_id: 42 });
    expect(mockGetUser).toHaveBeenCalledWith('tok');
    expect(mockGenerateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'cajero@example.com' });
    // La membresía se comprueba para ESE usuario y ESA organización.
    expect(mockMembership.mock.calls[0][0]).toEqual(
      expect.arrayContaining([['user_id', 'u1'], ['is_active', true], ['organization_id', 42]]),
    );
    expect(mockCookieUser).not.toHaveBeenCalled();
  });

  it('token inválido → 401 JSON y no se genera enlace', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('bad jwt') });
    const res = await POST(peticion({ Authorization: 'Bearer malo', 'X-Organization-Id': '42' }), params);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(mockGenerateLink).not.toHaveBeenCalled();
  });

  it('sin X-Organization-Id → 400 (sin cookies no hay organización que adivinar)', async () => {
    const res = await POST(peticion({ Authorization: 'Bearer tok' }), params);
    expect(res.status).toBe(400);
    expect(mockGenerateLink).not.toHaveBeenCalled();
  });

  it('organización de la que no es miembro activo → 403', async () => {
    mockMembership.mockResolvedValue({ data: null, error: null });
    const res = await POST(peticion({ Authorization: 'Bearer tok', 'X-Organization-Id': '99' }), params);
    expect(res.status).toBe(403);
    expect(mockGenerateLink).not.toHaveBeenCalled();
  });

  it('sin Bearer ni sesión por cookie → 401 JSON', async () => {
    const res = await POST(peticion({}), params);
    expect(res.status).toBe(401);
    expect(mockGenerateLink).not.toHaveBeenCalled();
  });

  it('servidor sin clave de servicio (Next embebido del Desktop) → 503 JSON con código', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await POST(peticion({ Authorization: 'Bearer tok', 'X-Organization-Id': '42' }), params);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'SIN_CLAVE_SERVIDOR' });
    expect(mockGenerateLink).not.toHaveBeenCalled();
  });
});
