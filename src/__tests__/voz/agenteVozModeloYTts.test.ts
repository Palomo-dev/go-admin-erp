/**
 * Agente de voz (ConversationRelay, ws-server): modelo y TTS.
 *
 * Llamada real del 2026-09-30 (org 125, agente con `llm_model = gpt-5.6-luna`):
 *  1. Cada turno fallaba con `400 Unsupported parameter: 'max_tokens' ... Use
 *     'max_completion_tokens'` porque el handler llamaba a Chat Completions con
 *     `max_tokens` para cualquier modelo. Ahora usa el adaptador del GO
 *     Assistant (`openaiAdapter`): Responses API para gpt-5.x/6.x.
 *  2. Twilio no pudo sintetizar el saludo (error 64111). Ahora, ante el error
 *     de TTS, el ws-server cambia a la voz de respaldo declarada en el TwiML.
 *
 * El SDK de OpenAI se simula a nivel de módulo: se ejercita el adaptador real y
 * el handler real, y se comprueba lo que llegaría a la API y a Twilio.
 */

import { EventEmitter } from 'events';

// ─── SDK de OpenAI simulado ──────────────────────────────────────────────────

const responsesCreate = jest.fn();
const chatCreate = jest.fn();
jest.mock('openai', () => {
  class OpenAI {
    responses = { create: (...a: unknown[]) => responsesCreate(...a) };
    chat = { completions: { create: (...a: unknown[]) => chatCreate(...a) } };
  }
  return { __esModule: true, default: OpenAI };
});

async function* iter<T>(items: T[]): AsyncGenerator<T> {
  for (const i of items) yield i;
}

/** Stream de la Responses API con texto y, opcionalmente, una llamada a herramienta. */
function responsesStream(texts: string[], toolCall?: { call_id: string; name: string; arguments: string }) {
  const events: Array<Record<string, unknown>> = texts.map((t) => ({ type: 'response.output_text.delta', delta: t }));
  if (toolCall) events.push({ type: 'response.output_item.done', item: { type: 'function_call', ...toolCall } });
  events.push({ type: 'response.completed', response: { usage: { input_tokens: 10, output_tokens: 5 } } });
  return iter(events);
}

function chatStream(texts: string[]) {
  return iter([...texts.map((t) => ({ choices: [{ delta: { content: t } }] })), { choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } }]);
}

// ─── Dependencias del handler ────────────────────────────────────────────────

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    const q: Record<string, unknown> = {};
    Object.assign(q, {
      select: () => q,
      eq: () => q,
      update: () => q,
      insert: async () => ({ error: null }),
      maybeSingle: async () => ({
        data: { voice_agent_enabled: true, is_active: true, voice_minutes_remaining: 30, voice_agent_config: {} },
        error: null,
      }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(ok),
    });
    return { from: () => q, rpc: async () => ({ error: null }) };
  },
}));

jest.mock('@/lib/security/wsSessionToken', () => ({
  verifyWsSessionToken: () => ({ orgId: 125, agentId: 'agent-1', callId: 'vac-1', callSid: 'CA1', jti: 'j' }),
  consumeWsSessionJti: () => true,
}));

let runtimeModel = 'gpt-5.6-luna';
let setupDelay: Promise<void> = Promise.resolve();
jest.mock('@/lib/services/crm/voiceAgent/agentRuntime', () => ({
  buildRuntimeConfig: jest.fn(async () => {
    await setupDelay;
    return {
      orgId: 125,
      organizationName: 'Org 125',
      agent: { id: 'agent-1', name: 'Pedro' },
      voiceAgentCallId: 'vac-1',
      customerId: 'c1',
      opportunityId: null,
      customerName: 'Cliente de prueba',
      stage: null,
      systemPrompt: 'SYS',
      greeting: 'Hola. Le habla Pedro.',
      model: runtimeModel,
      temperature: 0.7,
      maxTurns: 20,
      maxDurationSeconds: 600,
      maxResponseTokens: 150,
      allowedTools: ['book_meeting'],
      toolDefinitions: [
        { type: 'function', function: { name: 'book_meeting', description: 'Agenda', parameters: { type: 'object', properties: {}, required: [] } } },
      ],
      actionPolicy: 'auto',
      voice: { ttsProvider: 'ElevenLabs', voice: 'O00tZiHVGzUDE9eqys2a-flash_v2_5', source: 'voices_table', voiceRowId: 'v', isCloned: false },
      consentMessage: '',
      recordingEnabled: false,
    };
  }),
  persistConversation: jest.fn(async () => undefined),
}));

