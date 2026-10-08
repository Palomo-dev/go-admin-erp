/**
 * Cierre de la llamada del agente de voz (decisión del dueño, 2026-10-07).
 *
 * Llamada real de prueba (org 125, `voice_agent_calls` 6f7d4e15): el cliente
 * dijo «No, todo funciona perfecto» y el modelo llamó `log_objection` y
 * `end_call` en el mismo turno: la llamada se cortó en 3 s, SIN despedida, y
 * el agente se rindió a la primera objeción. Aquí se ejercita el handler real
 * de ConversationRelay con el SDK de OpenAI simulado:
 *
 *  1. Despedida forzada antes de `end_call` y espera a que termine de sonar.
 *  2. Tope de UN reintento ante el desinterés.
 *  3. Bajas (Ley 2300 / 1581): sin reintento, la ruta de siempre.
 *  4. Oportunidad perdida solo con desinterés definitivo (la decisión fina de
 *     venta/pipeline está en `crm/__tests__/perdidaPorDesinteres.test.ts`).
 */

import { EventEmitter } from 'events';

const responsesCreate = jest.fn();
jest.mock('openai', () => {
  class OpenAI {
    responses = { create: (...a: unknown[]) => responsesCreate(...a) };
    chat = { completions: { create: jest.fn() } };
  }
  return { __esModule: true, default: OpenAI };
});

async function* iter<T>(items: T[]): AsyncGenerator<T> {
  for (const i of items) yield i;
}

type LlamadaHerramienta = { name: string; args?: Record<string, unknown> };

/** Turno del modelo (Responses API): texto y, opcionalmente, varias herramientas. */
function turno(texts: string[], tools: LlamadaHerramienta[] = []) {
  const events: Array<Record<string, unknown>> = texts.map((t) => ({ type: 'response.output_text.delta', delta: t }));
  tools.forEach((t, i) =>
    events.push({
      type: 'response.output_item.done',
      item: { type: 'function_call', call_id: `call_${t.name}_${i}_${Math.random()}`, name: t.name, arguments: JSON.stringify(t.args ?? {}) },
    })
  );
  events.push({ type: 'response.completed', response: { usage: { input_tokens: 10, output_tokens: 5 } } });
  return iter(events);
}

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

const HERRAMIENTAS = ['get_customer_context', 'log_objection', 'schedule_callback', 'log_consent_opt_out', 'end_call'];
let despedidaAgente = 'Entiendo, muchas gracias por su tiempo. Que tenga un buen día.';

jest.mock('@/lib/services/crm/voiceAgent/agentRuntime', () => ({
  buildRuntimeConfig: jest.fn(async () => ({
    orgId: 125,
    organizationName: 'Org 125',
    agent: { id: 'agent-1', name: 'Pedro' },
    voiceAgentCallId: 'vac-1',
    customerId: 'c1',
    opportunityId: 'opp-1',
    customerName: 'Prueba',
    stage: null,
    systemPrompt: 'SYS',
    greeting: 'Hola Prueba. Le habla Pedro.',
    model: 'gpt-5.6-luna',
    temperature: 0.7,
    maxTurns: 20,
    maxDurationSeconds: 600,
    maxResponseTokens: 150,
    allowedTools: HERRAMIENTAS,
    toolDefinitions: HERRAMIENTAS.map((name) => ({
      type: 'function',
      function: { name, description: name, parameters: { type: 'object', properties: {}, required: [] } },
    })),
    actionPolicy: 'suggest',
    voice: { ttsProvider: 'ElevenLabs', voice: 'v-flash_v2_5', source: 'voices_table', voiceRowId: 'v', isCloned: false },
    consentMessage: '',
    recordingEnabled: false,
    despedida: despedidaAgente,
    objetivo: 'book_meeting',
  })),
  persistConversation: jest.fn(async () => undefined),
}));

/** Herramientas del CRM simuladas con la forma real de sus resultados. */
const executeCrmTool = jest.fn(async (name: string, args: Record<string, unknown>) => {
  switch (name) {
    case 'log_objection':
      return { success: true, data: { objection: args.objection, tipo: args.tipo } };
    case 'log_consent_opt_out':
      return {
        success: true,
        data: { channel: 'voice', opted_out: true },
        say: 'Entendido, no volveremos a llamarle. Queda registrado. Gracias por su tiempo.',
      };
    case 'end_call':
      return { success: true, data: { end: true } };
    default:
      return { success: true, data: {} };
  }
});
jest.mock('@/lib/services/crm/voiceAgentTools', () => ({
  executeTool: (...a: [string, Record<string, unknown>]) => executeCrmTool(...a),
}));

