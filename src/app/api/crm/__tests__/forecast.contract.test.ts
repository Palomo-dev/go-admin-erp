const { OrgContextError: RealOrgContextError } = jest.requireActual<
  typeof import("@/lib/utils/orgContextError")
>("@/lib/utils/orgContextError");
import {
  fakeSupabase,
  makeDb,
  ORG,
  OTRA,
  U,
  YO,
  OTRO_VENDEDOR,
  type Ola1Db,
} from "./ola1Fake";
import type { ForecastSnapshot } from "@/lib/services/crm/forecastLogica";
let db: Ola1Db;
let serviceDb: Ola1Db;
let permisos: Set<string>;
jest.mock("@/lib/utils/orgContext", () => ({
  OrgContextError: RealOrgContextError,
  getServerOrgContext: jest.fn(async () => ({
    organizationId: ORG,
    userId: YO,
    roleId: 4,
    isSuperAdmin: false,
    supabase: fakeSupabase(db),
  })),
  hasOrgAdminOrPermission: jest.fn(async (_ctx: unknown, code: string) =>
    permisos.has(code),
  ),
}));
jest.mock("@/lib/services/monedaOrganizacion", () => ({
  resolverContextoMoneda: jest.fn(async () => ({
    code: "USD",
    decimals: 2,
    locale: "es-CO",
  })),
}));
jest.mock("@/lib/services/organizationTimezoneService", () => ({
  getOrganizationTimezone: jest.fn(async () => "Pacific/Honolulu"),
}));
jest.mock("@/lib/supabase/server-service", () => ({
  getServiceClient: () => fakeSupabase(serviceDb),
}));
import { NextRequest } from "next/server";
import { GET } from "../forecast/route";
import { POST } from "../forecast/adjustments/route";
import { PATCH } from "../opportunities/[id]/forecast-category/route";
const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const body = () => ({
  period: "2026-Q3",
  user_id: YO,
  amount_after: 150,
  expected_before: 100,
  expected_adjustment_id: null,
  reason_code: "upside",
  reason_text: "Acuerdo confirmado",
});
const snap = (): ForecastSnapshot => ({
  period: "2026-Q3",
  start: "2026-07-01",
  end: "2026-10-01",
  date: "2026-09-30",
  timezone: "UTC",
  base: "USD",
  users: [
    { id: YO, first_name: "Ejemplo", last_name: null },
    { id: OTRO_VENDEDOR, first_name: "Otra persona", last_name: null },
  ],
  opportunities: [
    {
      id: U(1),
      name: "Propuesta",
      salesperson_id: YO,
      amount: 100,
      currency: "USD",
      status: "open",
      expected_close_date: "2026-09-30",
      closed_at: null,
      updated_at: null,
      forecast_category: null,
      probability: 80,
      is_won: false,
      is_lost: false,
      stage_name: "Propuesta",
    },
  ],
  targets: [],
  teamQuotas: [],
  rates: [],
  adjustments: [],
  snapshotToken: "trusted-only-server",
  canViewAll: true,
  canAdjust: true,
  canEditAny: false,
  currentUser: YO,
});
beforeEach(() => {
  db = makeDb({
    sales_teams: [
      {
        id: U(40),
        organization_id: ORG,
        name: "Equipo ejemplo",
        is_active: true,
      },
      { id: U(41), organization_id: OTRA, name: "Señuelo", is_active: true },
    ],
  });
  serviceDb = makeDb();
  db.rpc.crm_forecast_snapshot = { data: snap() };
  db.rpc.crm_set_forecast_category = { data: { id: U(1) } };
  serviceDb.rpc.crm_record_forecast_adjustment = {
    data: { id: U(90), adjusted_by: YO, snapshot_token: "private" },
  };
  permisos = new Set([
    "crm.opportunities.view",
    "crm.opportunities.edit",
    "crm.forecast.view_all",
    "crm.forecast.adjust",
  ]);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
it("organización de sesión y equipos aislados; no expone token interno", async () => {
  const res = await GET(req("/api/crm/forecast?period=2026-Q3"));
  const { data } = await res.json();
  expect(res.status).toBe(200);
  expect(data.teams.map((x: { id: string }) => x.id)).toEqual([U(40)]);
  expect(data.snapshotToken).toBeUndefined();
  expect(db.rpcCalls[0].args.p_org).toBe(ORG);
  expect(data.summary.weighted.total).toBe(80);
});
it("mantiene el selector de vendedores al filtrar uno", async () => {
  const res = await GET(
    req(`/api/crm/forecast?period=2026-Q3&user_id=${OTRO_VENDEDOR}`),
  );
  const { data } = await res.json();
  expect(res.status).toBe(200);
  expect(data.sellers).toHaveLength(2);
  expect(data.rows.map((x: { userId: string }) => x.userId)).toEqual([
    OTRO_VENDEDOR,
  ]);
  expect(data.summary.commit.total).toBe(0);
});
it("página 9 vacía conserva el total de las 205 oportunidades", async () => {
  const s = snap();
  s.opportunities = Array.from({ length: 205 }, (_, i) => ({
    ...s.opportunities[0],
    id: U(i + 1000),
  }));
  db.rpc.crm_forecast_snapshot = { data: s };
  const res = await GET(req("/api/crm/forecast?period=2026-Q3&page=9"));
  const { data } = await res.json();
  expect(data.opportunities).toHaveLength(5);
  expect(data.opportunityCount).toBe(205);
  expect(data.summary.commit.total).toBe(20500);
  expect(data.monthly.months[2].summary.commit.total).toBe(20500);
  expect(data.currentUserId).toBe(YO);
});
it.each([
  "/api/crm/forecast?organization_id=121",
  "/api/crm/forecast?org_id=121",
])("rechaza organización ajena %s antes de leer", async (url) => {
  expect((await GET(req(url))).status).toBe(403);
  expect(db.rpcCalls).toHaveLength(0);
});
it("sin permiso de lectura da 403", async () => {
  permisos.delete("crm.opportunities.view");
  expect((await GET(req("/api/crm/forecast"))).status).toBe(403);
  expect(db.rpcCalls).toHaveLength(0);
});
it("un vendedor no puede pedir otro vendedor", async () => {
  permisos.delete("crm.forecast.view_all");
  expect(
    (await GET(req(`/api/crm/forecast?user_id=${OTRO_VENDEDOR}`))).status,
  ).toBe(403);
  expect(db.rpcCalls).toHaveLength(0);
});
it.each([
  ["42501", 403],
  ["P0002", 404],
  ["40001", 409],
  ["XX000", 500],
])("propaga error SQL %s como %s, sin inventar datos", async (code, status) => {
  db.rpc.crm_forecast_snapshot = { error: { code, message: "prueba" } };
  expect((await GET(req("/api/crm/forecast?period=2026-Q3"))).status).toBe(
    status,
  );
});
it("ajuste: antes, autor, moneda y token salen del servidor; no del body", async () => {
  const res = await POST(req("/api/crm/forecast/adjustments", "POST", body()));
  expect(res.status).toBe(201);
  expect(serviceDb.rpcCalls[0].args).toMatchObject({
    p_org: ORG,
    p_actor: YO,
    p_before: 100,
    p_after: 150,
    p_currency: "USD",
    p_snapshot: "trusted-only-server",
  });
  expect((await res.json()).data.snapshot_token).toBeUndefined();
  expect(db.writes).toHaveLength(0);
});
it.each([
  { organization_id: OTRA },
  { adjusted_by: OTRO_VENDEDOR },
  { amount_before: 0 },
])("rechaza suplantación sin escribir %j", async (extra) => {
  const res = await POST(
    req("/api/crm/forecast/adjustments", "POST", { ...body(), ...extra }),
  );
  expect([400, 403]).toContain(res.status);
  expect(serviceDb.rpcCalls).toHaveLength(0);
});
it("rechaza cifras desactualizadas antes de escribir", async () => {
  expect(
    (
      await POST(
        req("/api/crm/forecast/adjustments", "POST", {
          ...body(),
          expected_before: 99,
        }),
      )
    ).status,
  ).toBe(409);
  expect(serviceDb.rpcCalls).toHaveLength(0);
});
it("rechaza ajustar sin tasas", async () => {
  const s = snap();
  s.opportunities[0].currency = "EUR";
  db.rpc.crm_forecast_snapshot = { data: s };
  expect(
    (
      await POST(
        req("/api/crm/forecast/adjustments", "POST", {
          ...body(),
          expected_before: 0,
        }),
      )
    ).status,
  ).toBe(409);
  expect(serviceDb.rpcCalls).toHaveLength(0);
});
it("reversión agrega auditoría: el servidor calcula el delta", async () => {
  const s = snap();
  s.adjustments = [
    {
      id: U(90),
      user_id: YO,
      amount_before: 100,
      amount_after: 150,
      currency: "USD",
      adjusted_by: YO,
      reason_code: "upside",
      reason_text: "Confirmación",
      created_at: "2026-09-30T12:00:00Z",
      reverses_id: null,
    },
  ];
  db.rpc.crm_forecast_snapshot = { data: s };
  const { amount_after: unused, ...v } = body();
  void unused;
  const res = await POST(
    req("/api/crm/forecast/adjustments", "POST", {
      ...v,
      expected_before: 150,
      expected_adjustment_id: U(90),
      reason_code: "reversal",
      reverses_id: U(90),
    }),
  );
  expect(res.status).toBe(201);
  expect(serviceDb.rpcCalls[0].args).toMatchObject({
    p_before: 150,
    p_after: 100,
    p_reverses: U(90),
  });
  expect(db.writes).toHaveLength(0);
});
it("categoría usa la misma RPC con concurrencia, sin aceptar montos", async () => {
  const res = await PATCH(
    req("/api/crm/opportunities/x/forecast-category", "PATCH", {
      category: "omitted",
      expected_updated_at: null,
    }),
    { params: Promise.resolve({ id: U(1) }) },
  );
  expect(res.status).toBe(200);
  expect(db.rpcCalls[0]).toEqual({
    fn: "crm_set_forecast_category",
    args: {
      p_org: ORG,
      p_id: U(1),
      p_category: "omitted",
      p_expected_updated_at: null,
    },
  });
  expect(
    (
      await PATCH(
        req("/api/crm/opportunities/x/forecast-category", "PATCH", {
          category: "commit",
          expected_updated_at: null,
          amount: 10,
        }),
        { params: Promise.resolve({ id: U(1) }) },
      )
    ).status,
  ).toBe(400);
});
