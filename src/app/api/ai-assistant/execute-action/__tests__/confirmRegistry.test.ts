import { NextRequest } from 'next/server';
import { POST } from '../route';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getServiceClient } from '@/lib/supabase/server-service';
import { getAssistantCapabilities, type AssistantCapabilities } from '@/lib/ai/assistant/capabilities';
import { checkRateLimit } from '@/lib/security/rateLimit';
import { getTool } from '@/lib/ai/agent/toolRegistry';
import { resolveOrgCurrency } from '@/lib/ai/assistant/orgCurrency';

jest.mock('@/lib/utils/orgContext', () => ({ getServerOrgContext: jest.fn(), ...jest.requireActual('@/lib/utils/orgContextError') }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn() }));
jest.mock('@/lib/ai/assistant/capabilities', () => ({ ...jest.requireActual('@/lib/ai/assistant/capabilities'), getAssistantCapabilities: jest.fn() }));
jest.mock('@/lib/security/rateLimit', () => ({ checkRateLimit: jest.fn() }));
jest.mock('@/lib/ai/assistant/orgCurrency', () => ({ ...jest.requireActual('@/lib/ai/assistant/orgCurrency'), resolveOrgCurrency: jest.fn() }));

const id = '11111111-1111-4111-8111-111111111111';
let row: Record<string, unknown>;
let caps: AssistantCapabilities;
let claimWins: boolean;
const queries: Array<{ filters: Record<string, unknown>; patch?: Record<string, unknown> }> = [];
const audit = jest.fn().mockResolvedValue({ error: null });
const savedMessages = new Map<string, Record<string, unknown>>();
const saveResult = jest.fn(async (message: Record<string, unknown>): Promise<{ error: { message: string } | null }> => {
  if (!savedMessages.has(String(message.id))) savedMessages.set(String(message.id), message);
  return { error: null };
});
const conversationFilters = jest.fn();
let ownedConversation = true;
/** Fila de `customers` que devuelve la sesión en el cierre `external`. */
let customerRow: { id: string; full_name: string | null; created_at: string | null } | null = null;
interface SessionQueryMock {
  insert: typeof audit;
  upsert: typeof saveResult;
  select: () => SessionQueryMock;
  eq: (key: string, value: unknown) => SessionQueryMock;
  maybeSingle: () => Promise<{ data: { id: string } | null; error: null }>;
}
const sessionFrom = jest.fn((table: string) => {
  const query: SessionQueryMock = { insert: audit, upsert: saveResult, select: () => query,
    eq: (key: string, value: unknown) => { conversationFilters(key, value); return query; },
    maybeSingle: async () => ({ data: table === 'customers' ? customerRow : ownedConversation ? { id: 'hilo' } : null, error: null }) };
  if (!['activities', 'ai_assistant_messages', 'ai_assistant_conversations', 'customers'].includes(table)) throw new Error('Tabla inesperada');
  return query;
});
const sessionClient = { from: sessionFrom };
const actionFrom = jest.fn((table: string) => {
  if (table !== 'ai_agent_actions') throw new Error('Service role fuera del almacén de acciones');
  const call: typeof queries[number] = { filters: {} };
  queries.push(call);
  const result = () => {
    if (!call.patch) return { data: row, error: null };
    if (call.patch.status === 'executing' && !claimWins) return { data: [], error: null };
    Object.assign(row, call.patch);
    return { data: [{ id }], error: null };
  };
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn(),
    in: jest.fn().mockReturnThis(),
    update: jest.fn(),
    maybeSingle: jest.fn(async () => result()),
    then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
  };
  query.eq.mockImplementation((key: string, value: unknown) => { call.filters[key] = value; return query; });
  query.update.mockImplementation((patch: Record<string, unknown>) => { call.patch = patch; return query; });
  return query;
});
const request = (body: unknown = { actionId: id }) => new NextRequest('http://localhost/api/ai-assistant/execute-action', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

beforeEach(() => {
  jest.clearAllMocks(); queries.length = 0; claimWins = true;
  savedMessages.clear(); ownedConversation = true; customerRow = null;
  row = { id, organization_id: 120, user_id: 'autor', tool_name: 'create_customer', risk: 'medium', args: { full_name: 'Persona sintética' }, branch_id: 3, conversation_id: 'hilo', status: 'pending', expires_at: new Date(Date.now() + 600000).toISOString() };
  caps = { level: 'write_full', enabledTools: null, isAdmin: false, permissions: new Set(['crm.customers.create', 'pos.create', 'inventory.create', 'inventory.transfer', 'inventory.adjust']), activeModules: new Set(['inventory', 'pos']), bulkMaxRows: 500, undoWindowMinutes: 15 };
  jest.mocked(getServerOrgContext).mockResolvedValue({ organizationId: 120, userId: 'autor', supabase: sessionClient } as unknown as Awaited<ReturnType<typeof getServerOrgContext>>);
  jest.mocked(getServiceClient).mockReturnValue({ from: actionFrom } as unknown as ReturnType<typeof getServiceClient>);
  jest.mocked(getAssistantCapabilities).mockImplementation(async () => caps);
  jest.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 19, count: 1, resetAt: new Date() });
  jest.mocked(resolveOrgCurrency).mockResolvedValue({ code: 'USD', symbol: '$', decimals: 2, source: 'base' });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const cases: Array<[string, Record<string, unknown>]> = [
  ['create_customer', { full_name: 'Persona sintética', company_name: 'Empresa sintética' }],
  ['registrar_venta', { items: [{ product_id: 1, quantity: 2 }] }],
  ['crear_orden_compra', { supplier_id: 2, items: [{ product_id: 1, quantity: 2, unit_cost: 10 }] }],
  ['crear_traslado', { origin_branch_id: 3, dest_branch_id: 4, items: [{ product_id: 1, quantity: 2 }] }],
  ['crear_ajuste_inventario', { type: 'gain', reason: 'Conteo', items: [{ product_id: 1, quantity: 2 }] }],
  ['cargar_productos_masivo', { rows: [{ name: 'Producto sintético', price: 10 }] }],
];

test.each(cases)('propuesta persistida → HTTP confirma %s con sesión, nunca service role', async (name, args) => {
  const tool = getTool(name)!;
  const parsed = tool.parseArgs(args);
  expect(parsed).not.toBeNull();
  // Doble de persistencia de la propuesta; registro y parsers son los reales.
  Object.assign(row, { tool_name: name, risk: tool.risk, args: parsed });
  const execute = jest.spyOn(tool, 'execute').mockResolvedValue({ ok: true, message: 'Creado', entity: { type: 'prueba', id: 7 }, undo: { kind: 'prueba', payload: {} } });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ success: true, entity: { id: 7 } });
  expect(execute).toHaveBeenCalledWith(expect.objectContaining({ supabase: sessionClient, organizationId: 120, userId: 'autor', branchId: 3, conversationId: 'hilo', currency: 'USD' }), parsed);
  expect(row.status).toBe('executed');
  expect(row.undo_payload).toEqual({ kind: 'prueba', payload: {} });
  for (const call of queries) expect(call.filters).toMatchObject({ id, organization_id: 120, user_id: 'autor' });
  expect(sessionFrom).toHaveBeenCalledWith('activities');
  expect(sessionFrom).not.toHaveBeenCalledWith('ai_agent_actions');
  expect((await (await POST(request())).json()).alreadyExecuted).toBe(true);
  expect(execute).toHaveBeenCalledTimes(1);
});

