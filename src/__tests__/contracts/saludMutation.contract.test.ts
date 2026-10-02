import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFakeSupabase, makeDb, type FakeDb } from '@/lib/services/crm/__tests__/f11FakeSupabase';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { DEFAULT_HEALTH_CONFIG } from '@/lib/services/crm/healthFactorConfig';

const mockContext = jest.fn();
const mockPermission = jest.fn();
const mockAdmin = jest.fn();
const mockWriter = jest.fn();
jest.mock('@/lib/utils/orgContext', () => ({ getServerOrgContext: (...a: unknown[]) => mockContext(...a), hasOrgAdminOrPermission: (...a: unknown[]) => mockPermission(...a), requireOrgAdminOrPermission: (...a: unknown[]) => mockAdmin(...a), OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: (...a: unknown[]) => mockWriter(...a) }));
import { GET as getConfig, PATCH as patchConfig } from '@/app/api/crm/health/config/route';
import { POST as refresh } from '@/app/api/crm/health/refresh/route';
import { POST as snapshot } from '@/app/api/crm/health/[customerId]/snapshot/route';
import { POST as alias } from '@/app/api/crm/health/[customerId]/route';
import { healthRecalculationListener } from '@/lib/jobs/dispatch/listeners/healthRecalculation';
import { recalculateOrgHealth } from '@/lib/jobs/scheduled/healthRecalculate';
const ID = '00000000-0000-4000-8000-000000000071';
const STAMP = '2026-10-02T06:00:00Z';
const params = { params: Promise.resolve({ customerId: ID }) };
let db: FakeDb;
const request = (path: string, method = 'POST', body: unknown = {}, query = '') => new NextRequest(`https://test.local/api/crm/health${path}${query}`, { method, headers: { 'content-type': 'application/json' }, ...(method==='GET'?{}:{ body: JSON.stringify(body) }) });
const invocations = [
  { name: 'config', run: (body: unknown, query: string) => patchConfig(request('/config','PATCH',body,query)) },
  { name: 'refresh', run: (body: unknown, query: string) => refresh(request('/refresh','POST',body,query)) },
  { name: 'snapshot', run: (body: unknown, query: string) => snapshot(request(`/${ID}/snapshot`,'POST',body,query),params) },
  { name: 'alias', run: (body: unknown, query: string) => alias(request(`/${ID}`,'POST',body,query),params) },
];
beforeEach(() => {
  jest.clearAllMocks();
  db = makeDb({ health_score_configs: [{ organization_id: 125, config: DEFAULT_HEALTH_CONFIG, updated_at: STAMP, is_active: true, refresh_interval_hours: 24 }], customers: [{ id: ID, organization_id: 125, branch_id: 7, lifecycle_stage: 'customer', full_name: 'Cliente prueba', health_score: null }], health_score_snapshots: [] }, {
    app_branch_access: () => true,
    fn_customer_health: () => [{ customer_id: ID, invoices_12m: 1, revenue_12m: 49000, days_since_last_invoice: 78, days_since_last_activity: null, overdue_balance: 0, overdue_ratio: 0, score: 57, band: 'at_risk' }],
    fn_crm_configurar_salud: a => ({ config: a.p_config, updated_at: STAMP, refresh_interval_hours: 24, is_active: true, queued: true, event_id: 'event-test', job_id: 'job-test' }),
  });
  const supabase = createFakeSupabase(db) as unknown as SupabaseClient;
  mockContext.mockResolvedValue({ organizationId: 125, userId: ID, roleId: 99, isSuperAdmin: false, supabase });
  mockWriter.mockReturnValue(supabase); mockPermission.mockResolvedValue(true); mockAdmin.mockResolvedValue(undefined);
  jest.spyOn(console,'warn').mockImplementation(() => undefined); jest.spyOn(console,'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
for (const route of invocations) {
  test.each(['organization_id','organizationId','org_id','orgId'])(`${route.name}: rechaza alias ajeno %s en body y query antes de mutar`, async key => {
    expect((await route.run({ [key]: 999 },'')).status).toBe(403);
    expect((await route.run({},`?${key}=999`)).status).toBe(403);
    expect(db.rpcCalls).toHaveLength(0); expect(db.writes).toHaveLength(0); expect(mockWriter).not.toHaveBeenCalled();
  });
  test(`${route.name}: sesión y permiso son barreras antes de cualquier medición`, async () => {
    mockContext.mockRejectedValueOnce(new OrgContextError('Sesión requerida',401));
    expect((await route.run({},'')).status).toBe(401);
    mockAdmin.mockRejectedValue(new OrgContextError('Requiere administración',403)); mockPermission.mockResolvedValue(false);
    expect((await route.run({},'')).status).toBe(403);
    expect(mockWriter).not.toHaveBeenCalled(); expect(db.writes).toHaveLength(0);
  });
}
test('config conserva factores desactivados con peso cero y admite administración por permiso canónico', async () => {
  const config = JSON.parse(JSON.stringify(DEFAULT_HEALTH_CONFIG)); config.indicators[0].weight=0; config.indicators[1].weight=55;
  db.rows.health_score_configs[0].config=config;
  const res=await getConfig(request('/config','GET'));
  expect(res.status).toBe(200); expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  expect((await res.json()).data.config.indicators[0].weight).toBe(0); expect(mockAdmin).toHaveBeenCalledTimes(1);
});
test('guardar config exige suma 100 y la versión observada; nunca acepta scores del navegador', async () => {
  const body = { config: DEFAULT_HEALTH_CONFIG, expected_updated_at: STAMP };
  const valid = await patchConfig(request('/config','PATCH',body));
  expect(valid.status).toBe(200); expect((await valid.json()).data).toMatchObject({ queued: true, event_id: 'event-test', job_id: 'job-test' });
  expect(db.rpcCalls[0]).toEqual({ fn: 'fn_crm_configurar_salud', args: { p_org: 125, p_config: DEFAULT_HEALTH_CONFIG, p_expected_stamp: STAMP } });
  const broken = JSON.parse(JSON.stringify(DEFAULT_HEALTH_CONFIG)); broken.indicators[0].weight=99;
  expect((await patchConfig(request('/config','PATCH',{ ...body,config:broken }))).status).toBe(400);
  expect((await patchConfig(request('/config','PATCH',{ config: DEFAULT_HEALTH_CONFIG }))).status).toBe(400);
  expect((await patchConfig(request('/config','PATCH',{ ...body,score:100 }))).status).toBe(400);
  expect(db.rpcCalls).toHaveLength(1);
});
test('conflicto de versión de configuración se devuelve como 409', async () => {
  const supabase = createFakeSupabase(db); supabase.rpc=jest.fn(async () => ({ data:null,error:{ code:'23505',message:'salud_config_modificada' } })) as never;
  mockContext.mockResolvedValue({ organizationId:125,userId:ID,roleId:99,isSuperAdmin:false,supabase });
  expect((await patchConfig(request('/config','PATCH',{ config:DEFAULT_HEALTH_CONFIG,expected_updated_at:STAMP }))).status).toBe(409);
});
test('refresh responde 202 sólo tras obtener evento y job real', async () => {
  const response=await refresh(request('/refresh'));
  expect(response.status).toBe(202); expect((await response.json()).data).toMatchObject({ queued:true,event_id:expect.any(String),job_id:expect.any(String) });
  expect(db.rows.outbound_jobs[0]).toMatchObject({ organization_id:125,kind:'crm_event' }); expect(db.writes).toHaveLength(0);
});
test.each([snapshot,alias])('medición manual calcula 22 y escribe snapshot + score mediante la misma RPC', async route => {
  const response=await route(request(`/${ID}/snapshot`),params);
  expect(response.status).toBe(200); expect((await response.json()).data.score).toBe(22);
  expect(mockPermission).toHaveBeenCalledWith(expect.objectContaining({ organizationId:125 }),'crm.customers.edit');
  expect(db.rpcCalls.find(c => c.fn==='app_branch_access')?.args).toEqual({ p_branch_id:7 });
  expect(db.rpcCalls.filter(c => c.fn==='fn_crm_guardar_mediciones_salud')).toHaveLength(1);
  expect(db.rows.customers[0].health_score).toBe(22); expect(db.rows.health_score_snapshots[0].score).toBe(22);
});
test('sucursal denegada, cliente ausente y UUID inválido nunca alcanzan escritor privilegiado', async () => {
  db.rpc!.app_branch_access=() => false;
  expect((await snapshot(request(`/${ID}/snapshot`),params)).status).toBe(403);
  db.rows.customers=[]; expect((await snapshot(request(`/${ID}/snapshot`),params)).status).toBe(404);
  expect((await snapshot(request('/mal/snapshot'),{ params:Promise.resolve({ customerId:'mal' }) })).status).toBe(400);
  expect(mockWriter).not.toHaveBeenCalled();
});
test.each(['customers','health_score_snapshots'])('fallo tardío de %s propaga 500 y conserva ambas tablas en el doble transaccional', async table => {
  db.nextWriteError={ table,error:{ code:'P0001',message:'SQL privado prueba' } };
  const response=await snapshot(request(`/${ID}/snapshot`),params);
  expect(response.status).toBe(500); expect(JSON.stringify(await response.json())).not.toContain('SQL privado');
  expect(db.rows.customers[0].health_score).toBeNull(); expect(db.rows.health_score_snapshots).toHaveLength(0);
});
test('fallo de lectura no devuelve configuración por defecto ni éxito encolado', async () => {
  db.nextReadError={ table:'health_score_configs',error:{ code:'08006',message:'SQL privado' } };
  const response=await getConfig(request('/config','GET')); expect(response.status).toBe(500); expect(JSON.stringify(await response.json())).not.toContain('SQL privado');
  db.rpc!.fn_crm_encolar_salud=()=>({ queued:true,event_id:'sin-job' });
  expect((await refresh(request('/refresh'))).status).toBe(500);
});
test('consumidor rechaza otra organización y omite config reemplazada antes de recalcular', async () => {
  const event = { organization_id:125,entity_type:'health_config',payload:{ config_stamp:'2026-10-01T00:00:00Z' } };
  const worker={ orgId:125,supabase:createFakeSupabase(db) as unknown as SupabaseClient,signal:new AbortController().signal,log:{ info:jest.fn(),warn:jest.fn(),error:jest.fn() } };
  await expect(healthRecalculationListener({ ...event,organization_id:999 } as never,worker)).rejects.toThrow(/fuera de contexto/);
  expect(await healthRecalculationListener(event as never,worker)).toMatchObject({ skipped:true,reason:'config_replaced' }); expect(db.rpcCalls).toHaveLength(0);
});
test('último snapshot permanece correcto con más de 5000 mediciones de otros clientes', async () => {
  const now=new Date('2026-10-02T07:00:00Z'); db.rows.customers[0].health_score=22;
  db.rows.health_score_snapshots=Array.from({ length:5001 },(_,i)=>({ id:`otro-${i}`,organization_id:125,customer_id:'otro',score:99,created_at:now.toISOString() }));
  db.rows.health_score_snapshots.push({ id:'ultimo-cliente',organization_id:125,customer_id:ID,score:22,created_at:'2026-10-02T06:00:00Z' });
  const result=await recalculateOrgHealth(125,createFakeSupabase(db) as unknown as SupabaseClient,now);
  expect(result).toMatchObject({ snapshots_written:0,customers_updated:0,skipped_unchanged:1 });
  expect(db.rpcCalls.find(c => c.fn==='fn_crm_guardar_mediciones_salud')?.args.p_rows).toEqual([expect.objectContaining({ expected_snapshot_id:'ultimo-cliente',write_snapshot:false })]);
});