const executeCrmTool = jest.fn();
jest.mock('@/lib/services/crm/voiceAgentTools', () => ({ executeTool: (...a: unknown[]) => executeCrmTool(...a) }));

import { handleConversationRelayConnection } from '@/lib/services/integrations/twilio/voiceAgent/conversationRelayHandler';
import { responsesParamsFor, usesResponsesApi, openModelStream, EMERGENCY_MODEL } from '@/lib/ai/agent/openaiAdapter';

// ─── WebSocket simulado ──────────────────────────────────────────────────────

/** Conexiones abiertas: se cierran al final de cada caso (el vigilante de silencio arma temporizadores). */
const abiertas: FakeWs[] = [];

class FakeWs extends EventEmitter {
  constructor() {
    super();
    abiertas.push(this);
  }
  readyState = 1;
  sent: Array<Record<string, unknown>> = [];
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
  }
  texts() {
    return this.sent.filter((m) => m.type === 'text');
  }
}

/** Entrega un mensaje y espera a que el handler async termine. */
async function deliver(ws: FakeWs, msg: Record<string, unknown>) {
  const listeners = ws.listeners('message') as Array<(d: Buffer) => Promise<void>>;
  await Promise.all(listeners.map((l) => l(Buffer.from(JSON.stringify(msg)))));
}

function setupMsg(extra: Record<string, string> = {}) {
  return { type: 'setup', callSid: 'CA1', from: '+570000', to: '+571111', customParameters: { token: 't', agentId: 'agent-1', ...extra } };
}

beforeAll(() => {
  process.env.OPENAI_API_KEY = 'sk-test';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
});

