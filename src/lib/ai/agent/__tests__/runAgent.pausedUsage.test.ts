import type { SupabaseClient } from '@supabase/supabase-js';
import { runAgent, type AgentEvent } from '../runAgent';
import type { ToolContext, ToolDefinition, ToolPreview } from '../types';
import { openModelStream } from '../openaiAdapter';
import { resolveModel } from '../modelRouter';
import { getTool, resolveTools } from '../toolRegistry';
import { chargeAiCredits } from '@/lib/services/crm/aiCostService';
import { getServiceClient } from '@/lib/supabase/server-service';

// Solo se sustituyen los límites externos; se ejecuta el bucle real, incluido
// el break de pausa y su epílogo de cobro (regresión del return anticipado).
jest.mock('../openaiAdapter', () => ({ openModelStream: jest.fn() }));
jest.mock('../modelRouter', () => ({ resolveModel: jest.fn() }));
jest.mock('../toolRegistry', () => ({ getTool: jest.fn(), resolveTools: jest.fn() }));
jest.mock('../catalogTools', () => ({ actionFieldsFor: jest.fn().mockReturnValue([]) }));
jest.mock('@/lib/services/crm/aiCostService', () => ({ chargeAiCredits: jest.fn() }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn() }));

it('pausa una acción medium, cobra usage una sola vez y separa store privilegiado de negocio con sesión', async () => {
  jest.clearAllMocks();
  const sessionFrom = jest.fn(() => { throw new Error('El almacén de propuestas no debe usar la sesión'); });
  const session = { from: sessionFrom } as unknown as SupabaseClient;
  const single = jest.fn().mockResolvedValue({
    data: { id: 'accion-pendiente', expires_at: '2026-09-19T18:30:00Z' }, error: null,
  });
  const select = jest.fn().mockReturnValue({ single });
  const insert = jest.fn().mockReturnValue({ select });
  const serviceFrom = jest.fn().mockReturnValue({ insert });
  const service = { from: serviceFrom } as unknown as SupabaseClient;
  jest.mocked(getServiceClient).mockReturnValue(service);

  const ctx: ToolContext = {
    organizationId: 120, branchId: 9, userId: 'usuario-prueba', conversationId: 'conversacion-prueba',
    supabase: session, locale: 'es-CO', currency: 'COP', channel: 'text',
    capabilities: { level: 'write_low', enabledTools: null, permissions: new Set(['catalog.write']),
      activeModules: new Set(['inventory']), isAdmin: false, undoWindowMinutes: 15, bulkMaxRows: 500 },
  };
  const preview: ToolPreview = { title: 'Crear categoría', summary: 'Crear categoría Bebidas',
    lines: [{ label: 'Nombre', value: 'Bebidas' }], warnings: [], estimatedCredits: 0, reversible: true };
  const previewMedium = jest.fn(async (toolCtx: ToolContext) => {
    expect(toolCtx).toBe(ctx);
    expect(toolCtx.supabase).toBe(session);
    expect(toolCtx.supabase).not.toBe(service);
    return preview;
  });
  const executeMedium = jest.fn();
  const medium: ToolDefinition = {
    name: 'crear_categoria', description: 'Crear categoría', risk: 'medium',
    parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    permissions: ['catalog.write'], minLevel: 'write_low', requiredModule: 'inventory', availableInVoice: true,
    parseArgs: (raw) => raw as Record<string, unknown>, preview: previewMedium, execute: executeMedium,
  };
  const executeLow = jest.fn(async (toolCtx: ToolContext) => {
    expect(toolCtx).toBe(ctx);
    expect(toolCtx.supabase).toBe(session);
    return { ok: true, message: 'Consulta lista' };
  });
  const low: ToolDefinition = { ...medium, name: 'consultar_catalogo', risk: 'low', execute: executeLow };
  // El registro borra el tipo de argumentos a ToolDefinition<never>; mantener
  // las herramientas tipadas hasta esa frontera, igual que producción.
  const registered = [low, medium] as unknown as ReturnType<typeof resolveTools>;
  jest.mocked(resolveTools).mockReturnValue(registered);
  jest.mocked(getTool).mockImplementation((name) => registered.find((tool) => tool.name === name));
  jest.mocked(resolveModel).mockReturnValue({ model: 'modelo-configurado', provider: 'openai',
    temperature: 0.2, maxTokens: 1500, source: 'organization' });
  jest.mocked(openModelStream).mockResolvedValue({
    model: 'modelo-que-respondio',
    chunks: (async function* () {
      yield { delta: 'Revisa la propuesta.' };
      yield { toolCall: { id: 'lectura', name: low.name, arguments: '{}' } };
      yield { toolCall: { id: 'propuesta', name: medium.name, arguments: '{"name":"Bebidas"}' } };
      // Una segunda escritura del mismo stream no debe procesarse tras pausar.
      yield { toolCall: { id: 'segunda', name: medium.name, arguments: '{"name":"Otra"}' } };
      yield { usage: { promptTokens: 123, completionTokens: 45 } };
    })(),
  });
  jest.mocked(chargeAiCredits).mockResolvedValue({ credits: 3 } as Awaited<ReturnType<typeof chargeAiCredits>>);
  const events: AgentEvent[] = [];
  const result = await runAgent({ ctx, systemPrompt: 'Asistente de prueba', history: [], message: 'Crea Bebidas',
    settings: { model: null, temperature: null, maxTokens: null, systemRules: null, tone: null, language: null, overrides: {} },
    emit: (event) => { events.push(event); },
  });

  expect(result).toMatchObject({ pendingActionId: 'accion-pendiente', content: 'Revisa la propuesta.',
    model: 'modelo-que-respondio', promptTokens: 123, completionTokens: 45 });
  expect(openModelStream).toHaveBeenCalledTimes(1);
  expect(executeLow).toHaveBeenCalledTimes(1);
  expect(previewMedium).toHaveBeenCalledTimes(1);
  expect(executeMedium).not.toHaveBeenCalled();
  expect(ctx.supabase).toBe(session);
  expect(sessionFrom).not.toHaveBeenCalled();
  expect(getServiceClient).toHaveBeenCalledTimes(1);
  expect(serviceFrom).toHaveBeenCalledWith('ai_agent_actions');
  expect(insert).toHaveBeenCalledTimes(1);
  expect(insert).toHaveBeenCalledWith({ organization_id: 120, user_id: ctx.userId, branch_id: 9,
    conversation_id: ctx.conversationId, tool_name: medium.name, risk: 'medium',
    args: { name: 'Bebidas' }, preview, status: 'pending' });
  expect(select).toHaveBeenCalledWith('id, expires_at');
  expect(chargeAiCredits).toHaveBeenCalledTimes(1);
  expect(chargeAiCredits).toHaveBeenCalledWith({ orgId: 120, userId: ctx.userId, actionType: 'assistant_chat',
    model: 'modelo-que-respondio', units: 168, metadata: { prompt_tokens: 123, completion_tokens: 45,
      surface: 'header_assistant', model_source: 'organization', tools_offered: 2 } });
  expect(events.filter((event) => event.type === 'action')).toHaveLength(1);
  expect(events.filter((event) => event.type === 'usage')).toEqual([{
    type: 'usage', model: 'modelo-que-respondio', promptTokens: 123, completionTokens: 45, credits: 3,
  }]);
  expect(events.findIndex((event) => event.type === 'usage')).toBeGreaterThan(events.findIndex((event) => event.type === 'action'));
});
