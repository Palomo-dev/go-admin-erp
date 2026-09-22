import { NextRequest } from 'next/server';
import { GET, PATCH } from '../route';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { checkRateLimit } from '@/lib/security/rateLimit';

jest.mock('@/lib/utils/orgContext', () => ({ getServerOrgContext: jest.fn() }));
jest.mock('@/lib/security/rateLimit', () => ({ checkRateLimit: jest.fn() }));

const session = jest.mocked(getServerOrgContext);
const rateLimit = jest.mocked(checkRateLimit);
const query = {
  select: jest.fn(), eq: jest.fn(), maybeSingle: jest.fn(),
  upsert: jest.fn(), single: jest.fn(),
};
const from = jest.fn(() => query);

function request(method = 'GET', body?: unknown, search = '') {
  return new NextRequest(`http://localhost/api/ai-assistant/settings${search}`, {
    method,
    ...(body === undefined ? {} : {
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.upsert.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: null, error: null });
  query.single.mockResolvedValue({ data: { capability_level: 'write_low' }, error: null });
  session.mockResolvedValue({
    organizationId: 120, userId: 'user-a', roleId: 2, roleName: 'Administrador',
    isSuperAdmin: false, supabase: { from },
  } as unknown as Awaited<ReturnType<typeof getServerOrgContext>>);
  rateLimit.mockResolvedValue({ allowed: true, remaining: 9, count: 1, resetAt: new Date() });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

test('GET sin fila devuelve write_full y permiso admin sin crear configuración', async () => {
  const response = await GET(request());
  expect(await response.json()).toEqual({ capability_level: 'write_full', can_manage: true });
  expect(query.eq).toHaveBeenCalledWith('organization_id', 120);
  expect(query.upsert).not.toHaveBeenCalled();
  expect(response.headers.get('Cache-Control')).toContain('no-store');
});

test.each(['off', 'read', 'write_low', 'write_full'])('GET respeta el nivel explícito %s sin modificarlo', async (level) => {
  query.maybeSingle.mockResolvedValue({ data: { capability_level: level }, error: null });
  expect((await (await GET(request())).json()).capability_level).toBe(level);
  expect(query.upsert).not.toHaveBeenCalled();
});

test.each(['GET', 'PATCH'])('%s sin sesión devuelve 401 sin consultar BD', async (method) => {
  session.mockRejectedValue(new OrgContextError('Inicia sesión', 401));
  expect((await (method === 'GET' ? GET(request()) : PATCH(request('PATCH', {})))).status).toBe(401);
  expect(from).not.toHaveBeenCalled();
});

test('un nombre de rol admin no permite modificar y GET informa solo lectura', async () => {
  const ctx = await session();
  session.mockResolvedValue({ ...ctx, roleId: 99, roleName: 'Super Admin' });
  expect((await (await GET(request())).json()).can_manage).toBe(false);
  expect((await PATCH(request('PATCH', { capability_level: 'write_low' }))).status).toBe(403);
  expect(query.upsert).not.toHaveBeenCalled();
});

test.each(['off', 'read', 'write_low', 'write_full'])('PATCH admin guarda %s solo en tenant de sesión', async (level) => {
  query.single.mockResolvedValue({ data: { capability_level: level }, error: null });
  const response = await PATCH(request('PATCH', { capability_level: level }));
  expect(response.status).toBe(200);
  const [payload, options] = query.upsert.mock.calls[0];
  expect(payload).toEqual({ organization_id: 120, capability_level: level, updated_at: expect.any(String) });
  expect(options).toEqual({ onConflict: 'organization_id' });
  expect(Object.keys(payload).sort()).toEqual(['capability_level', 'organization_id', 'updated_at']);
});

test('super admin de la membresía actual puede modificar', async () => {
  const ctx = await session();
  session.mockResolvedValue({ ...ctx, roleId: 99, isSuperAdmin: true });
  expect((await PATCH(request('PATCH', { capability_level: 'read' }))).status).toBe(200);
});

test('al cambiar de sesión usa el nuevo tenant tanto para lectura como escritura', async () => {
  const ctx = await session();
  session.mockResolvedValue({ ...ctx, organizationId: 240, userId: 'user-b', roleId: 1 });
  await GET(request());
  await PATCH(request('PATCH', { capability_level: 'off' }));
  expect(query.eq).toHaveBeenCalledWith('organization_id', 240);
  expect(query.upsert).toHaveBeenCalledWith(expect.objectContaining({ organization_id: 240 }), expect.anything());
  expect(rateLimit).toHaveBeenCalledWith('assistant:settings:PATCH:240:user-b', expect.anything());
});

test.each(['organizationId', 'organization_id', 'orgId', 'org_id'])('rechaza tenant ajeno en %s', async (key) => {
  expect((await PATCH(request('PATCH', { capability_level: 'read', [key]: 999 }))).status).toBe(403);
  expect(query.upsert).not.toHaveBeenCalled();
});

test.each(['GET', 'PATCH'])('%s rechaza organización ajena en query', async (method) => {
  const req = request(method, method === 'PATCH' ? { capability_level: 'read' } : undefined, '?organization_id=999');
  expect((await (method === 'GET' ? GET(req) : PATCH(req))).status).toBe(403);
  expect(from).not.toHaveBeenCalled();
});

test.each([
  {}, null, [], { capability_level: 'invalid' },
  { capability_level: 'read', voice_enabled: true }, { capability_level: 'read', userRole: 'admin' },
  { capability_level: 'read', organization_id: 120 },
])('validación estricta rechaza %j sin escritura', async (body) => {
  expect((await PATCH(request('PATCH', body))).status).toBe(400);
  expect(query.upsert).not.toHaveBeenCalled();
});

test('JSON mal formado devuelve 400', async () => {
  const req = new NextRequest('http://localhost/api/ai-assistant/settings', {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{',
  });
  expect((await PATCH(req)).status).toBe(400);
});

test.each(['GET', 'PATCH'])('%s limitado devuelve 429 sin BD', async (method) => {
  rateLimit.mockResolvedValue({ allowed: false, remaining: 0, count: 99, resetAt: new Date(Date.now() + 60000) });
  const response = await (method === 'GET' ? GET(request()) : PATCH(request('PATCH', { capability_level: 'read' })));
  expect(response.status).toBe(429);
  expect(response.headers.get('Retry-After')).toBeTruthy();
  expect(from).not.toHaveBeenCalled();
});

test('fallo de lectura no concede write_full por defecto', async () => {
  query.maybeSingle.mockResolvedValue({ data: null, error: { message: 'detalle privado' } });
  const response = await GET(request());
  expect(response.status).toBe(500);
  const body = await response.json();
  expect(body).not.toHaveProperty('capability_level');
  expect(JSON.stringify(body)).not.toContain('detalle privado');
});

test.each([null, 'desconocido', undefined])('fila con nivel inválido %s falla sin conceder write_full', async (level) => {
  query.maybeSingle.mockResolvedValue({ data: { capability_level: level }, error: null });
  const response = await GET(request());
  expect(response.status).toBe(500);
  expect(await response.json()).not.toHaveProperty('capability_level');
});

test('empleado sin fila obtiene nivel por defecto, no permisos de administración', async () => {
  const ctx = await session();
  session.mockResolvedValue({ ...ctx, roleId: 99 });
  expect(await (await GET(request())).json()).toEqual({ capability_level: 'write_full', can_manage: false });
  expect((await PATCH(request('PATCH', { capability_level: 'write_full' }))).status).toBe(403);
  expect(query.upsert).not.toHaveBeenCalled();
});

test('rechazo RLS no se reporta como cambio exitoso', async () => {
  query.single.mockResolvedValue({ data: null, error: { code: '42501', message: 'detalle privado' } });
  const response = await PATCH(request('PATCH', { capability_level: 'read' }));
  expect(response.status).toBe(403);
  expect(await response.text()).not.toContain('detalle privado');
});