beforeEach(() => {
  responsesCreate.mockReset();
  chatCreate.mockReset();
  executeCrmTool.mockReset();
  runtimeModel = 'gpt-5.6-luna';
  setupDelay = Promise.resolve();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(async () => {
  for (const ws of abiertas.splice(0)) {
    ws.readyState = 3;
    ws.emit('close');
  }
  await new Promise((r) => setImmediate(r));
  jest.restoreAllMocks();
});

// ─── 1. Parámetros por modelo ────────────────────────────────────────────────

describe('selección de endpoint y parámetros por modelo', () => {
  test('gpt-5.x y gpt-6.x van por la Responses API; gpt-4o por Chat Completions', () => {
    expect(usesResponsesApi('gpt-5.6-luna')).toBe(true);
    expect(usesResponsesApi('gpt-6.1')).toBe(true);
    expect(usesResponsesApi('gpt-5-mini')).toBe(true);
    expect(usesResponsesApi('gpt-4o')).toBe(false);
    expect(usesResponsesApi('gpt-4o-mini')).toBe(false);
  });

  test('gpt-5.1+ / 6.x: sin razonamiento y con temperatura', () => {
    expect(responsesParamsFor('gpt-5.6-luna', 0.7)).toEqual({ reasoning: { effort: 'none' }, temperature: 0.7 });
    expect(responsesParamsFor('gpt-6.0', 0.3)).toEqual({ reasoning: { effort: 'none' }, temperature: 0.3 });
  });

  test('gpt-5 / gpt-5-mini (anteriores a 5.1): `minimal` y SIN temperatura', () => {
    expect(responsesParamsFor('gpt-5', 0.7)).toEqual({ reasoning: { effort: 'minimal' } });
    expect(responsesParamsFor('gpt-5-mini', 0.7)).toEqual({ reasoning: { effort: 'minimal' } });
  });

  test('gpt-5-pro: ni reasoning ni temperatura', () => {
    expect(responsesParamsFor('gpt-5-pro', 0.7)).toEqual({});
  });

  test('gpt-5.6-luna: la petición lleva max_output_tokens, nunca max_tokens', async () => {
    responsesCreate.mockResolvedValue(responsesStream(['Hola.']));
    const s = await openModelStream({ model: 'gpt-5.6-luna', messages: [{ role: 'user', content: 'hola' }], tools: [], temperature: 0.7, maxTokens: 150 });
    for await (const _ of s.chunks) void _;
    const body = responsesCreate.mock.calls[0][0];
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('max_completion_tokens');
    expect(body.max_output_tokens).toBe(150);
    expect(body.reasoning).toEqual({ effort: 'none' });
    expect(body.temperature).toBe(0.7);
    expect(body.stream).toBe(true);
    expect(chatCreate).not.toHaveBeenCalled();
  });

  test('gpt-5-mini: no se envía temperature', async () => {
    responsesCreate.mockResolvedValue(responsesStream(['Hola.']));
    await openModelStream({ model: 'gpt-5-mini', messages: [{ role: 'user', content: 'hola' }], tools: [], temperature: 0.7, maxTokens: 150 });
    const body = responsesCreate.mock.calls[0][0];
    expect(body).not.toHaveProperty('temperature');
    expect(body.reasoning).toEqual({ effort: 'minimal' });
  });

  test('gpt-4o: Chat Completions con max_tokens y temperature', async () => {
    chatCreate.mockResolvedValue(chatStream(['Hola.']));
    await openModelStream({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hola' }], tools: [], temperature: 0.4, maxTokens: 120 });
    const body = chatCreate.mock.calls[0][0];
    expect(body.max_tokens).toBe(120);
    expect(body.temperature).toBe(0.4);
    expect(responsesCreate).not.toHaveBeenCalled();
  });
});

// ─── 2. Handler: streaming, herramientas y respaldo ─────────────────────────

describe('handler de ConversationRelay con gpt-5.6-luna', () => {
  async function conectar(extra: Record<string, string> = {}) {
    const ws = new FakeWs();
    handleConversationRelayConnection(ws as never, null);
    await deliver(ws, setupMsg(extra));
    return ws;
  }

  test('el turno va por la Responses API (sin max_tokens) y se transmite por cláusulas con last:true al final', async () => {
    responsesCreate.mockResolvedValue(responsesStream(['Claro, ', 'con gusto. ', 'Le agendo ', 'mañana.']));
    const ws = await conectar();
    await deliver(ws, { type: 'prompt', voicePrompt: 'Quiero una cita' });

    expect(chatCreate).not.toHaveBeenCalled();
    const body = responsesCreate.mock.calls[0][0];
    expect(body.model).toBe('gpt-5.6-luna');
    expect(body).not.toHaveProperty('max_tokens');
    expect(body.max_output_tokens).toBe(150);
    expect(body.reasoning).toEqual({ effort: 'none' });
    expect(body.instructions).toBe('SYS');
    expect(body.tools.map((t: { name: string }) => t.name)).toEqual(['book_meeting']);

    const texts = ws.texts();
    // Streaming: más de un trozo, y solo el último cierra la frase.
    expect(texts.length).toBeGreaterThan(1);
    expect(texts.slice(0, -1).every((t) => t.last === false)).toBe(true);
    expect(texts[texts.length - 1].last).toBe(true);
    expect(texts.map((t) => t.token).join('')).toBe('Claro, con gusto. Le agendo mañana.');
    expect(JSON.stringify(texts)).not.toContain('Disculpe');
  });

  test('frase que termina en puntuación: se cierra con last:true aunque el resto esté vacío', async () => {
    responsesCreate.mockResolvedValue(responsesStream(['Perfecto. ']));
    const ws = await conectar();
    await deliver(ws, { type: 'prompt', voicePrompt: 'ok' });
    const texts = ws.texts();
    expect(texts[texts.length - 1]).toEqual({ type: 'text', token: '', last: true });
  });

  test('tool calling: ejecuta la herramienta y la respuesta posterior también va en streaming por la Responses API', async () => {
    responsesCreate
      .mockResolvedValueOnce(responsesStream([], { call_id: 'call_1', name: 'book_meeting', arguments: '{"when":"mañana"}' }))
      .mockResolvedValueOnce(responsesStream(['Listo, ', 'quedó agendada.']));
    executeCrmTool.mockResolvedValue({ success: true, data: { id: 'm1' } });

    const ws = await conectar();
    await deliver(ws, { type: 'prompt', voicePrompt: 'Agéndeme mañana' });

    expect(executeCrmTool).toHaveBeenCalledWith('book_meeting', { when: 'mañana' }, expect.objectContaining({ orgId: 125 }), ['book_meeting']);
    expect(responsesCreate).toHaveBeenCalledTimes(2);
    const segundo = responsesCreate.mock.calls[1][0];
    expect(segundo).not.toHaveProperty('max_tokens');
    // El historial lleva la llamada y su resultado en el formato de la Responses API.
    expect(segundo.input).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'function_call', call_id: 'call_1', name: 'book_meeting' }),
        expect.objectContaining({ type: 'function_call_output', call_id: 'call_1' }),
      ])
    );
    expect(ws.texts().map((t) => t.token).join('')).toBe('Listo, quedó agendada.');
    expect(chatCreate).not.toHaveBeenCalled();
  });

  test('si el modelo configurado falla, responde EMERGENCY_MODEL y no se dice la frase de error', async () => {
    responsesCreate.mockRejectedValue(Object.assign(new Error('400 model not found'), { status: 400 }));
    chatCreate.mockResolvedValue(chatStream(['Con gusto le ayudo.']));
    const errSpy = console.error as jest.Mock;

    const ws = await conectar();
    await deliver(ws, { type: 'prompt', voicePrompt: 'Hola' });

    expect(chatCreate).toHaveBeenCalledTimes(1);
    expect(chatCreate.mock.calls[0][0].model).toBe(EMERGENCY_MODEL);
    expect(ws.texts().map((t) => t.token).join('')).toBe('Con gusto le ayudo.');
    expect(JSON.stringify(ws.texts())).not.toContain('Disculpe');
    // Queda en el log con el prefijo del servidor de voz.
    expect(errSpy.mock.calls.some((c) => String(c[0]).startsWith('[CR] [CA1]') && String(c[0]).includes(EMERGENCY_MODEL))).toBe(true);
  });

  test('si fallan el modelo y el respaldo, se dice la frase de error', async () => {
    responsesCreate.mockRejectedValue(new Error('400'));
    chatCreate.mockRejectedValue(new Error('500'));
    const ws = await conectar();
    await deliver(ws, { type: 'prompt', voicePrompt: 'Hola' });
    expect(ws.texts().pop()?.token).toMatch(/^Disculpe, tuve un problema/);
  });

  test('con un modelo legacy (gpt-4o) sigue yendo por Chat Completions con max_tokens', async () => {
    runtimeModel = 'gpt-4o';
    chatCreate.mockResolvedValue(chatStream(['Hola.']));
    const ws = await conectar();
    await deliver(ws, { type: 'prompt', voicePrompt: 'Hola' });
    expect(responsesCreate).not.toHaveBeenCalled();
    expect(chatCreate.mock.calls[0][0]).toMatchObject({ model: 'gpt-4o', max_tokens: 150, temperature: 0.7 });
  });
});

