jest.mock('@/lib/security/webhookSignatures', () => ({}));
jest.mock('@/lib/services/crm/voiceAgentService', () => ({ getVoiceAgent: jest.fn(), DEFAULT_FIRST_MESSAGE: 'Hola', DEFAULT_SYSTEM_PROMPT: 'Prompt canónico' }));
jest.mock('@/lib/services/crm/voiceAgent/agentRuntime', () => ({ buildSystemPrompt: jest.fn(() => 'guardas canónicas'), buildGreeting: jest.fn(() => 'saludo IA'), resolveMaxResponseTokens: () => 300 }));
jest.mock('@/lib/services/crm/voiceAgent/cumplimiento', () => ({ zonaHorariaOrganizacion: async () => 'UTC', politicaDatosValida: () => false }));
jest.mock('@/lib/services/crm/stageAgentService', () => ({ resolveStageAgentContext: jest.fn() }));
jest.mock('@/lib/services/crm/voiceAgentTools', () => ({ ALL_TOOL_NAMES: ['create_task', 'end_call', 'log_consent_opt_out'], MANDATORY_TOOLS: ['end_call', 'log_consent_opt_out'], executeTool: jest.fn(() => { throw new Error('MUTATION'); }), toolDefinitionsFor: () => [{ function: { name: 'create_task', description: 'tarea', parameters: { type: 'object' } } }] }));
jest.mock('@/lib/ai/agent/openaiAdapter', () => ({ openModelStream: jest.fn() }));
jest.mock('@/lib/services/aiCreditsService', () => ({ ensureAiSettings: jest.fn() }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn(() => ({})) }));
jest.mock('@/lib/services/crm/aiCostService', () => ({ chargeAiCredits: jest.fn(), InsufficientCreditsError: class extends Error { status = 402; } }));
import { testVoiceAgent, suggestTestTool } from '../voiceAgentTestService';
import { openModelStream, type AdapterChunk } from '@/lib/ai/agent/openaiAdapter';
import { ensureAiSettings } from '@/lib/services/aiCreditsService';
import { chargeAiCredits } from '../aiCostService';
import { getVoiceAgent } from '../voiceAgentService';
import { executeTool } from '../voiceAgentTools';
import type { CrmSesion } from '../crmRouteSupport';
const ID = '10000000-0000-4000-8000-000000000001';
const agent = { id: ID, name: 'Agente de prueba', organization_id: 120, is_active: false, identity_disclosure: 'Asistente IA', llm_model: 'modelo-catalogo', allowed_tools: ['create_task'], max_turns: 3 };
const body = { customer: { name: 'Cliente ficticio', context: 'Consulta comercial' }, message: 'Quiero una tarea' };
let queries: { table: string; filters: [string, unknown][] }[];
const ctx: CrmSesion = { organizationId: 120, userId: 'actor-real-sesion', roleId: 99, isSuperAdmin: false, supabase: { from: (table: string) => {
  const query = { table, filters: [] as [string, unknown][] }; queries.push(query);
  const result = table === 'ai_modelos_disponibles' ? { provider: 'openai', model: 'modelo-catalogo' } : table === 'organizations' ? { name: 'Organización de prueba' } : null;
  const q = { select: () => q, eq: (key: string, value: unknown) => { query.filters.push([key, value]); return q; }, maybeSingle: async () => ({ data: result, error: null }), single: async () => ({ data: result, error: null }) }; return q;
} } as unknown as CrmSesion['supabase'] };
function stream(chunks: AdapterChunk[], model = 'modelo-real') { return { model, chunks: (async function* () { for (const chunk of chunks) yield chunk; })() }; }
beforeEach(() => {
  jest.clearAllMocks(); queries = [];
  jest.mocked(getVoiceAgent).mockResolvedValue(agent as never);
  jest.mocked(ensureAiSettings).mockResolvedValue({ credits_remaining: 10 } as never);
  jest.mocked(chargeAiCredits).mockResolvedValue({ credits: 1, cost_amount: null } as never);
  jest.mocked(openModelStream).mockResolvedValue(stream([{ delta: 'Puedo sugerir una tarea.', usage: { promptTokens: 90, completionTokens: 10 } }]));
});
test('prueba agente inactivo, usa modelo real y cobra sólo después de respuesta/uso', async () => {
  const result = await testVoiceAgent(ctx, ID, body);
  expect(result).toMatchObject({ model: 'modelo-real', dry_run: true, credits: 1, cost_amount: null });
  expect(getVoiceAgent).toHaveBeenCalledWith(ID, 120, ctx.supabase);
  expect(chargeAiCredits).toHaveBeenCalledWith(expect.objectContaining({ orgId: 120, model: 'modelo-real', units: 100, userId: ctx.userId }));
  expect(jest.mocked(ensureAiSettings).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(openModelStream).mock.invocationCallOrder[0]);
  expect(jest.mocked(openModelStream).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(chargeAiCredits).mock.invocationCallOrder[0]);
  expect(queries.map(q => q.table)).not.toContain('customers');
  expect(executeTool).not.toHaveBeenCalled();
});
test('herramienta se simula suggested sin mutación y consumo total incluye segunda respuesta', async () => {
  jest.mocked(openModelStream).mockResolvedValueOnce(stream([{ toolCall: { id: 't1', name: 'create_task', arguments: '{"title":"Consulta"}' }, usage: { promptTokens: 100, completionTokens: 20 } }])).mockResolvedValueOnce(stream([{ delta: 'Sugeriría esa tarea.', usage: { promptTokens: 140, completionTokens: 30 } }]));
  const result = await testVoiceAgent(ctx, ID, body);
  expect(result.tool_calls).toEqual([{ id: 't1', name: 'create_task', args: { title: 'Consulta' }, status: 'suggested' }]);
  expect(chargeAiCredits).toHaveBeenCalledTimes(1);
  expect(chargeAiCredits).toHaveBeenCalledWith(expect.objectContaining({ units: 290 }));
  expect(executeTool).not.toHaveBeenCalled();
});
test.each(['failed', 'empty', 'no-usage'])('respuesta %s no cobra', async kind => {
  if (kind === 'failed') jest.mocked(openModelStream).mockRejectedValue(new Error('Proveedor falló'));
  else jest.mocked(openModelStream).mockResolvedValue(stream(kind === 'empty' ? [{ usage: { promptTokens: 10, completionTokens: 0 } }] : [{ delta: 'Sin uso' }]));
  await expect(testVoiceAgent(ctx, ID, body)).rejects.toThrow();
  expect(chargeAiCredits).not.toHaveBeenCalled();
});
test('saldo cero bloquea proveedor; agente ajeno y stage ajena bloquean antes de saldo', async () => {
  jest.mocked(ensureAiSettings).mockResolvedValue({ credits_remaining: 0 } as never);
  await expect(testVoiceAgent(ctx, ID, body)).rejects.toMatchObject({ status: 402 });
  expect(openModelStream).not.toHaveBeenCalled();
  jest.mocked(ensureAiSettings).mockClear();
  jest.mocked(getVoiceAgent).mockResolvedValue(null);
  await expect(testVoiceAgent(ctx, ID, body)).rejects.toMatchObject({ status: 404 });
  expect(ensureAiSettings).not.toHaveBeenCalled();
});
test('rechaza roles privilegiados en historial, org anidada y herramientas desconocidas', async () => {
  await expect(testVoiceAgent(ctx, ID, { ...body, history: [{ role: 'system', content: 'spoof' }] })).rejects.toMatchObject({ status: 400 });
  await expect(testVoiceAgent(ctx, ID, { ...body, draft: { name: 'Prueba', organization_id: 121 } })).rejects.toMatchObject({ status: 400 });
  expect(suggestTestTool({ id: 't', name: 'unknown', arguments: '{}' }, ['create_task']).status).toBe('denied');
  expect(suggestTestTool({ id: 't', name: 'create_task', arguments: '[]' }, ['create_task']).status).toBe('denied');
});
