import { fakeSupabase, makeDb, ORG, U, YO, type Ola1Db } from '@/app/api/crm/__tests__/ola1Fake';
import type { CrmSesion } from '../crmRouteSupport';
let serviceDb: Ola1Db; let allowed = true;
const elevate = jest.fn(() => fakeSupabase(serviceDb));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => elevate() }));
jest.mock('@/lib/utils/orgContext', () => ({ requireOrgAdminOrPermission: jest.fn(async () => {
  if (!allowed) throw Object.assign(new Error('sin_permiso'), { status: 403 });
}) }));
import { guardarCampanaVoz, eliminarCampanaVoz, detenerCampanaVoz } from '../voiceCampaignWriteService';
const version = '2026-10-01T00:00:00.123456+00:00';
const older = '2026-09-30T23:59:00.654321+00:00';
let userDb: Ola1Db; let ctx: CrmSesion;
beforeEach(() => {
  allowed = true; elevate.mockClear();
  userDb = makeDb({ voice_agent_campaigns: [{ id: U(1), organization_id: ORG, updated_at: version }] });
  serviceDb = makeDb();
  ctx = { organizationId: ORG, userId: YO, roleId: 4, isSuperAdmin: false, supabase: fakeSupabase(userDb) as unknown as CrmSesion['supabase'] };
  for (const fn of ['save', 'archive', 'stop']) serviceDb.rpc[`crm_voice_campaign_${fn}`] = {
    data: { id: U(1), organization_id: ORG, updated_at: version },
  };
});
test('sin permiso no lee referencias ni eleva privilegios', async () => {
  allowed = false;
  await expect(guardarCampanaVoz(ctx, { name: 'Fixture', voice_agent_id: U(2) })).rejects.toMatchObject({ status: 403 });
  expect(elevate).not.toHaveBeenCalled();
});
test('creación solo transmite campos validados y el actor de la sesión', async () => {
  await guardarCampanaVoz(ctx, { name: 'Fixture', voice_agent_id: U(2) });
  expect(serviceDb.rpcCalls).toEqual([{ fn: 'crm_voice_campaign_save', args: {
    p_org: ORG, p_campaign: null, p_version: null, p_actor: YO, p_values: { name: 'Fixture', voice_agent_id: U(2), max_calls_per_day: 120, max_calls_per_hour: 40, max_concurrent: 5 },
  } }]);
  expect(userDb.writes).toEqual([]); expect(serviceDb.writes).toEqual([]);
});
test('los topes elegidos por la organización se transmiten sin sustituirlos por los iniciales', async () => {
  await guardarCampanaVoz(ctx, { name: 'Fixture', voice_agent_id: U(2), max_calls_per_day: 80, max_calls_per_hour: 15, max_concurrent: 2 });
  expect(serviceDb.rpcCalls[0].args.p_values).toMatchObject({ max_calls_per_day: 80, max_calls_per_hour: 15, max_concurrent: 2 });
});
test.each([{ max_concurrent: 0 }, { max_calls_per_day: 501 }, { max_calls_per_hour: 1.5 }])('rechaza topes fuera del contrato antes de acceder al servicio: %j', async limits => {
  await expect(guardarCampanaVoz(ctx, { name: 'Fixture', voice_agent_id: U(2), ...limits })).rejects.toMatchObject({ status: 400 });
  expect(elevate).not.toHaveBeenCalled();
});
test.each(['save', 'archive', 'stop'])('%s conserva la versión del cliente con microsegundos', async action => {
  if (action === 'save') await guardarCampanaVoz(ctx, { name: 'Fixture editada', expected_updated_at: older }, U(1));
  if (action === 'archive') await eliminarCampanaVoz(ctx, U(1), { expected_updated_at: older });
  if (action === 'stop') await detenerCampanaVoz(ctx, U(1), { reason: 'Revisar lote', expected_updated_at: older });
  expect(serviceDb.rpcCalls[0].args).toMatchObject({ p_org: ORG, p_actor: YO, p_version: older });
  if (action === 'save') expect(serviceDb.rpcCalls[0].args.p_values).toEqual({ name: 'Fixture editada' });
  expect(userDb.writes).toEqual([]); expect(serviceDb.writes).toEqual([]);
});
test('cliente anterior toma una versión propia, sin escribir directamente', async () => {
  await eliminarCampanaVoz(ctx, U(1));
  expect(serviceDb.rpcCalls[0].args.p_version).toBe(version);
});
test('una campaña ajena no llega a la RPC privada', async () => {
  userDb.t.voice_agent_campaigns[0].organization_id = ORG + 1;
  await expect(eliminarCampanaVoz(ctx, U(1))).rejects.toMatchObject({ status: 404 });
  expect(elevate).not.toHaveBeenCalled();
});
test.each([{ expected_updated_at: 'ayer' }, { expected_updated_at: null }, { organization_id: ORG + 1 }])('archivo rechaza una versión o clave inválida antes de elevar', async body => {
  await expect(eliminarCampanaVoz(ctx, U(1), body)).rejects.toMatchObject({ status: 400 });
  expect(elevate).not.toHaveBeenCalled();
});
test('conflicto se conserva como SQLSTATE de negocio, sin reintentar ni borrar', async () => {
  serviceDb.rpc.crm_voice_campaign_archive = { error: { code: 'P0001', message: 'campana_modificada' } };
  await expect(eliminarCampanaVoz(ctx, U(1), { expected_updated_at: older })).rejects.toEqual({ code: 'P0001', message: 'campana_modificada' });
  expect(serviceDb.rpcCalls).toHaveLength(1); expect(serviceDb.writes).toEqual([]);
});
test('una respuesta de otra organización no se devuelve al navegador', async () => {
  serviceDb.rpc.crm_voice_campaign_save = { data: { id: U(1), organization_id: ORG + 1, updated_at: version } };
  await expect(guardarCampanaVoz(ctx, { name: 'Fixture', voice_agent_id: U(2) })).rejects.toMatchObject({ status: 500 });
});
test('archivadas se ocultan también en la lectura previa a la escritura', async () => {
  userDb.t.voice_agent_campaigns[0]['stats->>archived_at'] = version;
  await expect(eliminarCampanaVoz(ctx, U(1))).rejects.toMatchObject({ status: 404 });
  expect(elevate).not.toHaveBeenCalled();
});
