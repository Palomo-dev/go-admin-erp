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
let allowed: boolean;
jest.mock("@/lib/utils/orgContext", () => ({
  OrgContextError: RealOrgContextError,
  getServerOrgContext: jest.fn(async () => ({
    organizationId: ORG,
    userId: YO,
    roleId: 4,
    isSuperAdmin: false,
    supabase: fakeSupabase(db),
  })),
  hasOrgAdminOrPermission: jest.fn(async () => allowed),
}));
jest.mock("@/lib/services/crm/whatsapp/channelService", () => ({
  getOrgSettings: jest.fn(async () => ({ default_country_code: "57" })),
  defaultCountryOf: () => "57",
}));
import { GET, POST, DELETE } from "../route";
const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/crm/customer-duplicates", {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
beforeEach(() => {
  allowed = true;
  db = makeDb({ customer_merge_exclusions: [], customer_duplicate_scans: [] });
  db.rpc.crm_find_duplicates = {
    data: [
      {
        identity_type: "phone",
        identity_value: "00000001",
        customers: [
          { id: U(1), phone: "+573100000001" },
          { id: U(2), phone: "3100000001" },
        ],
      },
    ],
  };
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
it("solo pasa org de sesión a la RPC y confirma teléfonos con el normalizador", async () => {
  const result = await GET(req("GET"));
  expect(result.status).toBe(200);
  const json = await result.json();
  expect(json.total).toBe(1);
  expect(json.data[0].identity_value).toBe("573100000001");
  expect(db.rpcCalls[0]).toEqual({
    fn: "crm_find_duplicates",
    args: { p_org: ORG },
  });
});
it("403 sin permiso antes de ejecutar RPC", async () => {
  allowed = false;
  expect((await GET(req("GET"))).status).toBe(403);
  expect((await POST(req("POST", {}))).status).toBe(403);
  expect(
    (await DELETE(req("DELETE", { customer_a: U(1), customer_b: U(2) })))
      .status,
  ).toBe(403);
  expect(db.rpcCalls).toEqual([]);
});
it("403 para organización ajena sin encolar ni excluir", async () => {
  expect((await POST(req("POST", { organization_id: OTRA }))).status).toBe(403);
  expect(
    (
      await DELETE(
        req("DELETE", {
          organization_id: OTRA,
          customer_a: U(1),
          customer_b: U(2),
        }),
      )
    ).status,
  ).toBe(403);
  expect(db.rpcCalls).toEqual([]);
});
it("encola de forma atómica y devuelve 202", async () => {
  db.rpc.crm_start_duplicate_scan = { data: U(30) };
  expect((await POST(req("POST", {}))).status).toBe(202);
  expect(db.rpcCalls).toEqual([
    { fn: "crm_start_duplicate_scan", args: { p_org: ORG } },
  ]);
  expect(db.writes).toEqual([]);
});
it("el par excluido no vuelve a aparecer", async () => {
  db.t.customer_merge_exclusions.push({
    organization_id: ORG,
    customer_a: U(1),
    customer_b: U(2),
  });
  const result = await GET(req("GET"));
  expect((await result.json()).total).toBe(0);
});
it("404 al excluir un id ajeno, sin falso éxito", async () => {
  db.rpc.crm_exclude_customer_pair = {
    error: { code: "P0002", message: "cliente_no_encontrado" },
  };
  expect(
    (await DELETE(req("DELETE", { customer_a: U(1), customer_b: U(90) })))
      .status,
  ).toBe(404);
});

it("un worker anterior no deja una búsqueda en espera indefinida", async () => {
  db.t.customer_duplicate_scans.push({
    id: U(30),
    organization_id: ORG,
    status: "queued",
    job: { status: "done" },
  });
  const response = await GET(req("GET"));
  expect((await response.json()).scan.status).toBe("failed");
});
