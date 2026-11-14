/**
 * Generación de la IA de atención — núcleo compartido entre `ai-auto-response`
 * y el Laboratorio de IA (`_shared/ai-chat/generacionLlm.ts`). Las trampas del
 * handoff (docs/ia-chat/HANDOFF-CHAT-ATENCION-CLIENTE-2026-09-29.md §8):
 * gpt-5.6 solo por Responses API, los sistemas extra van como `user`, el
 * respaldo de emergencia es gpt-4o-mini y Google sin credencial cae a OpenAI.
 */
import {
  generarConOpenAI,
  generarSegunProveedor,
  MODELO_DE_EMERGENCIA,
  MODELO_POR_DEFECTO_ATENCION,
  usaResponsesApi,
} from '../../../supabase/functions/_shared/ai-chat/generacionLlm';

function openaiFalso(opciones: { fallaResponses?: boolean } = {}) {
  const llamadas: { endpoint: string; args: Record<string, unknown> }[] = [];
  return {
    llamadas,
    responses: {
      create: async (args: Record<string, unknown>) => {
        llamadas.push({ endpoint: 'responses', args });
        if (opciones.fallaResponses) throw Object.assign(new Error('sin acceso'), { status: 400 });
        return { output_text: 'hola desde responses', model: args.model, usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 4 } } };
      },
    },
    chat: {
      completions: {
        create: async (args: Record<string, unknown>) => {
          llamadas.push({ endpoint: 'chat', args });
          return { choices: [{ message: { content: 'hola desde chat' } }], model: args.model, usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 } };
        },
      },
    },
  };
}

const MENSAJES = [
  { role: 'system', content: 'PREFIJO' },
  { role: 'system', content: 'CONTEXTO' },
  { role: 'user', content: '¿Hay envío?' },
];

test('gpt-5.x y 6.x van por la Responses API; el resto por Chat Completions', () => {
  expect(usaResponsesApi('gpt-5.6-luna')).toBe(true);
  expect(usaResponsesApi('gpt-6')).toBe(true);
  expect(usaResponsesApi('gpt-4o-mini')).toBe(false);
});

test('Responses API: el primer sistema en `instructions`, los demás como `user`, sin guardar en OpenAI', async () => {
  const openai = openaiFalso();
  const r = await generarConOpenAI(openai, 'gpt-5.6-luna', MENSAJES, 0.3, 200);
  expect(r).toMatchObject({ content: 'hola desde responses', promptTokens: 10, completionTokens: 5, totalTokens: 15, cachedTokens: 4 });
  const args = openai.llamadas[0].args;
  expect(args).toMatchObject({ model: 'gpt-5.6-luna', instructions: 'PREFIJO', temperature: 0.3, max_output_tokens: 200, store: false, reasoning: { effort: 'none' } });
  expect(args.input).toEqual([
    { role: 'user', content: 'CONTEXTO' },
    { role: 'user', content: '¿Hay envío?' },
  ]);
});

test('si la Responses API falla se responde con el modelo de emergencia por Chat Completions', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const openai = openaiFalso({ fallaResponses: true });
  const r = await generarConOpenAI(openai, 'gpt-5.6-luna', MENSAJES, 0.7, 500);
  expect(r.content).toBe('hola desde chat');
  expect(openai.llamadas.map((l) => [l.endpoint, l.args.model])).toEqual([
    ['responses', 'gpt-5.6-luna'],
    ['chat', MODELO_DE_EMERGENCIA],
  ]);
  jest.restoreAllMocks();
});

test('Google sin credencial cae a OpenAI con el modelo por defecto y lo dice', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const supabase = {
    from: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) };
      return q;
    },
  };
  const openai = openaiFalso();
  const r = await generarSegunProveedor({
    openai,
    supabase,
    leerEnv: () => undefined,
    organizationId: 120,
    proveedor: 'google',
    model: 'gemini-2.5-flash',
    chatMessages: MENSAJES,
    temperatura: 0.7,
    maxTokens: 300,
  });
  expect(r.proveedor).toBe('openai');
  expect(r.model).toBe(MODELO_POR_DEFECTO_ATENCION);
  expect(r.respuesta.content).toBe('hola desde responses');
  jest.restoreAllMocks();
});