// ─── 3. Handler: respaldo de TTS ante 64111 ──────────────────────────────────

describe('respaldo de TTS ante el error 64111 de Twilio', () => {
  const ERROR_64111 = {
    type: 'error',
    description: 'Error converting tokens to speech, code: 64111, error: , tokens: Hola. Le habla Pedro, ...',
  };

  test('error del saludo después del setup: cambia a la voz de respaldo y repite el saludo', async () => {
    const ws = new FakeWs();
    handleConversationRelayConnection(ws as never, null);
    await deliver(ws, setupMsg({ ttsFallbackLanguage: 'es-US' }));
    await deliver(ws, ERROR_64111);

    expect(ws.sent).toContainEqual({ type: 'language', ttsLanguage: 'es-US' });
    const idx = ws.sent.findIndex((m) => m.type === 'language');
    expect(ws.sent[idx + 1]).toEqual({ type: 'text', token: 'Hola. Le habla Pedro.', last: true });
  });

  test('error del saludo MIENTRAS el setup lee la base: el saludo se repite al terminar el setup', async () => {
    let liberar!: () => void;
    setupDelay = new Promise<void>((r) => (liberar = r));
    const ws = new FakeWs();
    handleConversationRelayConnection(ws as never, null);
    const listeners = ws.listeners('message') as Array<(d: Buffer) => Promise<void>>;
    const setup = listeners[0](Buffer.from(JSON.stringify(setupMsg({ ttsFallbackLanguage: 'es-US' }))));
    await deliver(ws, ERROR_64111);
    expect(ws.sent).toEqual([{ type: 'language', ttsLanguage: 'es-US' }]);
    liberar();
    await setup;
    expect(ws.sent[1]).toEqual({ type: 'text', token: 'Hola. Le habla Pedro.', last: true });
  });

  test('un segundo error no vuelve a cambiar (sin bucle)', async () => {
    const ws = new FakeWs();
    handleConversationRelayConnection(ws as never, null);
    await deliver(ws, setupMsg({ ttsFallbackLanguage: 'es-US' }));
    await deliver(ws, ERROR_64111);
    await deliver(ws, ERROR_64111);
    expect(ws.sent.filter((m) => m.type === 'language')).toHaveLength(1);
  });

  test('sin respaldo declarado en el TwiML: solo se registra, no se manda nada', async () => {
    const ws = new FakeWs();
    handleConversationRelayConnection(ws as never, null);
    await deliver(ws, setupMsg());
    const antes = ws.sent.length;
    await deliver(ws, ERROR_64111);
    expect(ws.sent.length).toBe(antes);
    expect((console.error as jest.Mock).mock.calls.some((c) => String(c[0]).includes('sin voz de respaldo'))).toBe(true);
  });

  test('un error que no es de TTS no cambia la voz', async () => {
    const ws = new FakeWs();
    handleConversationRelayConnection(ws as never, null);
    await deliver(ws, setupMsg({ ttsFallbackLanguage: 'es-US' }));
    await deliver(ws, { type: 'error', description: 'Invalid message received, code: 64105' });
    expect(ws.sent.some((m) => m.type === 'language')).toBe(false);
  });
});

