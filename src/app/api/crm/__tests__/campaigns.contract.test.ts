import { fakeSupabase, makeDb, ORG, OTRA, U, YO, type Ola1Db } from "./ola1Fake";
const { OrgContextError: RealError } = jest.requireActual<typeof import("@/lib/utils/orgContextError")>("@/lib/utils/orgContextError");
let db: Ola1Db; let serviceDb: Ola1Db; let permisos: Set<string>;
jest.mock("@/lib/utils/orgContext", () => ({
  OrgContextError: RealError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: ORG, userId: YO, roleId: 4, isSuperAdmin: false, supabase: fakeSupabase(db) })),
  hasOrgAdminOrPermission: jest.fn(async (_ctx: unknown, code: string) => permisos.has(code)),
  requireOrgAdminOrPermission: jest.fn(async (_ctx: unknown, code: string) => { if (!permisos.has(code)) throw new RealError("Sin permiso", 403, "FORBIDDEN"); }),
}));
jest.mock("@/lib/supabase/server-service", () => ({ getServiceClient: () => fakeSupabase(serviceDb) }));
import { NextRequest } from "next/server";
import { GET } from "../campaigns/unified/route";
import { GET as detail, PATCH } from "../voice-agents/campaigns/[id]/route";
import { POST as stop } from "../voice-agents/campaigns/[id]/stop/route";
const request = (path: string, method = "GET", body?: unknown) => new NextRequest(`http://localhost${path}`, {
  method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
});
const params = () => ({ params: Promise.resolve({ id: U(1) }) });
beforeEach(() => {
  db = makeDb({
    voice_agent_campaigns: [{ id: U(1), organization_id: ORG, voice_agent_id: U(2), target_source: "segment", target_config: { segment_id: U(3) }, max_concurrent: 3 }],
    voice_agents: [{ id: U(2), organization_id: ORG }],
    segments: [{ id: U(3), organization_id: ORG }, { id: U(4), organization_id: OTRA }],
  });
  serviceDb = makeDb({ comm_settings: [{ organization_id: ORG, is_active: true, voice_max_concurrent_calls: 2 }] });
  permisos = new Set(["crm.opportunities.view", "crm.campaigns.manage"]);
  db.rpc.crm_campaigns_unificadas = { data: Array.from({ length: 205 }, (_, i) => ({
    id: U(i + 50), name: `Campaña ${i}`, source: "message", channel: i === 204 ? "email" : "whatsapp", status: "draft", stats: {}, voice_counts: {},
  })) };
  db.rpc.crm_voice_campaign_detail = { data: { campaign: { id: U(1) }, stats: {}, history: [], active: [] } };
  db.rpc.fn_stop_voice_campaign = { data: true };
});
test("filtra antes de paginar sobre más de 200 campañas", async () => {
  const r = await GET(request("/api/crm/campaigns/unified?page=9")); const j = await r.json();
  expect(r.status).toBe(200); expect(j.data.total).toBe(205); expect(j.data.rows).toHaveLength(5);
  const email = await GET(request("/api/crm/campaigns/unified?channel=email"));
  expect((await email.json()).data.total).toBe(1);
});
test("organización ajena en query o cuerpo da 403 sin RPC ni escritura", async () => {
  expect((await GET(request(`/api/crm/campaigns/unified?organization_id=${OTRA}`))).status).toBe(403);
  expect((await PATCH(request("/voice", "PATCH", { organization_id: OTRA, name: "Ajena" }), params())).status).toBe(403);
  expect(db.rpcCalls).toHaveLength(0); expect(db.writes).toHaveLength(0);
});
test("lectura y gestión requieren sus permisos respectivos", async () => {
  permisos.clear();
  expect((await GET(request("/api/crm/campaigns/unified"))).status).toBe(403);
  expect((await stop(request("/voice/stop", "POST", { reason: "Revisar lote" }), params())).status).toBe(403);
});
test("un PATCH de solo target_config no admite un segmento ajeno", async () => {
  expect((await PATCH(request("/voice", "PATCH", { target_config: { segment_id: U(4) } }), params())).status).toBe(404);
  expect(db.writes).toHaveLength(0);
});
test("rechaza topes superiores al canal pero permite pausar una campaña antigua", async () => {
  expect((await PATCH(request("/voice", "PATCH", { max_concurrent: 3 }), params())).status).toBe(400);
  expect((await PATCH(request("/voice", "PATCH", { status: "paused" }), params())).status).toBe(200);
});
test("la parada exige motivo y usa la RPC, nunca el PATCH de emergency_stop", async () => {
  expect((await stop(request("/voice/stop", "POST", { reason: " " }), params())).status).toBe(400);
  expect((await PATCH(request("/voice", "PATCH", { emergency_stop: true }), params())).status).toBe(400);
  expect((await stop(request("/voice/stop", "POST", { reason: "Revisión del lote" }), params())).status).toBe(200);
  expect(db.rpcCalls.at(-1)).toMatchObject({ fn: "fn_stop_voice_campaign", args: { p_org: ORG, p_campaign: U(1), p_reason: "Revisión del lote" } });
});
test("detalle transmite el tope canónico y convierte SQLSTATE sin filtrar errores internos", async () => {
  const response = await detail(request("/voice?page=2"), params());
  expect((await response.json()).data.failureThreshold).toBe(10);
  expect(db.rpcCalls.at(-1)?.args.p_page).toBe(2);
  db.rpc.crm_voice_campaign_detail = { error: { code: "P0002", message: "campana_no_encontrada" } };
  expect((await detail(request("/voice"), params())).status).toBe(404);
  db.rpc.crm_voice_campaign_detail = { error: { code: "XX000", message: "private database detail" } };
  const err = await detail(request("/voice"), params()); expect(err.status).toBe(500);
  expect(JSON.stringify(await err.json())).not.toContain("private database detail");
});
