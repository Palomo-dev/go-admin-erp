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
    segments: [{ id: U(3), organization_id: ORG, filter_json: [{ field: "city", operator: "equals", value: "Ciudad de prueba" }] }],
    customers: [{ id: U(4), organization_id: ORG, city: "Ciudad de prueba" }, { id: U(5), organization_id: ORG, city: "Otra ciudad" }, { id: U(6), organization_id: OTRA, city: "Ciudad de prueba" }],
    campaign_contacts: [{ campaign_id: U(3), customer_id: U(6) }],
  });
  const result = await buildCampaignTargets(fakeSupabase(db) as unknown as SupabaseClient, ORG, campaign(U(3)), 50);
  expect(result).toEqual([{ customer_id: U(4), opportunity_id: null, stage_id: null }]);
});
test("un segmento ajeno no se presenta como audiencia vacía", async () => {
  const db = makeDb({ segments: [{ id: U(3), organization_id: OTRA, filter_json: [] }] });
  await expect(buildCampaignTargets(fakeSupabase(db) as unknown as SupabaseClient, ORG, campaign(U(3)), 50)).rejects.toMatchObject({ status: 404 });
});
