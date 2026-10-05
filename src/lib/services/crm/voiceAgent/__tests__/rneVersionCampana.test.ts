import { fakeSupabase, makeDb, ORG, U, type Ola1Db } from '@/app/api/crm/__tests__/ola1Fake';
import type { SupabaseClient } from '@supabase/supabase-js';
const targets = jest.fn(async () => [{ customer_id: U(3), opportunity_id: null, stage_id: null }]);
jest.mock('@/lib/services/crm/voiceAgentService', () => ({ buildCampaignTargets: (...args: unknown[]) => targets(...args as []) }));
import { registrarVerificacionRne } from '../rneService';
const version = '2026-10-01T00:00:00.123456+00:00';
const ownVersion = '2026-10-01T00:01:00.123456+00:00';
let db: Ola1Db; let sb: SupabaseClient;
beforeEach(() => {
  db = makeDb({ voice_agent_campaigns: [{ id: U(1), organization_id: ORG, updated_at: version }],
    customers: [{ id: U(3), organization_id: ORG, phone: '+12025550198' }] });
  db.rpc.crm_voice_campaign_rne_snapshot = { data: { campaign_updated_at: ownVersion, numbers_in_file: 1 } };
  sb = fakeSupabase(db) as unknown as SupabaseClient;
});
test.each([undefined, '2026-09-30T00:00:00.654321+00:00'])('RNE usa la versión vista al resolver la audiencia o la enviada por la pantalla: %s', async expectedUpdatedAt => {
  const result = await registrarVerificacionRne(sb, ORG, U(1), U(2), { nombre: 'Fixture.csv', contenido: '+12025550199', expectedUpdatedAt });
  expect(db.rpcCalls[0]).toMatchObject({ fn: 'crm_voice_campaign_rne_snapshot', args: {
    p_org: ORG, p_campaign: U(1), p_version: expectedUpdatedAt ?? version, p_usuario: U(2), p_targets: [{ customer_id: U(3), phone: '+12025550198', phone_e164: '+12025550198' }],
  } });
  expect(result.campaign_updated_at).toBe(ownVersion);
  expect(db.writes).toEqual([]);
});
test('una audiencia modificada produce un conflicto reconocible por la ruta', async () => {
  db.rpc.crm_voice_campaign_rne_snapshot = { error: { code: 'P0001', message: 'campana_modificada' } };
  await expect(registrarVerificacionRne(sb, ORG, U(1), U(2), { nombre: 'Fixture.csv', contenido: '+12025550199' }))
    .rejects.toEqual({ code: 'P0001', message: 'campana_modificada' });
  expect(db.rpcCalls).toHaveLength(1);
});

test('RNE solicita toda la audiencia y envía una prueba por cliente, incluso después del objetivo 5.000', async () => {
  const rows = Array.from({ length: 6001 }, (_, i) => ({ customer_id: U(i + 1000), opportunity_id: null, stage_id: null }));
  targets.mockResolvedValueOnce(rows);
  db.t.customers = rows.map(r => ({ id: r.customer_id, organization_id: ORG, phone: '+12025550198' }));
  await registrarVerificacionRne(sb, ORG, U(1), U(2), { nombre: 'Fixture.csv', contenido: '+12025550199' });
  expect(targets.mock.calls.at(-1)).toHaveLength(3);
  expect((db.rpcCalls[0].args.p_targets as unknown[])).toHaveLength(6001);
  expect(db.rpcCalls[0].args).not.toHaveProperty('p_clientes_excluidos');
  expect(db.rpcCalls[0].args).not.toHaveProperty('p_objetivos_revisados');
});
test('un error al leer teléfonos no guarda una constancia parcial', async () => {
  const failing = { ...sb, from: jest.fn((table: string) => table === 'customers' ? {
    select: () => ({ eq: () => ({ neq: () => ({ in: async () => ({ data: null, error: { message: 'Lectura fallida' } }) }) }) }),
  } : sb.from(table)) } as unknown as SupabaseClient;
  await expect(registrarVerificacionRne(failing, ORG, U(1), U(2), { nombre: 'Fixture.csv', contenido: '+12025550199' })).rejects.toThrow('Lectura fallida');
  expect(db.rpcCalls).toEqual([]);
});
