import { NextRequest } from 'next/server';
import { GET } from '../route';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { loadMessages } from '@/lib/ai/agent/conversationStore';
import { checkRateLimit } from '@/lib/security/rateLimit';
jest.mock('@/lib/utils/orgContext', () => ({ getServerOrgContext: jest.fn(), ...jest.requireActual('@/lib/utils/orgContextError') }));
jest.mock('@/lib/ai/agent/conversationStore', () => ({ loadMessages: jest.fn() }));
jest.mock('@/lib/security/rateLimit', () => ({ checkRateLimit: jest.fn() }));
const id = '11111111-1111-4111-8111-111111111111';
let own: boolean;
let rows: Array<Record<string, unknown>>;
const filters: Array<[string, string, unknown]> = [];
const from = jest.fn((table: string) => {
  const q = { select: () => q, eq: (k: string, v: unknown) => { filters.push([table, k, v]); return q; },
    order: () => q, limit: async () => ({ data: rows, error: null }),
    maybeSingle: async () => ({ data: own ? { id, status: 'active' } : null, error: null }) };
  return q;
});
const read = () => GET(new NextRequest('http://localhost/api/ai-assistant/conversations/' + id), { params: Promise.resolve({ id }) });
beforeEach(() => {
  jest.clearAllMocks(); own = true; filters.length = 0;
  rows = [{ id: 'propuesta', organization_id: 120, user_id: 'autor', conversation_id: id, tool_name: 'create_customer', risk: 'medium', status: 'pending', args: { full_name: 'Persona sintética' }, preview: { title: 'Crear cliente', summary: 'Resumen', lines: [], warnings: [] }, expires_at: new Date(Date.now() + 600000).toISOString(), created_at: new Date().toISOString() }];
  jest.mocked(getServerOrgContext).mockResolvedValue({ organizationId: 120, userId: 'autor', supabase: { from } } as unknown as Awaited<ReturnType<typeof getServerOrgContext>>);
  jest.mocked(loadMessages).mockResolvedValue([]);
  jest.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 1, count: 1, resetAt: new Date() });
});
test('restaura tarjeta pendiente con campos y filtros explícitos de tenant, autor e hilo', async () => {
  const body = await (await read()).json();
  expect(body.pendingActions).toEqual([expect.objectContaining({ id: 'propuesta', title: 'Crear cliente', fields: expect.arrayContaining([expect.objectContaining({ name: 'full_name', value: 'Persona sintética' })]) })]);
  for (const pair of [['organization_id', 120], ['user_id', 'autor'], ['conversation_id', id]]) expect(filters).toContainEqual(['ai_agent_actions', ...pair]);
});
test('caducadas y ejecutadas no vuelven a ser confirmables y resultado antiguo se recupera', async () => {
  rows[0].expires_at = '2020-01-01T00:00:00Z';
  rows.push({ ...rows[0], id: 'ejecutada', status: 'executed', result: { success: true, message: 'Cliente creado' }, executed_at: new Date().toISOString() });
  const body = await (await read()).json();
  expect(body.pendingActions).toEqual([]);
  expect(body.messages).toEqual(expect.arrayContaining([expect.objectContaining({ action_id: 'ejecutada', content: expect.stringContaining('Cliente creado') })]));
});
test('no duplica resultado que ya existe como mensaje', async () => {
  rows[0].status = 'executed'; rows[0].result = { success: true, message: 'Creado' };
  jest.mocked(loadMessages).mockResolvedValue([{ id: 'resultado', action_id: 'propuesta', role: 'assistant', content: 'Creado', content_json: { kind: 'action_result' }, created_at: new Date().toISOString() }]);
  expect((await (await read()).json()).messages).toHaveLength(1);
});
test('hilo ajeno no consulta acciones ni mensajes', async () => {
  own = false;
  expect((await read()).status).toBe(404);
  expect(from).not.toHaveBeenCalledWith('ai_agent_actions');
  expect(loadMessages).not.toHaveBeenCalled();
});