// ─── 4. Latencia por turno e interrupciones (2026-10-07) ─────────────────────

describe('turnos: streaming por token e interrupciones', () => {
  /** Stream que entrega el primer token y se detiene hasta `soltar()`. */
  function streamControlado(primero: string, resto: string[]) {
    let soltar!: () => void;
    const espera = new Promise<void>((r) => (soltar = r));
    async function* gen(): AsyncGenerator<Record<string, unknown>> {
      yield { type: 'response.output_text.delta', delta: primero };
      await espera;
      for (const t of resto) yield { type: 'response.output_text.delta', delta: t };
      yield { type: 'response.completed', response: { usage: { input_tokens: 1, output_tokens: 1 } } };
    }
    return { stream: gen(), soltar };
  }

  async function conectar() {
    const ws = new FakeWs();
    handleConversationRelayConnection(ws as never, null);
    await deliver(ws, setupMsg());
    return ws;
  }

  /** Entrega un mensaje SIN esperar a que el handler termine. */
  function enviar(ws: FakeWs, msg: Record<string, unknown>): Promise<void> {
    const [l] = ws.listeners('message') as Array<(d: Buffer) => Promise<void>>;
    return l(Buffer.from(JSON.stringify(msg)));
  }
  const tick = () => new Promise((r) => setImmediate(r));

  test('cada token sale hacia Twilio en cuanto llega, aunque la frase no tenga comas', async () => {
    const c = streamControlado('¿Tiene ', ['dos ', 'minutos?']);
    responsesCreate.mockResolvedValueOnce(c.stream);
    const ws = await conectar();
    const turno = enviar(ws, { type: 'prompt', voicePrompt: 'Sí' });
    await tick();
    // Antes de que el modelo termine la frase, el primer token ya está en Twilio.
    expect(ws.texts()).toEqual([{ type: 'text', token: '¿Tiene ', last: false }]);
    c.soltar();
    await turno;
    expect(ws.texts()).toEqual([
      { type: 'text', token: '¿Tiene ', last: false },
      { type: 'text', token: 'dos ', last: false },
      { type: 'text', token: 'minutos?', last: false },
      { type: 'text', token: '', last: true },
    ]);
  });

  test('interrupción a mitad de la respuesta: deja de hablar y el historial guarda solo lo que sonó', async () => {
    const c = streamControlado('Claro, ', ['le cuento ', 'todo el plan.']);
    responsesCreate.mockResolvedValueOnce(c.stream).mockResolvedValueOnce(responsesStream(['Dígame.']));
    const ws = await conectar();
    const turno = enviar(ws, { type: 'prompt', voicePrompt: 'Cuénteme' });
    await tick();
    await deliver(ws, { type: 'interrupt', utteranceUntilInterrupt: 'Claro,', durationUntilInterruptMs: 400 });
    c.soltar();
    await turno;

    // Nada de lo generado tras la interrupción llega a Twilio, ni un `last:true` que reabra la frase.
    expect(ws.texts()).toEqual([{ type: 'text', token: 'Claro, ', last: false }]);

    await deliver(ws, { type: 'prompt', voicePrompt: 'Espere, ¿quién habla?' });
    const input = JSON.stringify(responsesCreate.mock.calls[1][0].input);
    expect(input).toContain('Claro,');
    expect(input).not.toContain('le cuento');
    // Orden del historial: lo dicho va antes de la nueva pregunta.
    expect(input.indexOf('Claro,')).toBeLessThan(input.indexOf('quién habla'));
  });

  test('un prompt nuevo mientras el modelo aún habla corta el turno anterior', async () => {
    const c = streamControlado('Le explico ', ['con calma ', 'todo.']);
    responsesCreate.mockResolvedValueOnce(c.stream).mockResolvedValueOnce(responsesStream(['Perfecto.']));
    const ws = await conectar();
    const primero = enviar(ws, { type: 'prompt', voicePrompt: 'Hola' });
    await tick();
    await deliver(ws, { type: 'prompt', voicePrompt: 'No tengo tiempo' });
    c.soltar();
    await primero;
    const tokens = ws.texts().map((t) => t.token);
    expect(tokens).not.toContain('con calma ');
    expect(tokens).toContain('Perfecto.');
  });

  test('interrupción de una respuesta ya terminada: el último mensaje del asistente se recorta', async () => {
    responsesCreate
      .mockResolvedValueOnce(responsesStream(['Le llamo ', 'para contarle ', 'del software.']))
      .mockResolvedValueOnce(responsesStream(['Sí, dígame.']));
    const ws = await conectar();
    await deliver(ws, { type: 'prompt', voicePrompt: 'Aló' });
    await deliver(ws, { type: 'interrupt', utteranceUntilInterrupt: 'Le llamo para' });
    await deliver(ws, { type: 'prompt', voicePrompt: 'Perdón, ¿qué?' });
    const input = JSON.stringify(responsesCreate.mock.calls[1][0].input);
    expect(input).toContain('Le llamo para');
    expect(input).not.toContain('del software');
  });
});
