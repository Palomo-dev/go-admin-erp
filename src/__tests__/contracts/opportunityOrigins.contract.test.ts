import { NextRequest } from 'next/server';
import { GET } from '@/app/api/crm/opportunity-origins/[tipo]/[id]/route';
import { leerOrigenOportunidad, type TipoOrigenOportunidad } from '@/lib/services/crm/opportunityOriginService';
import type { CrmSesion } from '@/lib/services/crm/crmRouteSupport';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getOpportunityFinance360 } from '@/lib/services/crm/crmFinanceService';
import { GET as GETFinance } from '@/app/api/crm/opportunities/[id]/finance/route';

const mockCtx = jest.fn();
const mockPermission = jest.fn();
jest.mock('@/lib/utils/orgContext', () => ({
  getServerOrgContext: (...args: unknown[]) => mockCtx(...args),
  hasOrgAdminOrPermission: (...args: unknown[]) => mockPermission(...args),
  OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError,
}));

type Row = Record<string, unknown>;
type Result = { data: Row | Row[] | null; error: { code: string; message: string } | null };
class Builder {
  constructor(private readonly db: Db, readonly table: string) {}
  select() { return this; }
  eq(key: string, value: unknown) { this.db.filters.push([this.table, key, value]); return this; }
  in(key: string, value: unknown[]) { this.db.filters.push([this.table, key, value]); return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { return Promise.resolve(this.db.results[this.table] ?? { data: null, error: null }); }
  then<TResult1 = Result, TResult2 = never>(fulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null, rejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2> {
    return this.maybeSingle().then(fulfilled, rejected);
  }
}
class Db {
  filters: [string, string, unknown][] = [];
  results: Record<string, Result> = {};
  from = jest.fn((table: string) => new Builder(this, table));
  rpc = jest.fn().mockResolvedValue({ data: true, error: null });
}
const ID = '00000000-0000-4000-8000-000000000001';
const CUSTOMER = '00000000-0000-4000-8000-000000000002';
const OPPORTUNITY = '00000000-0000-4000-8000-000000000003';
const CHANNEL = '00000000-0000-4000-8000-000000000004';
let db: Db;
let ctx: CrmSesion;
const row = (data: Row | Row[] | null): Result => ({ data, error: null });
const params = (tipo = 'factura', id = ID) => ({ params: Promise.resolve({ tipo, id }) });
const req = (query = '') => new NextRequest(`https://test.local/api/crm/opportunity-origins/factura/${ID}${query}`);

beforeEach(() => {
  jest.clearAllMocks();
  mockPermission.mockResolvedValue(true);
  db = new Db();
  db.results.invoice_sales = row({ id: ID, customer_id: CUSTOMER, number: 'FV-TEST', total: '12000', currency: 'COP', updated_at: '2026-10-02T01:00:00Z', opportunity_id: null });
  db.results.quotations = db.results.invoice_sales;
  db.results.customers = row({ id: CUSTOMER, full_name: 'Cliente sintético' });
  db.results.invoice_items = row([{ id: ID, description: 'Concepto', qty: 2, total_line: 12000 }]);
  db.results.quotation_items = db.results.invoice_items;
  db.results.conversations = row({ id: ID, customer_id: CUSTOMER, branch_id: 7, channel_id: CHANNEL, created_at: '2026-10-01T20:00:00Z', updated_at: '2026-10-02T01:00:00Z', metadata: {} });
  db.results.channels = row({ id: CHANNEL, type: 'whatsapp' });
  ctx = { organizationId: 120, userId: ID, roleId: 1, isSuperAdmin: false, supabase: db as unknown as CrmSesion['supabase'] };
  mockCtx.mockResolvedValue(ctx);
});

test.each(['factura', 'cotizacion', 'conversacion'] as TipoOrigenOportunidad[])('lee %s con referencias propias y valores persistidos', async tipo => {
  const res = await GET(req(), params(tipo));
  expect(res.status).toBe(200);
  expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  expect((await res.json()).data).toMatchObject({ tipo, id: ID, customer_id: CUSTOMER, cliente_nombre: 'Cliente sintético', amount: tipo === 'conversacion' ? 0 : 12000 });
  const tabla = tipo === 'factura' ? 'invoice_sales' : tipo === 'cotizacion' ? 'quotations' : 'conversations';
  expect(db.filters).toContainEqual([tabla, 'organization_id', 120]);
  expect(db.filters).toContainEqual(['customers', 'organization_id', 120]);
  if (tipo === 'conversacion') {
    expect(db.filters).toContainEqual(['channels', 'organization_id', 120]);
    expect(db.rpc).toHaveBeenCalledWith('app_branch_access', { p_branch_id: 7 });
  }
});
test.each(['factura', 'cotizacion', 'conversacion'] as TipoOrigenOportunidad[])('una sucursal no autorizada de %s se rechaza antes de leer cliente o líneas', async tipo => {
  db.rpc.mockResolvedValue({ data: false, error: null });
  expect((await GET(req(), params(tipo))).status).toBe(403);
  expect(db.from.mock.calls.map(([table]) => table)).toEqual([tipo === 'factura' ? 'invoice_sales' : tipo === 'cotizacion' ? 'quotations' : 'conversations']);
});
test('fallo al verificar sucursal no equivale a acceso concedido', async () => {
  db.rpc.mockResolvedValue({ data: null, error: { code: '08006', message: 'SQL privado' } });
  const res = await GET(req(), params('conversacion'));
  expect(res.status).toBe(500);
  expect(JSON.stringify(await res.json())).not.toContain('SQL privado');
});
test.each(['organization_id', 'organizationId', 'org_id', 'orgId'])('rechaza alias de organización ajena %s antes de leer datos', async key => {
  const res = await GET(req(`?${key}=999`), params());
  expect(res.status).toBe(403);
  expect(db.from).not.toHaveBeenCalled();
});
test('401 de sesión y 403 de permiso no se convierten en fuentes vacías', async () => {
  mockCtx.mockRejectedValueOnce(new OrgContextError('Sesión requerida', 401, 'UNAUTHENTICATED'));
  expect((await GET(req(), params())).status).toBe(401);
  mockPermission.mockResolvedValue(false);
  expect((await GET(req(), params())).status).toBe(403);
  expect(db.from).not.toHaveBeenCalled();
});
test('Finanzas exige finance.view además del permiso CRM', async () => {
  mockPermission.mockImplementation(async (_ctx: unknown, code: string) => code !== 'finance.view');
  expect((await GET(req(), params())).status).toBe(403);
  expect(db.from).not.toHaveBeenCalled();
});
test('UUID/tipo inválidos se rechazan sin consulta', async () => {
  expect((await GET(req(), params('factura', 'mal'))).status).toBe(400);
  expect((await GET(req(), params('pos'))).status).toBe(400);
  expect(db.from).not.toHaveBeenCalled();
});
test('fuente ausente 404 y error de lectura 500', async () => {
  db.results.invoice_sales = row(null);
  expect((await GET(req(), params())).status).toBe(404);
  db.results.invoice_sales = { data: null, error: { code: '08006', message: 'SQL privado' } };
  const res = await GET(req(), params());
  expect(res.status).toBe(500);
  expect(JSON.stringify(await res.json())).not.toContain('SQL privado');
});
test('cliente ausente, canal ajeno o incoherencia del backlink no confirman vínculos', async () => {
  db.results.customers = row(null);
  expect((await GET(req(), params())).status).toBe(404);
  db.results.customers = row({ id: CUSTOMER, full_name: 'Cliente sintético' });
  db.results.channels = row(null);
  expect((await GET(req(), params('conversacion'))).status).toBe(404);
  db.results.invoice_sales = row({ id: ID, customer_id: CUSTOMER, total: 12000, currency: 'COP', opportunity_id: OPPORTUNITY });
  db.results.opportunities = row({ id: OPPORTUNITY, customer_id: CHANNEL });
  expect((await GET(req(), params())).status).toBe(409);
});
test('un backlink propio conserva la navegación y aplica scope a la oportunidad', async () => {
  db.results.invoice_sales = row({ id: ID, customer_id: CUSTOMER, total: 12000, currency: 'COP', opportunity_id: OPPORTUNITY });
  db.results.opportunities = row({ id: OPPORTUNITY, customer_id: CUSTOMER });
  expect(await leerOrigenOportunidad(ctx, 'factura', ID)).toMatchObject({ opportunity_id: OPPORTUNITY });
  expect(db.filters).toContainEqual(['opportunities', 'organization_id', 120]);
});
test('fallo al leer líneas y más de 200 líneas no se interpretan como documento vacío', async () => {
  db.results.invoice_items = { data: null, error: { code: '08006', message: 'falló' } };
  expect((await GET(req(), params())).status).toBe(500);
  db.results.invoice_items = row(Array.from({ length: 201 }, () => ({ description: 'Concepto', qty: 1, total_line: 1 })));
  expect((await GET(req(), params())).status).toBe(409);
});
test.each(['invoice_sales', 'payments', 'commissions', 'quotations'])('Finanzas de la oportunidad propaga el fallo de %s y no inventa cifras cero', async tabla => {
  db.results.invoice_sales = row([{ id: ID, total: 12000, balance: 12000 }]);
  db.results.payments = row([]);
  db.results.commissions = row([]);
  db.results.quotations = row([]);
  const error = { code: '08006', message: 'Fallo de lectura' };
  db.results[tabla] = { data: null, error };
  await expect(getOpportunityFinance360(120, OPPORTUNITY, ctx.supabase)).rejects.toEqual(error);
});
test('origen con importes o líneas no finitos no prellena cifras falsas', async () => {
  db.results.invoice_sales = row({ id: ID, customer_id: CUSTOMER, total: 'NaN', currency: 'COP' });
  expect((await GET(req(), params())).status).toBe(409);
  db.results.invoice_sales = row({ id: ID, customer_id: CUSTOMER, total: 12000, currency: 'COP' });
  db.results.invoice_items = row([{ description: 'Concepto', qty: 0, total_line: 12000 }]);
  expect((await GET(req(), params())).status).toBe(409);
});
test('API financiera convierte fallo real del servicio en 500 y rechaza organización ajena', async () => {
  db.results.opportunities = row({ id: OPPORTUNITY });
  db.results.invoice_sales = { data: null, error: { code: '08006', message: 'SQL privado' } };
  const res = await GETFinance(req(), { params: Promise.resolve({ id: OPPORTUNITY }) });
  expect(res.status).toBe(500);
  expect(JSON.stringify(await res.json())).not.toContain('SQL privado');
  for (const key of ['organization_id', 'organizationId', 'org_id', 'orgId']) {
    expect((await GETFinance(req(`?${key}=999`), { params: Promise.resolve({ id: OPPORTUNITY }) })).status).toBe(403);
  }
});
