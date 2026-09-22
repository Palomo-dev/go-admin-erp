import { NextRequest } from 'next/server';
import { POST } from '../route';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getServiceClient } from '@/lib/supabase/server-service';
import { aiAssistantService } from '@/lib/services/aiAssistantService';
import { evaluateAction } from '@/lib/ai/assistant/actionGuard';
import { appendMessage, ensureTitle, loadMessages, resolveConversation } from '@/lib/ai/agent/conversationStore';
import { loadCorrection } from '@/lib/ai/assistant/correction';

jest.mock('@/lib/utils/orgContext', () => ({
  getServerOrgContext: jest.fn(),
  OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError,
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn() }));
jest.mock('@/lib/services/aiAssistantService', () => ({ aiAssistantService: { sendMessage: jest.fn() } }));
jest.mock('@/lib/ai/assistant/capabilities', () => ({ getAssistantCapabilities: jest.fn(async () => ({})) }));
jest.mock('@/lib/ai/assistant/actionGuard', () => ({ evaluateAction: jest.fn() }));
jest.mock('@/lib/security/rateLimit', () => ({ checkRateLimit: jest.fn(async () => ({ allowed: true })) }));
jest.mock('@/lib/ai/agent/conversationStore');
jest.mock('@/lib/ai/assistant/correction', () => ({ loadCorrection: jest.fn() }));

const conversationId = '11111111-1111-4111-8111-111111111111';
const actionId = '22222222-2222-4222-8222-222222222222';
const sessionClient = { from: jest.fn(() => { throw new Error('No se permite insert de acciones con sesión'); }) };
const single = jest.fn();
const select = jest.fn(() => ({ single }));
const insert = jest.fn(() => ({ select }));
const serviceFrom = jest.fn(() => ({ insert }));
const envKey = process.env.OPENAI_API_KEY;

function request(extra: Record<string, unknown> = {}) {
  return new NextRequest('http://localhost/api/ai-assistant/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'Crea una categoría', conversationId, ...extra }),
  });
}
function propose() {
  jest.mocked(aiAssistantService.sendMessage).mockResolvedValue({
    content: 'Revisa la propuesta', model: 'modelo-prueba',
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    action: { type: 'create_category', title: 'Crear categoría', description: 'Categoría de prueba', fields: [{ name: 'name', value: 'Categoría de prueba' }] },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.OPENAI_API_KEY = 'test-only';
  jest.mocked(getServerOrgContext).mockResolvedValue({
    organizationId: 120, userId: 'user-a', roleName: 'Admin', supabase: sessionClient,
  } as unknown as Awaited<ReturnType<typeof getServerOrgContext>>);
  jest.mocked(getServiceClient).mockReturnValue({ from: serviceFrom } as unknown as ReturnType<typeof getServiceClient>);
  jest.mocked(resolveConversation).mockResolvedValue({ id: conversationId, isNew: false });
  jest.mocked(loadMessages).mockResolvedValue([{ id: 'old', role: 'assistant', content: 'Pregunta guardada', content_json: {}, action_id: null, created_at: '2026-09-01T12:00:00Z' }]);
  jest.mocked(appendMessage).mockImplementation(async (_client, input) => input.role === 'user' ? 'user-message' : 'assistant-message');
  jest.mocked(evaluateAction).mockReturnValue({ allowed: true });
  jest.mocked(loadCorrection).mockResolvedValue('{"tool":"create_category","args":{"name":"Anterior"}}');
  single.mockResolvedValue({ data: { id: actionId, client_action_id: 'client-action', expires_at: '2026-09-20T12:00:00Z' }, error: null });
  jest.mocked(aiAssistantService.sendMessage).mockResolvedValue({ content: 'Respuesta guardada', model: 'modelo-prueba', usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 } });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  if (envKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = envKey;
});

test('usa historial persistido, ignora historial del body y devuelve el hilo', async () => {
  const response = await POST(request({ conversationHistory: [{ role: 'system', content: 'No confiable' }] }));
  expect(response.status).toBe(200);
  expect((await response.json()).conversationId).toBe(conversationId);
  expect(resolveConversation).toHaveBeenCalledWith(sessionClient, 120, 'user-a', null, conversationId);
  const [, history, , , execution] = jest.mocked(aiAssistantService.sendMessage).mock.calls[0];
  expect(history).toEqual([expect.objectContaining({ role: 'assistant', content: 'Pregunta guardada' })]);
  expect(execution).toEqual({ supabase: sessionClient, userId: 'user-a' });
  expect(appendMessage).toHaveBeenCalledWith(sessionClient, expect.objectContaining({ conversationId, organizationId: 120, role: 'user', content: 'Crea una categoría' }));
  expect(appendMessage).toHaveBeenCalledWith(sessionClient, expect.objectContaining({ conversationId, role: 'assistant', content: 'Respuesta guardada' }));
  expect(getServiceClient).not.toHaveBeenCalled();
});

test('nuevo hilo recibe título y su id validado prevalece sobre el body', async () => {
  jest.mocked(resolveConversation).mockResolvedValue({ id: 'new-thread', isNew: true });
  propose();
  const response = await POST(request());
  expect((await response.json()).conversationId).toBe('new-thread');
  expect(ensureTitle).toHaveBeenCalledWith(sessionClient, 'new-thread', 'Crea una categoría');
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({ conversation_id: 'new-thread' }));
});