test.each([{ fields: [] }, { fields: null }, { args: {} }, { userRole: 'admin' }, { organizationId: 120 }])('rechaza claves adicionales antes de acceder al almacén: %p', async (extra) => {
  expect((await POST(request({ actionId: id, ...extra }))).status).toBe(400);
  expect(actionFrom).not.toHaveBeenCalled();
});
test.each([{}, null, [], { actionId: 'no-uuid' }])('rechaza body inválido %p', async (body) => {
  expect((await POST(request(body))).status).toBe(400);
  expect(actionFrom).not.toHaveBeenCalled();
});
test('organización ajena declarada produce 403', async () => {
  expect((await POST(request({ actionId: id, organizationId: 999 }))).status).toBe(403);
  expect(actionFrom).not.toHaveBeenCalled();
});
test.each([{ organization_id: 999 }, { user_id: 'otro' }])('defensa explícita ante fila ajena %p', async (other) => {
  Object.assign(row, other);
  expect((await POST(request())).status).toBe(403);
  expect(queries.some(q => q.patch)).toBe(false);
});
test('sin sesión no consulta el cliente privilegiado', async () => {
  jest.mocked(getServerOrgContext).mockRejectedValue(new OrgContextError('Sesión requerida', 401));
  expect((await POST(request())).status).toBe(401);
  expect(getServiceClient).not.toHaveBeenCalled();
});
test.each(cases)('reevalúa permisos revocados antes de ejecutar %s', async (name, args) => {
  const tool = getTool(name)!;
  Object.assign(row, { tool_name: name, risk: tool.risk, args: tool.parseArgs(args) });
  caps.permissions.clear();
  const execute = jest.spyOn(tool, 'execute');
  expect((await POST(request())).status).toBe(403);
  expect(execute).not.toHaveBeenCalled();
  expect(row.status).toBe('rejected');
});
test('el claim perdido no ejecuta', async () => {
  claimWins = false;
  const execute = jest.spyOn(getTool('create_customer')!, 'execute');
  expect((await POST(request())).status).toBe(409);
  expect(execute).not.toHaveBeenCalled();
});
test('rechaza argumentos persistidos inválidos sin ejecutar', async () => {
  Object.assign(row, { tool_name: 'registrar_venta', risk: 'high', args: { items: [] } });
  const execute = jest.spyOn(getTool('registrar_venta')!, 'execute');
  expect((await POST(request())).status).toBe(400);
  expect(execute).not.toHaveBeenCalled();
});
test('excepción de herramienta cierra la acción como failed sin filtrar detalles', async () => {
  jest.spyOn(getTool('create_customer')!, 'execute').mockRejectedValue(new Error('detalle interno'));
  const response = await POST(request());
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain('detalle interno');
  expect(row.status).toBe('failed');
  for (const call of queries) expect(call.filters).toMatchObject({ organization_id: 120, user_id: 'autor' });
});

