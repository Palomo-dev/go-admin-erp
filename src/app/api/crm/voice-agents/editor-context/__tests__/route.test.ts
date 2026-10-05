/** Handler y permisos CRM reales; se sustituye la sesión y el I/O de Supabase. */
import type { SupabaseClient } from '@supabase/supabase-js';
jest.mock('next/headers', () => ({ cookies: jest.fn(), headers: jest.fn() }));
jest.mock('@/lib/security/webhookSignatures', () => ({ verifyCronSecret: jest.fn(), WebhookError: class extends Error {} }));
jest.mock('@/lib/utils/orgContext', () => ({
  ...jest.requireActual<typeof import('@/lib/utils/orgContext')>('@/lib/utils/orgContext'),
  getServerOrgContext: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { getServerOrgContext, type ServerOrgContext } from '@/lib/utils/orgContext';
import { GET } from '../route';

type Table = 'pipelines' | 'products' | 'comm_settings';
interface Result { data: unknown; error: { code: string; message: string; details?: string } | null }
interface Read { table: Table; columns: string; filters: [string, unknown][]; order: string | null; limit: number | null }
interface Query {
  select(columns: string): Query;
  eq(column: string, value: unknown): Query;
  order(column: string): Query;
  limit(value: number): Query;
  maybeSingle(): Promise<Result>;
  then(resolve: (value: Result) => unknown, reject?: (error: unknown) => unknown): Promise<unknown>;
}
const actor = '40000000-0000-4000-8000-000000000001';
const pipeline = { id: '40000000-0000-4000-8000-000000000002', name: 'Embudo', stages: [{ id: '40000000-0000-4000-8000-000000000003', name: 'Contactado', position: 2, is_won: false, is_lost: false }] };
const product = { id: 1, name: 'Producto', sku: 'P-1' };
const policy = 'https://example.test/politica';
const reads: Read[] = [];
let results: Record<Table, Result>;
let ctx: ServerOrgContext;
const rpc = jest.fn<Promise<{ data: boolean; error: null }>, [string, Record<string, unknown>]>();
const from = jest.fn((table: string) => {
  if (!['pipelines', 'products', 'comm_settings'].includes(table)) throw new Error('Tabla inesperada');
  const current: Read = { table: table as Table, columns: '', filters: [], order: null, limit: null };
  reads.push(current);
  const query: Query = {
    select: columns => { current.columns = columns; return query; },
    eq: (column, value) => { current.filters.push([column, value]); return query; },
    order: column => { current.order = column; return query; },
    limit: value => { current.limit = value; return query; },
    maybeSingle: async () => results[current.table],
    then: (resolve, reject) => Promise.resolve(results[current.table]).then(resolve, reject),
  };
  return query;
});
let warn: jest.SpyInstance;
let errorLog: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks(); reads.length = 0;
  results = {
    pipelines: { data: [pipeline], error: null },
    products: { data: [product], error: null },
    comm_settings: { data: { data_policy_url: policy }, error: null },
  };
  rpc.mockResolvedValue({ data: false, error: null });
  ctx = { userId: actor, userEmail: null, organizationId: 120, organizationName: 'Org 120', roleId: 1, roleName: 'Admin', isSuperAdmin: false, memberId: 1, supabase: { from, rpc } as unknown as SupabaseClient };
  jest.mocked(getServerOrgContext).mockImplementation(async () => ctx);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { warn.mockRestore(); errorLog.mockRestore(); });
const request = (query = '') => new NextRequest(`http://localhost/api/crm/voice-agents/editor-context${query}`);

test('devuelve etapas reales con position, productos y política, leyendo sólo columnas de contexto', async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(await response.json()).toEqual({ success: true, data: { pipelines: [pipeline], products: [product], data_policy_url: policy } });
  expect(getServerOrgContext).toHaveBeenCalledWith(expect.any(NextRequest));
  expect(reads).toEqual([
    { table: 'pipelines', columns: 'id, name, stages(id, name, position, is_won, is_lost)', filters: [['organization_id', 120]], order: 'name', limit: null },
    { table: 'products', columns: 'id, name, sku', filters: [['organization_id', 120]], order: 'name', limit: 300 },
    { table: 'comm_settings', columns: 'data_policy_url', filters: [['organization_id', 120]], order: null, limit: null },
  ]);
  expect(rpc).not.toHaveBeenCalled();
});

test('los tres filtros usan la organización resuelta en sesión, sin valores por defecto', async () => {
  ctx.organizationId = 130;
  const response = await GET(request('?organization_id=130'));
  expect(response.status).toBe(200);
  expect(reads).toHaveLength(3);
  for (const read of reads) expect(read.filters).toEqual([['organization_id', 130]]);
});

test('organización ajena en query se deniega antes de consultar catálogos o permisos', async () => {
  const response = await GET(request('?organization_id=130'));
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ success: false, code: 'FOREIGN_ORGANIZATION' });
  expect(from).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
});

test('denegación canónica de permisos ocurre antes de las tres lecturas', async () => {
  ctx.roleId = 3;
  const response = await GET(request());
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ success: false, code: 'CRM_FORBIDDEN' });
  expect(from).not.toHaveBeenCalled();
  expect(rpc.mock.calls).toEqual([
    ['check_user_permission', { p_user_id: actor, p_organization_id: 120, p_permission_code: 'crm.campaigns.manage' }],
    ['check_user_permission', { p_user_id: actor, p_organization_id: 120, p_permission_code: 'crm.stages.manage' }],
  ]);
});

test.each(['crm.campaigns.manage', 'crm.stages.manage'])('permiso nativo %s permite contexto sin exigir ambos', async code => {
  ctx.roleId = 3;
  rpc.mockImplementation(async (_name, args) => ({ data: args.p_permission_code === code, error: null }));
  const response = await GET(request());
  expect(response.status).toBe(200); expect(reads).toHaveLength(3);
});

test('42501 en data_policy_url sigue siendo error 403, sin devolver catálogos vacíos ni publicar SQL', async () => {
  results.comm_settings = { data: null, error: { code: '42501', message: 'permission denied for table comm_settings', details: 'private SQL execution detail' } };
  const response = await GET(request());
  expect(response.status).toBe(403);
  const body = await response.json();
  expect(body).toEqual({ success: false, error: 'error_de_datos', code: 'error_de_datos' });
  expect(body).not.toHaveProperty('data');
  expect(JSON.stringify(body)).not.toMatch(/comm_settings|permission denied|private SQL/);
  expect(errorLog).not.toHaveBeenCalled();
});

test.each([{ data_policy_url: null }, null])('política no configurada (%j) permite cargar etapas y productos', async settings => {
  results.comm_settings = { data: settings, error: null };
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true, data: { pipelines: [pipeline], products: [product], data_policy_url: null } });
});

test.each(['pipelines', 'products'] as const)('fallo SQL de %s no se oculta como catálogo vacío', async table => {
  results[table] = { data: null, error: { code: '42703', message: 'private missing-column message' } };
  const response = await GET(request());
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ success: false, error: 'Error interno' });
});
