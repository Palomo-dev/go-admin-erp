/// <reference types="jest" />
const { OrgContextError: RealOrgContextError } = jest.requireActual<
  typeof import("@/lib/utils/orgContextError")
>("@/lib/utils/orgContextError");
import { NextRequest } from "next/server";
import {
  fakeSupabase,
  makeDb,
  ORG,
  OTRA,
  U,
  YO,
  type Ola1Db,
} from "../../__tests__/ola1Fake";
let db: Ola1Db;
let all: boolean;
jest.mock("@/lib/utils/orgContext", () => ({
  OrgContextError: RealOrgContextError,
  getServerOrgContext: jest.fn(async () => ({
    organizationId: ORG,
    userId: YO,
    roleId: 4,
    isSuperAdmin: false,
    supabase: fakeSupabase(db),
  })),
  hasOrgAdminOrPermission: jest.fn(async () => all),
}));
jest.mock("@/lib/services/organizationTimezoneService", () => ({
  getOrganizationTimezone: jest.fn(async () => "America/Bogota"),
}));
import { GET, POST } from "../route";
const get = (params = "") =>
  new NextRequest(`http://localhost/api/crm/calls?${params}`);
const post = (body: unknown) =>
  new NextRequest("http://localhost/api/crm/calls", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  all = false;
  db = makeDb({
    customers: [
      { id: U(1), organization_id: ORG },
      { id: U(2), organization_id: OTRA },
    ],
    opportunities: [{ id: U(3), organization_id: OTRA }],
    calls: [],
  });
  db.rpc.crm_calls_list = {
    data: {
      data: [],
      count: 205,
      canViewAll: false,
      stats: { totalToday: 205, avgDuration: 103, missed: 1 },
    },
  };
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
it("vendedor siempre consulta sus llamadas; conserva el total global de la RPC", async () => {
  const response = await GET(
    get("limit=1&offset=25&has_recording=false&q=promesa"),
  );
  expect(response.status).toBe(200);
  expect((await response.json()).count).toBe(205);
  expect(db.rpcCalls[0]).toEqual({
    fn: "crm_calls_list",
    args: {
      p_org: ORG,
      p_filters: {
        user_id: YO,
        limit: 1,
        offset: 25,
        has_recording: false,
        q: "promesa",
      },
    },
  });
});
it("403 para vendedor ajeno antes de consultar", async () => {
  expect((await GET(get(`user_id=${U(999)}`))).status).toBe(403);
  expect(db.rpcCalls).toHaveLength(0);
});
it("supervisor puede filtrar otro vendedor o usar me", async () => {
  all = true;
  expect((await GET(get(`user_id=${U(999)}`))).status).toBe(200);
  expect(db.rpcCalls[0].args.p_filters).toEqual({ user_id: U(999) });
  await GET(get("user_id=me"));
  expect(db.rpcCalls[1].args.p_filters).toEqual({ user_id: YO });
});
it("días completos en zona de organización; hasta es exclusivo", async () => {
  await GET(get("from_date=2026-09-30&to_date=2026-09-30"));
  expect(db.rpcCalls[0].args.p_filters).toEqual({
    user_id: YO,
    from_date: "2026-09-30T05:00:00.000Z",
    to_date: "2026-10-01T05:00:00.000Z",
    to_date_exclusive: true,
  });
});
it.each([
  "from_date=2026-02-30",
  "limit=201",
  "offset=-1",
  "has_recording=other",
  "status=unknown",
])("400 para %s sin RPC", async (params) => {
  expect((await GET(get(params))).status).toBe(400);
  expect(db.rpcCalls).toHaveLength(0);
});
it("organización distinta en URL o body es 403", async () => {
  expect((await GET(get(`organization_id=${OTRA}`))).status).toBe(403);
  expect((await POST(post({ organization_id: OTRA }))).status).toBe(403);
  expect(db.rpcCalls).toHaveLength(0);
  expect(db.writes).toHaveLength(0);
});
it("errores de SQL no se disfrazan como una lista vacía ni exponen datos", async () => {
  db.rpc.crm_calls_list = {
    error: { code: "XX000", message: "private query detail" },
  };
  const response = await GET(get());
  expect(response.status).toBe(500);
  expect(JSON.stringify(await response.json())).not.toContain(
    "private query detail",
  );
});
const manual = {
  provider: "manual",
  direction: "outbound",
  from_number: "+12025550197",
  to_number: "+12025550198",
};
it.each([{ customer_id: U(2) }, { opportunity_id: U(3) }])(
  "no permite referencias de otra organización %o",
  async (ref) => {
    expect((await POST(post({ ...manual, ...ref }))).status).toBe(404);
    expect(db.writes).toHaveLength(0);
  },
);
it("registro manual asigna el usuario y organización de la sesión", async () => {
  expect((await POST(post({ ...manual, customer_id: U(1) }))).status).toBe(201);
  expect(db.writes[0].payload).toEqual(
    expect.objectContaining({
      organization_id: ORG,
      user_id: YO,
      mode: "manual",
      status: "completed",
    }),
  );
});