test.each(['nivel', 'módulo', 'lista'])('reevalúa restricción actual por %s', async (restriction) => {
  const tool = getTool('registrar_venta')!;
  Object.assign(row, { tool_name: tool.name, risk: tool.risk, args: { items: [{ product_id: 1, quantity: 1 }] } });
  if (restriction === 'nivel') caps.level = 'read';
  if (restriction === 'módulo') caps.activeModules = new Set(['inventory']);
  if (restriction === 'lista') caps.enabledTools = [];
  const execute = jest.spyOn(tool, 'execute');
  expect((await POST(request())).status).toBe(403);
  expect(execute).not.toHaveBeenCalled();
});

test.each(['no_existe', 'leer_documento'])('no ejecuta herramienta desconocida o de lectura: %s', async (name) => {
  row.tool_name = name;
  expect((await POST(request())).status).toBe(400);
  expect(queries.some(q => q.patch)).toBe(false);
});

test('caducidad actualiza solo la acción del autor y tenant', async () => {
  row.expires_at = '2020-01-01T00:00:00Z';
  expect((await POST(request())).status).toBe(409);
  expect(row.status).toBe('expired');
  for (const call of queries) expect(call.filters).toMatchObject({ id, organization_id: 120, user_id: 'autor' });
});

test('ejecución incierta no caduca ni se reabre aunque haya vencido', async () => {
  row.status = 'executing'; row.expires_at = '2020-01-01T00:00:00Z';
  expect((await POST(request())).status).toBe(409);
  expect(queries.some(q => q.patch)).toBe(false);
});

