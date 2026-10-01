import { buildCampaignTargets, type VoiceAgentCampaign } from "../voiceAgentService";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fakeSupabase, makeDb, ORG, OTRA, U } from "@/app/api/crm/__tests__/ola1Fake";
const campaign = (segment: string): VoiceAgentCampaign => ({
  id: U(1), organization_id: ORG, voice_agent_id: U(2), name: "Audiencia de prueba", objective: null,
  target_source: "segment", target_config: { segment_id: segment }, schedule: null,
  max_calls_per_day: 50, max_calls_per_hour: 20, max_concurrent: 3, emergency_stop: false,
  stopped_reason: null, consecutive_failures: 0, status: "draft", stats: {}, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
});
test("voz resuelve el segmento por sus reglas, sin confundir su id con campaign_contacts", async () => {
  const db = makeDb({
    segments: [{ id: U(3), organization_id: ORG, is_dynamic: true, filter_json: [{ field: "city", operator: "equals", value: "Ciudad de prueba" }] }],
    customers: [{ id: U(4), organization_id: ORG, city: "Ciudad de prueba" }, { id: U(5), organization_id: ORG, city: "Otra ciudad" }, { id: U(6), organization_id: OTRA, city: "Ciudad de prueba" }],
    campaign_contacts: [{ campaign_id: U(3), customer_id: U(6) }],
  });
  db.rpc.crm_segment_context_page = { data: [
    { id: U(4), city: 'Ciudad de prueba', consent: {} }, { id: U(5), city: 'Otra ciudad', consent: {} },
  ] };
  const result = await buildCampaignTargets(fakeSupabase(db) as unknown as SupabaseClient, ORG, campaign(U(3)), 50);
  expect(result).toEqual([{ customer_id: U(4), opportunity_id: null, stage_id: null }]);
});
test("un segmento ajeno no se presenta como audiencia vacía", async () => {
  const db = makeDb({ segments: [{ id: U(3), organization_id: OTRA, filter_json: [] }] });
  await expect(buildCampaignTargets(fakeSupabase(db) as unknown as SupabaseClient, ORG, campaign(U(3)), 50)).rejects.toMatchObject({ status: 404 });
});

test.each(['pipeline_stage', 'followup_due'] as const)('%s recorre 6.001 oportunidades y respeta el lote de la cola', async source => {
  const db = makeDb({ opportunities: Array.from({ length: 6001 }, (_, i) => ({
    id: U(i + 10000), organization_id: ORG, customer_id: U(i + 20000), stage_id: U(3),
    status: 'open', next_contact_at: '2026-09-01T00:00:00Z',
  })).concat([{ id: U(90000), organization_id: OTRA, customer_id: U(90001), stage_id: U(3), status: 'open', next_contact_at: '2026-09-01T00:00:00Z' }]) });
  const c = { ...campaign(U(3)), target_source: source, target_config: { stage_id: U(3) } };
  const sb = fakeSupabase(db) as unknown as SupabaseClient;
  const all = await buildCampaignTargets(sb, ORG, c);
  expect(all).toHaveLength(6001);
  expect(new Set(all.map(r => r.opportunity_id)).size).toBe(6001);
  expect(all.at(-1)?.customer_id).toBe(U(26000));
  expect(await buildCampaignTargets(sb, ORG, c, 3)).toEqual(all.slice(0, 3));
});
test('la lista manual no pierde clientes después del máximo de 1.000 filas y elimina ids repetidos', async () => {
  const own = Array.from({ length: 2201 }, (_, i) => ({ id: U(i + 1000), organization_id: ORG, phone: '+12025550198' }));
  const db = makeDb({ customers: [...own, { id: U(9000), organization_id: OTRA, phone: '+12025550198' }, { id: U(9001), organization_id: ORG, phone: null }] });
  const c: VoiceAgentCampaign = { ...campaign(U(3)), target_source: 'manual_list', target_config: { customer_ids: [...own.map(c => c.id), U(1000), U(9000), U(9001)] } };
  const rows = await buildCampaignTargets(fakeSupabase(db) as unknown as SupabaseClient, ORG, c);
  expect(rows).toHaveLength(2201);
  expect(new Set(rows.map(c => c.customer_id)).size).toBe(2201);
  expect(rows.at(-1)?.customer_id).toBe(U(3200));
});
test('secuencias descarta ejecuciones, inscripciones, clientes y oportunidades ajenos', async () => {
  const db = makeDb({
    sequence_steps: [{ id: U(3), organization_id: ORG }],
    sequence_step_runs: [
      { id: U(10), organization_id: ORG, step_id: U(3), status: 'pending', enrollment_id: U(20) },
      { id: U(11), organization_id: OTRA, step_id: U(3), status: 'pending', enrollment_id: U(20) },
      ...[21, 22, 23].map(n => ({ id: U(n + 100), organization_id: ORG, step_id: U(3), status: 'pending', enrollment_id: U(n) })),
    ],
    sequence_enrollments: [
      { id: U(20), organization_id: ORG, customer_id: U(30), opportunity_id: null },
      { id: U(21), organization_id: OTRA, customer_id: U(30), opportunity_id: null },
      { id: U(22), organization_id: ORG, customer_id: U(31), opportunity_id: null },
      { id: U(23), organization_id: ORG, customer_id: U(30), opportunity_id: U(40) },
    ],
    customers: [{ id: U(30), organization_id: ORG }, { id: U(31), organization_id: OTRA }],
    opportunities: [{ id: U(40), organization_id: OTRA, customer_id: U(30) }],
  });
  const c: VoiceAgentCampaign = { ...campaign(U(3)), target_source: 'sequence_step', target_config: { step_id: U(3) } };
  expect(await buildCampaignTargets(fakeSupabase(db) as unknown as SupabaseClient, ORG, c)).toEqual([
    { customer_id: U(30), opportunity_id: null, stage_id: null },
  ]);
});
test('un paso de secuencia ajeno se rechaza aunque tenga ejecuciones mal vinculadas', async () => {
  const db = makeDb({ sequence_steps: [{ id: U(3), organization_id: OTRA }] });
  const c: VoiceAgentCampaign = { ...campaign(U(3)), target_source: 'sequence_step', target_config: { step_id: U(3) } };
  await expect(buildCampaignTargets(fakeSupabase(db) as unknown as SupabaseClient, ORG, c)).rejects.toThrow('Paso de secuencia no encontrado');
});
test('la organización de la campaña se comprueba antes de resolver cualquier audiencia', async () => {
  await expect(buildCampaignTargets(fakeSupabase(makeDb()) as unknown as SupabaseClient, OTRA, campaign(U(3))))
    .rejects.toThrow('Campaña no encontrada');
});
