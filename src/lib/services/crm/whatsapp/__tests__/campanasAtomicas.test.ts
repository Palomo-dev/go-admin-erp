import { materializeCampaign } from "../campaignMaterialize";
import { cancelCampaign, launchCampaign, pauseCampaign, resumeCampaign } from "../campaignService";
import { makeSupabase, has } from "./mockSupabase";

jest.mock("@/lib/supabase/server-service", () => ({ getServiceClient: () => { throw new Error("Servicio no inyectado"); } }));
jest.mock("@/lib/services/crm/pricingService", () => ({ getUnitCost: async () => 0.0125 }));

const campaign = (status = "draft", statistics = {}) => ({
  id: "camp", organization_id: 7, name: "Fixture", channel: "whatsapp", status,
  updated_at: "2026-10-01T00:00:00Z", statistics: { channel_id: "channel", purpose: "utility", materialized_at: "2026-10-01T00:00:00Z", audience: { source: "manual", customer_ids: ["customer"] }, ...statistics },
});
const counts = { total: 1, pending: 1, queued: 0, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0, skipped: 0, cost: 0 };

function fixture(status = "draft", statistics = {}, failure?: { code: string; message: string }) {
  return makeSupabase({
    campaigns: () => ({ data: campaign(status, statistics) }),
    channels: () => ({ data: { id: "channel", type: "whatsapp", name: "Fixture", status: "active" } }),
    channel_credentials: () => ({ data: { provider: "baileys" } }),
    customers: () => ({ data: [{ id: "customer", phone: "+12025550198", email: null }] }),
    provider_configs: () => ({ data: null }),
    conversations: () => ({ data: [] }),
  }, (fn, args) => {
    if (fn === "fn_can_contact") return { data: true };
    if (fn === "crm_campaign_contact_counts") return { data: counts };
    if (failure) return { error: failure };
    if (fn === "crm_materialize_campaign") return { data: { total: 1001, pending: 1000, skipped: 1, skipped_by_reason: { opted_out: 1 }, estimated_cost: null } };
    return { data: campaign(args.p_action === "launch" ? "sending" : status, statistics) };
  });
}

test("publica una sola vez, transmite versión/actor y devuelve las cifras de SQL", async () => {
  const { sb, calls, rpcCalls } = fixture();
  const result = await materializeCampaign(7, "camp", sb, sb, new Date("2026-10-01T12:00:00Z"), "actor");
  expect(result).toMatchObject({ total: 1001, pending: 1000, skipped: 1 });
  const writes = rpcCalls.filter(c => c.fn === "crm_materialize_campaign");
  expect(writes).toHaveLength(1);
  expect(writes[0].args).toMatchObject({ p_org: 7, p_campaign: "camp", p_version: campaign().updated_at, p_actor: "actor",
    p_rows: [{ customer_id: "customer", state: "pending", metadata: { recipient: "12025550198" } }] });
  expect(calls.some(c => ["update", "insert", "upsert", "delete"].some(op => has(c.ops, op)))).toBe(false);
});

test("materializar una programada no modifica audiencia ni estado", async () => {
  const { sb, rpcCalls } = fixture("scheduled");
  await expect(materializeCampaign(7, "camp", sb, sb)).rejects.toMatchObject({ code: "NOT_EDITABLE", status: 409 });
  expect(rpcCalls).toHaveLength(0);
});

test("fallo de publicación se propaga sin escrituras de reparación fuera de la transacción", async () => {
  const { sb, calls } = fixture("draft", {}, { code: "P0001", message: "campana_modificada" });
  await expect(materializeCampaign(7, "camp", sb, sb)).rejects.toMatchObject({ status: 409 });
  expect(calls.some(c => has(c.ops, "update") || has(c.ops, "delete"))).toBe(false);
});

test("lanzar usa conteo actual, versión/actor y una sola RPC sin deduct/enqueue separado", async () => {
  const { sb, calls, rpcCalls } = fixture("draft", { pending: 0 });
  await expect(launchCampaign(7, "actor", "camp", {}, sb, sb)).resolves.toMatchObject({ effective_status: "sending" });
  const writes = rpcCalls.filter(c => c.fn === "crm_campaign_transition");
  expect(writes).toHaveLength(1);
  expect(writes[0].args).toMatchObject({ p_org: 7, p_action: "launch", p_actor: "actor", p_version: campaign().updated_at });
  expect(writes[0].args.p_options).not.toHaveProperty("scheduled_at");
  expect(rpcCalls.some(c => ["deduct_comm_credits", "fn_enqueue_job"].includes(c.fn))).toBe(false);
  expect(calls.some(c => has(c.ops, "update"))).toBe(false);
});

test.each([
  ["pause", pauseCampaign, "sending", {}],
  ["resume", resumeCampaign, "sending", { state: "paused" }],
  ["cancel", cancelCampaign, "sending", {}],
] as const)("%s conserva contexto y deja los efectos en SQL", async (action, run, status, statistics) => {
  const { sb, calls, rpcCalls } = fixture(status, statistics);
  await run(7, "camp", sb, sb, "actor");
  expect(rpcCalls).toEqual([{ fn: "crm_campaign_transition", args: { p_org: 7, p_campaign: "camp", p_action: action,
    p_version: campaign().updated_at, p_actor: "actor", p_options: {} } }]);
  expect(calls.some(c => has(c.ops, "update") || has(c.ops, "delete"))).toBe(false);
});

test.each([
  ["P0001", "creditos_insuficientes", 402],
  ["42501", "actor_ajeno", 403],
  ["P0002", "campana_no_encontrada", 404],
  ["P0001", "campana_modificada", 409],
  ["XX000", "fallo de datos", 500],
])("lanzamiento falla cerrado: %s/%s", async (code, message, status) => {
  const { sb } = fixture("draft", {}, { code, message });
  await expect(launchCampaign(7, "actor", "camp", {}, sb, sb)).rejects.toMatchObject({ status });
});
