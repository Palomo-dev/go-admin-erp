jest.mock('@/lib/security/webhookSignatures', () => ({}));
import { readHealthCustomer, readHealthDashboard } from '../healthReadService';
import { createFakeSupabase, makeDb, type FakeDb } from './f11FakeSupabase';
import { DEFAULT_HEALTH_CONFIG } from '../healthFactorConfig';
import type { CrmSesion } from '../crmRouteSupport';
const CUSTOMER = '10000000-0000-4000-8000-000000000001';
const OTHER = '10000000-0000-4000-8000-000000000002';
const raw = (id = CUSTOMER) => ({ customer_id: id, invoices_12m: 1, revenue_12m: 49000, days_since_last_invoice: 77, days_since_last_activity: null, overdue_balance: 0, overdue_ratio: 0, score: 58, band: 'at_risk' });
let db: FakeDb; let ctx: CrmSesion; let rpcCalls: { name: string; args: Record<string, unknown> }[];
function setup(health = [raw()], denied: (number | null)[] = []) {
  rpcCalls = [];
  const base = createFakeSupabase(db);
  const supabase = {
    ...base,
    from: (name: string) => {
      const q = base.from(name) as unknown as Record<string, (...args: unknown[]) => unknown>;
      const order = q.order; q.order = (...args) => args[0] === 'id' ? q : order(...args);
      return q;
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === 'check_user_permission') return Promise.resolve({ data: false, error: null });
      if (name === 'app_branch_access') return Promise.resolve({ data: !denied.includes(args.p_branch_id as number | null), error: null });
      if (name !== 'fn_customer_health') throw new Error(`Unexpected RPC ${name}`);
      const rows = health.filter(row => args.p_customer_id === null || row.customer_id === args.p_customer_id).sort((a, b) => a.customer_id.localeCompare(b.customer_id));
      const q = { order: () => q, range: async (start: number, end: number) => ({ data: rows.slice(start, end + 1), error: null }) };
      return q;
    },
  };
  ctx = { organizationId: 120, userId: 'user-test', roleId: 2, isSuperAdmin: false, supabase: supabase as unknown as CrmSesion['supabase'] };
}
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-01T12:00:00Z'));
  db = makeDb({ health_score_configs: [{ organization_id: 120, config: DEFAULT_HEALTH_CONFIG }], customers: [{ id: CUSTOMER, organization_id: 120, full_name: 'Cliente de prueba', branch_id: 1, phone: null, email: null, do_not_call: true, owner_id: 'user-test' }, { id: OTHER, organization_id: 121, full_name: 'Señuelo', branch_id: 1 }], invoice_sales: [{ id: 'i1', organization_id: 120, customer_id: CUSTOMER, status: 'paid' }, { id: 'i2', organization_id: 121, customer_id: CUSTOMER, status: 'paid' }, { id: 'i3', organization_id: 120, customer_id: CUSTOMER, status: 'void' }], health_score_snapshots: [] });
  setup();
});
afterEach(() => jest.useRealTimers());
test('el score usa config canónica y conteo/identidad usan org sesión, excluyendo señuelo y anulada', async () => {
  const detail = await readHealthCustomer(ctx, CUSTOMER);
  expect(detail.health).toMatchObject({ score: 22, band: 'red', do_not_call: true });
  expect(detail.invoice_count).toBe(1);
  expect(rpcCalls).toContainEqual({ name: 'fn_customer_health', args: { p_org_id: 120, p_customer_id: CUSTOMER } });
  expect(db.writes).toEqual([]);
});
test('sucursal denegada falla antes de calcular o devolver datos privados del cliente', async () => {
  setup([raw()], [1]);
  await expect(readHealthCustomer(ctx, CUSTOMER)).rejects.toMatchObject({ status: 403 });
  expect(rpcCalls.map(call => call.name)).toEqual(['app_branch_access']);
  expect((await readHealthDashboard(ctx)).scores).toEqual([]);
});
test('cliente ajeno es 404; una RPC inconsistente sin identidad visible no se oculta como cero clientes', async () => {
  await expect(readHealthCustomer(ctx, OTHER)).rejects.toMatchObject({ status: 404 });
  setup([raw(OTHER)]);
  await expect(readHealthDashboard(ctx)).rejects.toMatchObject({ status: 409 });
});
test('fallo de lectura de cliente falla explícito, historial falla aislado sin borrar puntaje', async () => {
  db.nextReadError = { table: 'customers', error: { code: 'XX000', message: 'fallo-prueba' } };
  await expect(readHealthCustomer(ctx, CUSTOMER)).rejects.toMatchObject({ code: 'XX000' });
  db.nextReadError = { table: 'health_score_snapshots', error: { code: 'XX000', message: 'fallo-historial' } };
  expect(await readHealthCustomer(ctx, CUSTOMER)).toMatchObject({ health: { score: 22 }, history_error: true });
});
test('historial trae primero las últimas mediciones y delta usa hace30d; tendencia promedia un punto por cliente/semana', async () => {
  db.rows.health_score_snapshots = [{ id: 's-old', organization_id: 120, customer_id: CUSTOMER, score: 40, band: 'yellow', created_at: '2026-08-30T12:00:00Z', indicators: raw() }, { id: 's-first', organization_id: 120, customer_id: CUSTOMER, score: 10, band: 'red', created_at: '2026-09-29T12:00:00Z', indicators: raw() }, { id: 's-last', organization_id: 120, customer_id: CUSTOMER, score: 30, band: 'red', created_at: '2026-09-30T12:00:00Z', indicators: raw() }];
  const detail = await readHealthCustomer(ctx, CUSTOMER, 2);
  expect(detail.history.map(snap => snap.id)).toEqual(['s-first', 's-last']);
  const dashboard = await readHealthDashboard(ctx);
  expect(dashboard.scores[0].previous_score).toBe(40);
  expect(dashboard.scores[0].snapshot_raw?.score).toBe(30);
  expect(dashboard.trend.at(-1)?.score).toBe(30);
});
test('RPC inválida falla explícito en vez de fabricar un cero', async () => {
  setup([{ ...raw(), revenue_12m: null as unknown as number }]);
  await expect(readHealthDashboard(ctx)).rejects.toMatchObject({ status: 502 });
});

test('metadata medir usa permiso servidor canónico y lectura sola no habilita write', async () => {
  ctx.roleId = 99;
  const detail = await readHealthCustomer(ctx, CUSTOMER);
  expect(detail.can_measure).toBe(false);
  expect(rpcCalls).toContainEqual({ name: 'check_user_permission', args: { p_user_id: 'user-test', p_organization_id: 120, p_permission_code: 'crm.customers.edit' } });
});

test('metadata administrar consulta admin.full_access para roles sin shortcut y falla cerrada', async () => {
  ctx.roleId = 99;
  expect((await readHealthDashboard(ctx)).can_manage).toBe(false);
  expect(rpcCalls).toContainEqual({ name: 'check_user_permission', args: { p_user_id: 'user-test', p_organization_id: 120, p_permission_code: 'admin.full_access' } });
  const baseRpc = ctx.supabase.rpc.bind(ctx.supabase);
  ctx.supabase.rpc = ((name: string, args: Record<string, unknown>) => name === 'check_user_permission' ? Promise.resolve({ data: true, error: null }) : baseRpc(name, args)) as CrmSesion['supabase']['rpc'];
  expect((await readHealthDashboard(ctx)).can_manage).toBe(true);
});