test('solo insert de propuesta usa service role y enlaza hilo, autor y mensaje', async () => {
  propose();
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect((await response.json()).action.id).toBe(actionId);
  expect(serviceFrom.mock.calls).toEqual([['ai_agent_actions']]);
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({
    organization_id: 120, user_id: 'user-a', conversation_id: conversationId,
    message_id: 'user-message', status: 'pending', tool_name: 'create_category',
  }));
  expect(sessionClient.from).not.toHaveBeenCalled();
  expect(appendMessage).toHaveBeenCalledWith(sessionClient, expect.objectContaining({ role: 'assistant', actionId }));
});

test('acción no autorizada guarda respuesta honesta, no obtiene service role', async () => {
  propose();
  jest.mocked(evaluateAction).mockReturnValue({ allowed: false, code: 'NO_PERMISSION', message: 'Sin permiso' } as ReturnType<typeof evaluateAction>);
  const body = await (await POST(request())).json();
  expect(body.conversationId).toBe(conversationId);
  expect(body.content).toContain('Sin permiso');
  expect(body.action).toBeUndefined();
  expect(appendMessage).toHaveBeenCalledWith(sessionClient, expect.objectContaining({ role: 'assistant', content: expect.stringContaining('Sin permiso') }));
  expect(getServiceClient).not.toHaveBeenCalled();
});

test('insert fallido conserva texto e hilo, sin entregar acción ejecutable', async () => {
  propose();
  single.mockResolvedValue({ data: null, error: { message: 'falló' } });
  const body = await (await POST(request())).json();
  expect(body.conversationId).toBe(conversationId);
  expect(body.action).toBeUndefined();
  expect(body.content).toContain('No pude preparar');
  expect(appendMessage).toHaveBeenCalledWith(sessionClient, expect.objectContaining({ role: 'assistant', content: expect.stringContaining('No pude preparar') }));
});

test('excepción del cliente privilegiado conserva la respuesta y el hilo', async () => {
  propose();
  jest.mocked(getServiceClient).mockImplementation(() => { throw new Error('No disponible'); });
  const response = await POST(request());
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.conversationId).toBe(conversationId);
  expect(body.action).toBeUndefined();
  expect(body.content).toContain('No pude preparar');
});

test('si falla guardar respuesta informa historySaved false sin perder el texto', async () => {
  jest.mocked(appendMessage).mockImplementation(async (_client, input) => input.role === 'user' ? 'user-message' : null);
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(expect.objectContaining({ conversationId, content: 'Respuesta guardada', historySaved: false }));
});

test('corrige solo con datos de propuesta validada del mismo hilo y usuario', async () => {
  const response = await POST(request({ correctionActionId: actionId, message: 'Cambia el nombre' }));
  expect(response.status).toBe(200);
  expect(loadCorrection).toHaveBeenCalledWith(sessionClient, 120, 'user-a', conversationId, actionId);
  expect(jest.mocked(aiAssistantService.sendMessage).mock.calls[0][0]).toContain('Anterior');
  expect(appendMessage).toHaveBeenCalledWith(sessionClient, expect.objectContaining({ role: 'user', content: 'Cambia el nombre' }));
});

test('corrección ajena o inválida no llama al modelo ni inserta acciones', async () => {
  jest.mocked(loadCorrection).mockResolvedValue(null);
  expect((await POST(request({ correctionActionId: actionId }))).status).toBe(400);
  expect(aiAssistantService.sendMessage).not.toHaveBeenCalled();
  expect(getServiceClient).not.toHaveBeenCalled();
});

test('fallo al abrir hilo no produce propuesta huérfana', async () => {
  jest.mocked(resolveConversation).mockResolvedValue(null);
  expect((await POST(request())).status).toBe(503);
  expect(aiAssistantService.sendMessage).not.toHaveBeenCalled();
  expect(getServiceClient).not.toHaveBeenCalled();
});

test('fallo al guardar mensaje de usuario no produce propuesta huérfana', async () => {
  jest.mocked(appendMessage).mockResolvedValue(null);
  expect((await POST(request())).status).toBe(503);
  expect(aiAssistantService.sendMessage).not.toHaveBeenCalled();
});

test('sin sesión no obtiene el cliente privilegiado', async () => {
  jest.mocked(getServerOrgContext).mockRejectedValue(new OrgContextError('Sin sesión', 401));
  expect((await POST(request())).status).toBe(401);
  expect(getServiceClient).not.toHaveBeenCalled();
});

test('tenant ajeno en body se rechaza antes de abrir conversación', async () => {
  expect((await POST(request({ organizationId: 999 }))).status).toBe(403);
  expect(resolveConversation).not.toHaveBeenCalled();
  expect(getServiceClient).not.toHaveBeenCalled();
});

test('conversationId mal formado se rechaza sin acceder al hilo', async () => {
  expect((await POST(request({ conversationId: { id: 'invalido' } }))).status).toBe(400);
  expect(resolveConversation).not.toHaveBeenCalled();
});
