import { NextRequest } from 'next/server';
import { getServerOrgContext, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { OrgContextError } from '@/lib/utils/orgContextError';
jest.mock('@/lib/utils/orgContext', () => ({ getServerOrgContext: jest.fn(), hasOrgAdminOrPermission: jest.fn(), OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError }));
import { GET } from '../route';

const propio = '11111111-1111-4111-8111-111111111111';
const ajeno = '22222222-2222-4222-8222-222222222222';
const comprador = '33333333-3333-4333-8333-333333333333';
const rows: Record<string, unknown>[] = [
  { id: propio, organization_id: 120, lifecycle_stage: 'lead', first_name: null, tags: null, metadata: { privado: true } },
  { id: ajeno, organization_id: 125, lifecycle_stage: 'lead' },
  { id: comprador, organization_id: 120, lifecycle_stage: 'customer' },
];
let filtros: [string, unknown][];
let columnas: string;
let errorSql: unknown;
interface ConsultaDoble {
  select(c: string): ConsultaDoble;
  eq(c: string, v: unknown): ConsultaDoble;
  returns(): ConsultaDoble;
  maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: unknown }>;
}
const query: ConsultaDoble = {
  select: jest.fn((c: string) => { columnas = c; return query; }),
  eq: jest.fn((c: string, v: unknown) => { filtros.push([c, v]); return query; }),
  returns: () => query,
  maybeSingle: jest.fn(async () => {
    const fila = rows.find(r => filtros.every(([c, v]) => r[c] === v));
    return { data: fila ? Object.fromEntries(columnas.split(',').map(c => [c, fila[c]])) : null, error: errorSql };
  }),
};
const sb = { from: jest.fn(() => query) };
const context = jest.mocked(getServerOrgContext);
const permission = jest.mocked(hasOrgAdminOrPermission);
let permisos: Set<string>;
const get = (id = propio, search = '') => GET(new NextRequest(`http://localhost/api/clientes/${id}${search}`), { params: Promise.resolve({ id }) });
beforeEach(() => {
  jest.clearAllMocks(); filtros = []; columnas = ''; errorSql = null;
  permisos = new Set(['crm.customers.view']);
  context.mockResolvedValue({ organizationId: 120, userId: 'usuario', roleId: 3, isSuperAdmin: false, supabase: sb } as never);
  permission.mockImplementation(async (_ctx, code) => permisos.has(code ?? ''));
});
test('lectura acotada por org de sesión y cliente, RLS sin elevación ni metadata interna', async () => {
  const response = await get();
  expect(response.status).toBe(200);
  expect(filtros).toEqual([['organization_id', 120], ['id', propio]]);
  const json = await response.json();
  expect(json.data).toMatchObject({ id: propio, first_name: '', tags: [] });
  expect(json.data).not.toHaveProperty('metadata');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
});
test('cliente ajeno queda 404, aunque el usuario pudiera ser miembro de ambas organizaciones', async () => {
  expect((await get(ajeno)).status).toBe(404);
});
test('permiso leads permite solo leads de la organización', async () => {
  permisos = new Set(['crm.leads.view']);
  expect((await get()).status).toBe(200);
  expect(filtros).toContainEqual(['lifecycle_stage', 'lead']);
  filtros = [];
  expect((await get(comprador)).status).toBe(404);
});
test('sin permiso rechaza antes de consultar datos', async () => {
  permisos.clear();
  expect((await get()).status).toBe(403);
  expect(sb.from).not.toHaveBeenCalled();
});
test('sesión ausente conserva código 401 sin consulta', async () => {
  context.mockRejectedValue(new OrgContextError('No hay sesión', 401, 'UNAUTHENTICATED'));
  const response = await get();
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  expect(sb.from).not.toHaveBeenCalled();
});
test.each(['organization_id', 'organizationId', 'orgId', 'org_id'])('query %s ajena no cambia ámbito ni consulta', async alias => {
  expect((await get(propio, `?${alias}=125`)).status).toBe(403);
  expect(sb.from).not.toHaveBeenCalled();
});
test('UUID inválido responde 400 sin consultar Postgres', async () => {
  expect((await get('no-es-uuid')).status).toBe(400);
  expect(sb.from).not.toHaveBeenCalled();
});
test('error SQL no se convierte en 404 ni filtra su mensaje', async () => {
  errorSql = { message: 'detalle privado de base' };
  const response = await get();
  expect(response.status).toBe(500);
  expect(JSON.stringify(await response.json())).not.toContain('detalle privado');
});
