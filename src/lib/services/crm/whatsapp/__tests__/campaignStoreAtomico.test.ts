import { createCampaign, deleteCampaign, getCampaign, listCampaigns, updateCampaign } from '../campaignStore';
import { errorWhatsAppDb } from '../erroresDbLogica';
import { has, makeSupabase } from './mockSupabase';

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn() }));
const actor = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const version = '2026-10-01T11:00:00.000Z';
const row = { id, organization_id: 120, name: 'Campaña', channel: 'whatsapp', status: 'draft', content: 'Hola',
  updated_at: version, statistics: { audience: { source: 'manual', customer_ids: [actor] }, respect_allowed_hours: true,
    purpose: 'utility', materialized_at: version, default_variables: { nombre: 'Ana', cita: { dia: 'lunes', hora: '10' } } } };
const setup = () => {
  const user = makeSupabase({ campaigns: () => ({ data: row }) });
  const service = makeSupabase({}, (_fn, args) => ({ data: { ...row, ...(args.p_values as object ?? {}) } }));
  return { user, service };
};
const writtenStats = (service: ReturnType<typeof setup>['service']) =>
  (service.rpcCalls[0].args.p_values as { statistics: Record<string, unknown> }).statistics;

test('crea con actor y referencias en una RPC privada, sin escrituras directas', async () => {
  const { user, service } = setup();
  await createCampaign(120, actor, { name: 'Nueva', channel: 'whatsapp', content: 'Hola',
    audience: { source: 'manual', customer_ids: [actor] }, respect_allowed_hours: false }, user.sb, service.sb);
  expect(user.calls).toHaveLength(0); expect(service.calls).toHaveLength(0);
  expect(service.rpcCalls).toEqual([{ fn: 'crm_campaign_save', args: expect.objectContaining({
    p_org: 120, p_actor: actor, p_campaign: null, p_version: null,
    p_values: expect.objectContaining({ name: 'Nueva', statistics: expect.objectContaining({ respect_allowed_hours: true }) }),
  }) }]);
});

test('edita con la versión recibida y preserva el cálculo si las variables solo cambian de orden', async () => {
  const { user, service } = setup();
  await updateCampaign(120, id, { expected_updated_at: version, default_variables: { cita: { hora: '10', dia: 'lunes' }, nombre: 'Ana' } }, user.sb, actor, service.sb);
  expect(service.rpcCalls[0].args).toMatchObject({ p_org: 120, p_actor: actor, p_version: version, p_campaign: id });
  expect(writtenStats(service).materialized_at).toBe(version);
  expect(user.calls.every(c => !has(c.ops, 'update'))).toBe(true);
});

test.each([{ content: 'Otro mensaje' }, { default_variables: { nombre: 'Otro' } }])('invalida el cálculo al cambiar el mensaje o sus variables: %j', async patch => {
  const { user, service } = setup();
  await updateCampaign(120, id, patch, user.sb, actor, service.sb);
  expect(writtenStats(service).materialized_at).toBeNull();
});

test('una versión obsoleta produce conflicto y no se reintenta con una escritura sin condición', async () => {
  const user = makeSupabase({ campaigns: () => ({ data: row }) });
  const service = makeSupabase({}, () => ({ error: { code: '40001', message: 'campana_modificada' } }));
  await expect(updateCampaign(120, id, { name: 'Cambio', expected_updated_at: '2026-09-01T00:00:00Z' }, user.sb, actor, service.sb)).rejects.toMatchObject({ status: 409 });
  expect(service.rpcCalls).toHaveLength(1); expect(service.calls).toHaveLength(0);
});

test('archiva con una RPC que conserva contactos y ledger; nunca borra tablas', async () => {
  const { user, service } = setup();
  await deleteCampaign(120, id, user.sb, actor, service.sb);
  expect(service.rpcCalls).toEqual([{ fn: 'crm_campaign_archive', args: { p_org: 120, p_actor: actor, p_campaign: id, p_version: version } }]);
  expect(service.calls).toHaveLength(0); expect(user.calls.every(c => !has(c.ops, 'delete'))).toBe(true);
});

test('un archivo con reservas sin conciliar devuelve un conflicto comprensible', () => {
  expect(errorWhatsAppDb({ code: 'P0001', message: 'campana_requiere_conciliacion' })).toMatchObject({ status: 409, code: 'RECONCILIATION_REQUIRED', message: expect.stringContaining('conciliación') });
});

test('lecturas excluyen archivos y respetan la organización', async () => {
  const user = makeSupabase({ campaigns: ops => ({ data: has(ops, 'maybeSingle') ? null : [] }) });
  expect(await getCampaign(120, id, user.sb)).toBeNull();
  expect(await listCampaigns(120, {}, user.sb)).toEqual([]);
  for (const call of user.calls) {
    expect(has(call.ops, 'eq', 'organization_id', 120)).toBe(true);
    expect(has(call.ops, 'is', 'statistics->>archived_at', null)).toBe(true);
  }
});

test('una lectura ajena/no encontrada no llega a la RPC', async () => {
  const user = makeSupabase({ campaigns: () => ({ data: null }) });
  const service = makeSupabase({});
  await expect(deleteCampaign(120, id, user.sb, actor, service.sb)).rejects.toMatchObject({ status: 404 });
  expect(service.rpcCalls).toHaveLength(0);
});

test.each([null, { ...row, organization_id: 121 }, { ...row, id: actor }])('rechaza una respuesta incompleta o ajena de la RPC', async data => {
  const { user } = setup(); const service = makeSupabase({}, () => ({ data }));
  await expect(updateCampaign(120, id, { name: 'Cambio' }, user.sb, actor, service.sb)).rejects.toMatchObject({ status: 500 });
});