const marcarPerdida = jest.fn<Promise<{ aplicada: boolean; stageId: string }>, unknown[]>(async () => ({ aplicada: true, stageId: 'st-lost' }));
jest.mock('@/lib/services/crm/voiceAgent/perdidaPorDesinteres', () => ({
  marcarPerdidaPorDesinteres: (...a: unknown[]) => marcarPerdida(...a),
}));

import { handleConversationRelayConnection } from '@/lib/services/integrations/twilio/voiceAgent/conversationRelayHandler';
import {
  ControlCierre,
  DESPEDIDA_POR_DEFECTO,
  MENSAJE_EXIGIR_REINTENTO,
  clasificarObjecion,
  despedidaDelAgente,
  esDespedida,
  pideNoSerLlamado,
} from '@/lib/services/crm/voiceAgent/cierreLlamada';

// ─── WebSocket simulado ──────────────────────────────────────────────────────

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
  /** Frases completas que llegaron al TTS (los trozos se unen hasta `last:true`). */
  frases(): string[] {
    const out: string[] = [];
    let actual = '';
    for (const m of this.sent) {
      if (m.type !== 'text') continue;
      actual += String(m.token);
      if (m.last) {
        if (actual.trim()) out.push(actual.trim());
        actual = '';
      }
    }
    return out;
  }
  colgo(): boolean {
    return this.sent.some((m) => m.type === 'end');
  }
}

function deliver(ws: FakeWs, msg: Record<string, unknown>): Promise<void> {
  const listeners = ws.listeners('message') as Array<(d: Buffer) => Promise<void>>;
  return Promise.all(listeners.map((l) => l(Buffer.from(JSON.stringify(msg))))).then(() => undefined);
}

async function flush() {
  for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r));
}

/** ConversationRelay reproduce lo pendiente y avisa que el agente calló. */
async function sueneYCalle(ws: FakeWs) {
  await deliver(ws, { type: 'info', name: 'agentSpeaking', value: 'on' });
  await deliver(ws, { type: 'info', name: 'agentSpeaking', value: 'off' });
}

async function conectar(): Promise<FakeWs> {
  const ws = new FakeWs();
  handleConversationRelayConnection(ws as never, null);
  await deliver(ws, { type: 'setup', callSid: 'CA1', from: '+570000', to: '+571111', customParameters: { token: 't', agentId: 'agent-1' } });
  return ws;
}

/** Un turno del cliente que termina en cuelgue: espera el fin de reproducción y devuelve. */
async function turnoQueCuelga(ws: FakeWs, texto: string) {
  const p = deliver(ws, { type: 'prompt', voicePrompt: texto });
  await flush();
  await sueneYCalle(ws);
  await p;
}

const herramientasLlamadas = () => executeCrmTool.mock.calls.map((c) => c[0]);

beforeAll(() => {
  process.env.OPENAI_API_KEY = 'sk-test';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
});

