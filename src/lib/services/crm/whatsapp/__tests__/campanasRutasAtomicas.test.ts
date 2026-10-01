import { NextRequest } from "next/server";
import { makeSupabase } from "./mockSupabase";
import { OrgContextError } from "@/lib/utils/orgContextError";
import type { ServerOrgContext } from "@/lib/utils/orgContext";

let ctx: ServerOrgContext | null;
let allowed: boolean;
let owned: boolean;
const rpc = jest.fn();
const service = { rpc };
const authorize = jest.fn();
jest.mock("@/lib/utils/orgContext", () => ({
  OrgContextError: jest.requireActual<typeof import("@/lib/utils/orgContextError")>("@/lib/utils/orgContextError").OrgContextError,
  getServerOrgContext: async () => {
    if (!ctx) throw new OrgContextError("No autenticado", 401, "UNAUTHENTICATED");
    return ctx;
  },
  requireOrgAdminOrPermission: async (...args: unknown[]) => {
    authorize(...args);
    if (!allowed) throw new OrgContextError("Sin permiso", 403, "FORBIDDEN");
  },
}));
jest.mock("@/lib/supabase/server-service", () => ({ getServiceClient: () => service }));

import { POST as cancel } from "@/app/api/crm/campaigns/[id]/cancel/route";
import { POST as pause } from "@/app/api/crm/campaigns/[id]/pause/route";
import { POST as resume } from "@/app/api/crm/campaigns/[id]/resume/route";
import { POST as launch } from "@/app/api/crm/campaigns/[id]/launch/route";

const ID = "11111111-1111-4111-8111-111111111111";
const row = { id: ID, organization_id: 7, name: "Fixture", status: "sending", channel: "whatsapp", updated_at: "2026-10-01T00:00:00Z", statistics: {} };
const call = (run: typeof cancel, body = {}) => run(new NextRequest(`http://localhost/api/crm/campaigns/${ID}/cancel`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}), { params: Promise.resolve({ id: ID }) });

beforeEach(() => {
  allowed = true; owned = true; rpc.mockReset(); authorize.mockReset();
  rpc.mockResolvedValue({ data: row, error: null });
  ctx = { organizationId: 7, userId: "actor", supabase: makeSupabase({ campaigns: () => ({ data: owned ? row : null }) }).sb } as unknown as ServerOrgContext;
});

test.each([["cancel", cancel], ["pause", pause], ["resume", resume]] as const)("%s usa organización/actor de sesión y permiso real antes de la RPC", async (action, run) => {
  const response = await call(run);
  expect(response.status).toBe(200);
  expect(authorize).toHaveBeenCalledWith(ctx, "crm.campaigns.manage");
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith("crm_campaign_transition", expect.objectContaining({ p_org: 7, p_actor: "actor", p_action: action, p_campaign: ID }));
});

test.each([["cancel", cancel], ["pause", pause], ["resume", resume], ["launch", launch]] as const)("%s rechaza sin sesión, sin permiso y organización ajena sin ejecutar SQL", async (_action, run) => {
  ctx = null; expect((await call(run)).status).toBe(401);
  ctx = { organizationId: 7, userId: "actor" } as ServerOrgContext;
  allowed = false; expect((await call(run)).status).toBe(403);
  allowed = true; expect((await call(run, { organization_id: 999 })).status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
});

test("una campaña ajena responde 404 y no alcanza el servicio privado", async () => {
  owned = false;
  expect((await call(cancel)).status).toBe(404);
  expect(rpc).not.toHaveBeenCalled();
});

test("una versión cambiada responde 409; un fallo financiero no responde éxito", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "campana_modificada" } });
  expect((await call(cancel)).status).toBe(409);
  rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "Fixture base caída" } });
  expect((await call(cancel)).status).toBe(500);
});