test('fallo de negocio persiste failed y el código, sin auditoría de éxito', async () => {
  jest.spyOn(getTool('create_customer')!, 'execute').mockResolvedValue({ ok: false, errorCode: 'duplicate', message: 'Ya existe' });
  expect(await (await POST(request())).json()).toMatchObject({ success: false, code: 'duplicate' });
  expect(row.status).toBe('failed');
  expect(audit).not.toHaveBeenCalled();
});

test('resultado se guarda con sesión una sola vez al confirmar y reintentar', async () => {
  jest.spyOn(getTool('create_customer')!, 'execute').mockResolvedValue({ ok: true, message: 'Cliente creado', entity: { type: 'customer', id: 'nuevo' } });
  await POST(request()); await POST(request());
  expect(savedMessages.size).toBe(1);
  expect([...savedMessages.values()][0]).toMatchObject({ organization_id: 120, conversation_id: 'hilo', role: 'assistant', action_id: id, content: expect.stringContaining('Cliente creado'), content_json: { kind: 'action_result', result: expect.objectContaining({ success: true }) } });
  expect(saveResult).toHaveBeenCalledWith(expect.objectContaining({ id: expect.stringMatching(/^[0-9a-f-]{36}$/) }), { onConflict: 'id', ignoreDuplicates: true });
  expect(conversationFilters).toHaveBeenCalledWith('organization_id', 120);
  expect(conversationFilters).toHaveBeenCalledWith('user_id', 'autor');
});

test('no persiste resultado dentro de una conversación ajena', async () => {
  ownedConversation = false;
  jest.spyOn(getTool('create_customer')!, 'execute').mockResolvedValue({ ok: true, message: 'Creado' });
  const response = await POST(request());
  expect((await response.json()).historySaved).toBe(false);
  expect(saveResult).not.toHaveBeenCalled();
});

test('cierre external: solo un cliente creado DESPUÉS de la propuesta cierra la acción (un preexistente no se vuelve «deshacible»)', async () => {
  row.created_at = '2026-09-21T10:00:00Z';
  const external = { entityType: 'customer', entityId: '22222222-2222-4222-8222-222222222222' };
  const execute = jest.spyOn(getTool('create_customer')!, 'execute');
  customerRow = { id: external.entityId, full_name: 'Cliente sintético', created_at: '2026-09-21T09:00:00Z' };
  expect((await POST(request({ actionId: id, external }))).status).toBe(404);
  expect(queries.some(q => q.patch)).toBe(false);
  customerRow = { ...customerRow, created_at: '2026-09-21T10:05:00Z' };
  expect(await (await POST(request({ actionId: id, external }))).json()).toMatchObject({ success: true, entity: { type: 'customer', id: external.entityId }, undoAvailable: true });
  expect(execute).not.toHaveBeenCalled();
  expect(row).toMatchObject({ status: 'executed', undo_payload: { kind: 'delete_customer', payload: { customer_id: external.entityId } } });
  expect(audit).toHaveBeenCalledWith(expect.objectContaining({ organization_id: 120, user_id: 'autor', metadata: expect.objectContaining({ via: 'module_form', entity_id: external.entityId }) }));
});

test('reintento repara historial fallido sin volver a ejecutar ni cerrar la acción', async () => {
  saveResult.mockResolvedValueOnce({ error: { message: 'fallo transitorio' } });
  const execute = jest.spyOn(getTool('create_customer')!, 'execute').mockResolvedValue({ ok: true, message: 'Creado' });
  expect((await (await POST(request())).json()).historySaved).toBe(false);
  expect(row.status).toBe('executed');
  const updates = queries.filter(q => q.patch).length;
  expect((await (await POST(request())).json()).historySaved).toBe(true);
  expect(execute).toHaveBeenCalledTimes(1);
  expect(queries.filter(q => q.patch)).toHaveLength(updates);
  expect(savedMessages.size).toBe(1);
});