beforeEach(() => {
  responsesCreate.mockReset();
  executeCrmTool.mockClear();
  marcarPerdida.mockClear();
  despedidaAgente = DESPEDIDA_POR_DEFECTO;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(async () => {
  jest.useRealTimers();
  for (const ws of abiertas.splice(0)) {
    ws.readyState = 3;
    ws.emit('close');
  }
  await flush();
  jest.restoreAllMocks();
});

// ─── 1. Despedida forzada ────────────────────────────────────────────────────

describe('1. despedida SIEMPRE antes de colgar', () => {
  test('end_call sin despedida: el runtime dice la despedida y NO cuelga hasta que termina de sonar', async () => {
    responsesCreate.mockResolvedValueOnce(turno([], [{ name: 'end_call', args: { outcome: 'completed' } }]));
    const ws = await conectar();

    const p = deliver(ws, { type: 'prompt', voicePrompt: 'Listo, eso era todo.' });
    await flush();
    // Ya se mandó la despedida, pero todavía no el `end`: está sonando.
    expect(ws.frases().pop()).toBe(DESPEDIDA_POR_DEFECTO);
    expect(ws.colgo()).toBe(false);

    // El `off` de una frase anterior (sin `on` posterior) no cuenta.
    await deliver(ws, { type: 'info', name: 'agentSpeaking', value: 'off' });
    await flush();
    expect(ws.colgo()).toBe(false);

    await sueneYCalle(ws);
    await p;
    const idxDespedida = ws.sent.findIndex((m) => m.type === 'text' && m.token === DESPEDIDA_POR_DEFECTO);
    const idxEnd = ws.sent.findIndex((m) => m.type === 'end');
    expect(idxDespedida).toBeGreaterThanOrEqual(0);
    expect(idxEnd).toBeGreaterThan(idxDespedida);
  });

  test('sin eventos de habla, cuelga al vencer el tope (no al instante)', async () => {
    responsesCreate.mockResolvedValueOnce(turno([], [{ name: 'end_call' }]));
    const ws = await conectar();
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    const p = deliver(ws, { type: 'prompt', voicePrompt: 'Gracias, hasta luego.' });
    await flush();
    expect(ws.colgo()).toBe(false);
    await jest.advanceTimersByTimeAsync(1000);
    expect(ws.colgo()).toBe(false);
    await jest.advanceTimersByTimeAsync(15000);
    await p;
    expect(ws.colgo()).toBe(true);
  });

  test('si el modelo ya se despidió, no se repite la despedida', async () => {
    responsesCreate.mockResolvedValueOnce(
      turno(['Con gusto. ', 'Gracias por su tiempo, ', 'que tenga buen día.'], [{ name: 'end_call' }])
    );
    const ws = await conectar();
    await turnoQueCuelga(ws, 'No, gracias, eso es todo.');
    expect(ws.frases()).toEqual(['Con gusto. Gracias por su tiempo, que tenga buen día.']);
    expect(ws.colgo()).toBe(true);
  });

  test('la despedida es configurable por agente', async () => {
    despedidaAgente = 'Mil gracias por atenderme. Feliz tarde.';
    responsesCreate.mockResolvedValueOnce(turno(['Entiendo.'], [{ name: 'end_call' }]));
    const ws = await conectar();
    await turnoQueCuelga(ws, 'Ya terminamos.');
    expect(ws.frases()).toEqual(['Entiendo.', 'Mil gracias por atenderme. Feliz tarde.']);
    expect(despedidaDelAgente({ despedida: '  Mil gracias.  ' })).toBe('Mil gracias.');
    expect(despedidaDelAgente({})).toBe(DESPEDIDA_POR_DEFECTO);
    expect(despedidaDelAgente({ despedida: 'x'.repeat(500) })).toBe(DESPEDIDA_POR_DEFECTO);
  });
});

// ─── 2. Tope de un reintento ─────────────────────────────────────────────────

describe('2. un solo reintento ante «no me interesa»', () => {
  test('caso real: 1.ª objeción → end_call rechazado y reintento; 2.ª → despedida, fin y oportunidad perdida', async () => {
    const ws = await conectar();

    // Turno 1 — lo que hizo el modelo en la llamada real: objeción + end_call.
    responsesCreate
      .mockResolvedValueOnce(
        turno([], [
          { name: 'log_objection', args: { objection: 'Su software propio funciona perfecto', tipo: 'ya_tiene_solucion' } },
          { name: 'end_call', args: { outcome: 'no_interest' } },
        ])
      )
      .mockResolvedValueOnce(turno(['Entiendo. ', '¿Ese software también le maneja la facturación electrónica y el inventario?']));
    await deliver(ws, { type: 'prompt', voicePrompt: 'No, todo funciona perfecto.' });

    expect(herramientasLlamadas()).toEqual(['log_objection']); // end_call NO se ejecutó
    expect(ws.colgo()).toBe(false);
    const segundo = responsesCreate.mock.calls[1][0];
    expect(JSON.stringify(segundo.input)).toContain('PRIMERA vez que el cliente muestra desinterés');
    expect(ws.frases().pop()).toBe('Entiendo. ¿Ese software también le maneja la facturación electrónica y el inventario?');

    // Turno 2 — vuelve a decir que no. El modelo solo registra la objeción
    // (y hasta intenta seguir): el runtime cierra igual.
    responsesCreate.mockResolvedValueOnce(
      turno(['Le cuento que además '], [{ name: 'log_objection', args: { objection: 'No le interesa', tipo: 'desinteres' } }])
    );
    await turnoQueCuelga(ws, 'Sí, todo eso lo hace. No me interesa, gracias.');

    expect(responsesCreate).toHaveBeenCalledTimes(3); // no se le devolvió la palabra al modelo
    expect(herramientasLlamadas()).toEqual(['log_objection', 'log_objection', 'end_call']);
    expect(executeCrmTool.mock.calls[2][1]).toEqual({ outcome: 'sin_interes_definitivo', resultado: 'sin_interes' });
    expect(ws.frases().pop()).toBe(DESPEDIDA_POR_DEFECTO);
    expect(ws.colgo()).toBe(true);

    expect(marcarPerdida).toHaveBeenCalledTimes(1);
    const [ctx, objecion] = marcarPerdida.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    // La organización y la oportunidad salen del contexto de la llamada, no del modelo.
    expect(ctx).toMatchObject({ orgId: 125, opportunityId: 'opp-1', voiceAgentCallId: 'vac-1', objetivo: 'book_meeting', politicaEtapa: null });
    expect(objecion).toMatchObject({ texto: 'No le interesa', tipo: 'desinteres' });
  });

  test('el reintento se exige UNA sola vez: el segundo end_call cuelga aunque no haya 2.ª objeción', async () => {
    const ws = await conectar();
    responsesCreate
      .mockResolvedValueOnce(turno([], [
        { name: 'log_objection', args: { objection: 'No me interesa', tipo: 'desinteres' } },
        { name: 'end_call' },
      ]))
      .mockResolvedValueOnce(turno([], [{ name: 'end_call' }]));
    await turnoQueCuelga(ws, 'No me interesa.');
    expect(herramientasLlamadas()).toEqual(['log_objection', 'end_call']);
    expect(ws.colgo()).toBe(true);
    expect(ws.frases().pop()).toBe(DESPEDIDA_POR_DEFECTO);
    // Una sola objeción de desinterés no es definitiva: la oportunidad no se toca.
    expect(marcarPerdida).not.toHaveBeenCalled();
  });

  test('dos objeciones en el MISMO turno del cliente cuentan como una', () => {
    const c = new ControlCierre();
    c.registrarObjecion(3, { texto: 'a', detalle: null, tipo: 'desinteres' });
    c.registrarObjecion(3, { texto: 'b', detalle: null, tipo: 'ya_tiene_solucion' });
    expect(c.objecionesDesinteres).toBe(1);
    expect(c.desinteresDefinitivo).toBe(false);
    expect(c.decidirEndCall('no me interesa')).toEqual({ accion: 'exigir_reintento', mensaje: MENSAJE_EXIGIR_REINTENTO });
    expect(c.decidirEndCall('no me interesa')).toEqual({ accion: 'colgar' });
    c.registrarObjecion(4, { texto: 'c', detalle: null, tipo: 'desinteres' });
    expect(c.desinteresDefinitivo).toBe(true);
  });

  test('«llámeme después» no es desinterés: ni reintento forzado, ni cierre, ni pérdida', async () => {
    const ws = await conectar();
    responsesCreate
      .mockResolvedValueOnce(turno([], [{ name: 'log_objection', args: { objection: 'Ahora no puede', tipo: 'momento' } }]))
      .mockResolvedValueOnce(turno(['Claro, ¿le parece si le llamo mañana?']));
    await deliver(ws, { type: 'prompt', voicePrompt: 'Ahora no puedo, llámeme después.' });
    responsesCreate
      .mockResolvedValueOnce(turno([], [{ name: 'log_objection', args: { objection: 'Sigue ocupado', tipo: 'momento' } }]))
      .mockResolvedValueOnce(turno(['Perfecto, ¿a qué hora le queda bien?']));
    await deliver(ws, { type: 'prompt', voicePrompt: 'Mañana tampoco, la otra semana.' });
    expect(ws.colgo()).toBe(false);
    expect(responsesCreate).toHaveBeenCalledTimes(4);
    expect(marcarPerdida).not.toHaveBeenCalled();
    expect(clasificarObjecion(undefined, 'no me interesa')).toBe('desinteres');
    expect(clasificarObjecion(undefined, 'llámeme después')).toBe('otro');
  });
});

// ─── 3. Bajas: sin reintento ─────────────────────────────────────────────────

describe('3. «no me llamen más»: sin reintento, la baja de siempre', () => {
  test('con log_consent_opt_out: no se exige reintento, la frase de la baja es la despedida y la oportunidad no se toca', async () => {
    const ws = await conectar();
    responsesCreate.mockResolvedValueOnce(
      turno([], [
        { name: 'log_objection', args: { objection: 'No le interesa', tipo: 'desinteres' } },
        { name: 'log_consent_opt_out', args: { channel: 'voice', reason: 'Pidió no ser llamado' } },
        { name: 'end_call', args: { outcome: 'opted_out' } },
      ])
    );
    const p = deliver(ws, { type: 'prompt', voicePrompt: 'No me interesa y no me llamen más.' });
    await flush();
    // Se despide con la frase de la baja y no corta hasta que termina de sonar.
    expect(ws.colgo()).toBe(false);
    await sueneYCalle(ws);
    await p;
    expect(herramientasLlamadas()).toEqual(['log_objection', 'log_consent_opt_out', 'end_call']);
    expect(executeCrmTool.mock.calls[1][1]).toEqual({ channel: 'voice', reason: 'Pidió no ser llamado' });
    expect(ws.frases()).toEqual(['Entendido, no volveremos a llamarle. Queda registrado. Gracias por su tiempo.']);
    expect(ws.colgo()).toBe(true);
    expect(responsesCreate).toHaveBeenCalledTimes(1);
    expect(marcarPerdida).not.toHaveBeenCalled();
  });

  test('si el cliente pide la baja, nunca se exige el reintento aunque el modelo olvide log_consent_opt_out', async () => {
    const ws = await conectar();
    responsesCreate.mockResolvedValueOnce(
      turno([], [
        { name: 'log_objection', args: { objection: 'No le interesa', tipo: 'desinteres' } },
        { name: 'end_call' },
      ])
    );
    await turnoQueCuelga(ws, 'No me interesa, quíteme de la lista.');
    expect(herramientasLlamadas()).toEqual(['log_objection', 'end_call']);
    expect(ws.colgo()).toBe(true);
    // Sin reintento, pero con despedida: nunca se cuelga en silencio.
    expect(ws.frases()).toEqual([DESPEDIDA_POR_DEFECTO]);
    expect(responsesCreate).toHaveBeenCalledTimes(1);
  });

  test('frases de baja y de despedida', () => {
    for (const t of ['No me llamen más', 'quíteme de la lista', 'no me vuelvan a llamar', 'Bórrenme de su base', 'no quiero que me llamen']) {
      expect(pideNoSerLlamado(t)).toBe(true);
    }
    for (const t of ['No me interesa', 'llámeme después', 'no, todo funciona perfecto']) {
      expect(pideNoSerLlamado(t)).toBe(false);
    }
    expect(esDespedida('Entendido, no volveremos a llamarle. Queda registrado. Gracias por su tiempo.')).toBe(true);
    expect(esDespedida('Gracias. ¿Qué tipo de negocio tienen?')).toBe(false);
    expect(esDespedida('Entiendo, ya cuentan con un software propio.')).toBe(false);
  });
});

// ─── 4. Prompt: las reglas también van al modelo ─────────────────────────────

describe('4. prompt de sistema', () => {
  test('lleva el único reintento, la baja sin reintento y la despedida del agente', () => {
    const real = jest.requireActual('@/lib/services/crm/voiceAgent/agentRuntime') as typeof import('@/lib/services/crm/voiceAgent/agentRuntime');
    const prompt = real.buildSystemPrompt({
      organizationName: 'Org 125',
      identityDisclosure: 'Le atiende un asistente virtual con inteligencia artificial.',
      agent: {
        name: 'Pedro',
        system_prompt: 'Guion.',
        purpose_type: 'book_meeting',
        guardrails: { despedida: 'Mil gracias, feliz día.' },
        transfer_to_human_rules: {},
        max_turns: 20,
      },
      stage: null,
      customerName: null,
      recordingEnabled: false,
      consentMessage: '',
    });
    expect(prompt).toContain('haz UN solo intento más');
    expect(prompt).toContain('¿Ese software también le maneja la facturación electrónica y el inventario?');
    expect(prompt).toContain('Nunca insistas una segunda vez');
    expect(prompt).toContain('NO hay intento adicional');
    expect(prompt).toContain('«Mil gracias, feliz día.»');
    // Los guardarraíles obligatorios siguen primero.
    expect(prompt.startsWith('REGLAS OBLIGATORIAS')).toBe(true);
  });
});
