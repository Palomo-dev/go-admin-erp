/**
 * Generacion con el proveedor de IA — nucleo compartido de la IA de atencion.
 *
 * Es la MISMA generacion con la que responde `ai-auto-response`: Responses API
 * para la familia gpt-5.x/6.x con `instructions` + `input`, Chat Completions
 * para el resto, respaldo de emergencia y Gemini. La usa tambien el
 * Laboratorio de IA (`/api/chat/ai/lab-test`) para que la prueba responda
 * igual que la IA real (regla 7 de CLAUDE.md: nada de segundas copias).
 *
 * Sin dependencias de Deno ni de Next: el cliente de OpenAI, el de Supabase y
 * la lectura de variables de entorno llegan como parametros. La Edge Function
 * lo importa con `.ts`; Next y Jest, sin extension. Extraido literal de
 * `ai-auto-response/index.ts` el 2026-11-13.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Cliente del SDK `openai` (esm.sh en Deno, npm en Node): solo se usan `chat.completions` y `responses`. */
// deno-lint-ignore no-explicit-any
export type ClienteOpenAI = any;
// deno-lint-ignore no-explicit-any
export type ClienteDatos = any;

/**
 * Modelo de la IA de atencion cuando ni la organizacion (`ai_settings.model`)
 * ni el entorno lo fijan. El mismo que usa `ai-auto-response`.
 */
export const MODELO_POR_DEFECTO_ATENCION = 'gpt-5.6-luna';

export interface RespuestaLlm {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Tokens de entrada servidos desde cache (0,1x de tarifa). Solo Responses API. */
  cachedTokens: number;
}

/** Credencial del proveedor: primero la de la organizacion, si no la global. */
export async function credencialProveedor(
  supabase: ClienteDatos,
  organizationId: number,
  proveedor: string,
  claves: string[],
  leerEnv: (clave: string) => string | undefined
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('provider_configs')
      .select('credentials')
      .eq('organization_id', organizationId)
      .eq('category', 'llm')
      .eq('provider', proveedor)
      .eq('is_active', true)
      .maybeSingle();
    for (const clave of claves) {
      const valor = (data?.credentials as Record<string, string> | null)?.[clave];
      if (valor) return valor;
    }
  } catch (e) {
    console.error('No se pudo leer provider_configs:', e);
  }
  for (const clave of claves) {
    const valor = leerEnv(clave);
    if (valor) return valor;
  }
  return null;
}

/**
 * La familia 5.6 (y 6.x) vive en la Responses API, no en Chat Completions:
 * todo el resto del repositorio la llama con `responses.parse` y
 * `reasoning.effort: 'none'` (aiDraftService, callAnalysisService), y el
 * ANEXO-B §4.2 la documenta bajo "Modelos de texto (Responses API)".
 * gpt-4o y gpt-4o-mini siguen por Chat Completions.
 */
export function usaResponsesApi(model: string): boolean {
  return /^gpt-(5|6)/.test(model);
}

export async function generarConChatCompletions(
  openai: ClienteOpenAI,
  model: string,
  chatMessages: Array<any>,
  temperature: number,
  maxTokens: number
): Promise<RespuestaLlm> {
  const completion = await openai.chat.completions.create({
    model, messages: chatMessages, temperature, max_tokens: maxTokens,
  });
  return {
    content: completion.choices[0]?.message?.content || '',
    model: completion.model || model,
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
    totalTokens: completion.usage?.total_tokens ?? 0,
    cachedTokens: completion.usage?.prompt_tokens_details?.cached_tokens ?? 0,
  };
}

export async function generarConResponses(
  openai: ClienteOpenAI,
  model: string,
  chatMessages: Array<any>,
  temperature: number,
  maxTokens: number
): Promise<RespuestaLlm> {
  // El PRIMER mensaje de sistema es el prefijo estable: va en `instructions`,
  // que es lo que el proveedor cachea. Los sistemas siguientes son contexto de
  // este mensaje concreto y van en `input` como turnos de usuario: si se
  // filtraran junto con el primero, ese contexto se perderia y el modelo
  // respondería sin ver los productos.
  const [system, ...sistemasExtra] = chatMessages.filter((m) => m.role === 'system');
  const resto = [
    ...sistemasExtra.map((m) => ({ role: 'user', content: String(m.content ?? '') })),
    ...chatMessages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : '',
      })),
  ].filter((m) => m.content.length > 0);

  const respuesta: any = await (openai as any).responses.create({
    model,
    instructions: system ? String(system.content) : undefined,
    input: resto,
    temperature,
    max_output_tokens: maxTokens,
    // Respuestas de chat: no queremos que gaste tokens razonando.
    reasoning: { effort: 'none' },
    // Datos de clientes: no se guardan en OpenAI (ANEXO-B §4.2).
    store: false,
  });

  const texto = respuesta?.output_text
    ?? respuesta?.output?.flatMap((o: any) => o?.content ?? [])
         ?.map((c: any) => c?.text ?? '')
         ?.join('')
    ?? '';

  return {
    content: texto,
    model: respuesta?.model || model,
    promptTokens: respuesta?.usage?.input_tokens ?? 0,
    completionTokens: respuesta?.usage?.output_tokens ?? 0,
    totalTokens: respuesta?.usage?.total_tokens ?? 0,
    cachedTokens: respuesta?.usage?.input_tokens_details?.cached_tokens ?? 0,
  };
}

/** Modelo de emergencia: legacy, pero comprobado que funciona por Chat Completions. */
export const MODELO_DE_EMERGENCIA = 'gpt-4o-mini';

/**
 * Genera con OpenAI eligiendo el endpoint segun el modelo.
 *
 * Si la Responses API falla —modelo sin acceso en la cuenta, cuota, forma
 * distinta a la documentada— NO se reintenta el mismo modelo por Chat
 * Completions: verificado contra la API real, gpt-5.6-luna rechaza ese endpoint
 * ("Unsupported parameter: 'max_tokens' ... Use 'max_completion_tokens'"), asi
 * que ese respaldo no salvaria nada. Se cae a un modelo legacy que si funciona,
 * para que el cliente reciba respuesta, y el fallo queda en el log.
 */
export async function generarConOpenAI(
  openai: ClienteOpenAI,
  model: string,
  chatMessages: Array<any>,
  temperature: number,
  maxTokens: number
): Promise<RespuestaLlm> {
  if (!usaResponsesApi(model)) {
    return await generarConChatCompletions(openai, model, chatMessages, temperature, maxTokens);
  }
  try {
    return await generarConResponses(openai, model, chatMessages, temperature, maxTokens);
  } catch (e: any) {
    console.error(
      `Responses API fallo con ${model} (${e?.status ?? '?'}: ${e?.message}); ` +
      `se responde con ${MODELO_DE_EMERGENCIA}. Revisar acceso al modelo.`
    );
    return await generarConChatCompletions(
      openai, MODELO_DE_EMERGENCIA, chatMessages, temperature, maxTokens
    );
  }
}

/**
 * Genera con Gemini. El historial de OpenAI se traduce al formato de Google:
 * el mensaje `system` va aparte en `systemInstruction` y `assistant` se llama
 * `model`.
 */
export async function generarConGoogle(
  apiKey: string,
  model: string,
  chatMessages: Array<any>,
  temperature: number,
  maxTokens: number
): Promise<RespuestaLlm> {
  const system = chatMessages.find((m) => m.role === 'system');
  const contents = chatMessages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: typeof m.content === 'string' ? m.content : '' }],
    }))
    .filter((c) => c.parts[0].text.length > 0);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const respuesta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: system ? { parts: [{ text: String(system.content) }] } : undefined,
      contents,
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    }),
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text();
    const error: any = new Error(`Google devolvio ${respuesta.status}: ${detalle.slice(0, 300)}`);
    error.status = respuesta.status;
    throw error;
  }

  const json = await respuesta.json();
  const texto = json?.candidates?.[0]?.content?.parts
    ?.map((p: any) => p?.text || '')
    .join('') || '';
  const uso = json?.usageMetadata || {};

  return {
    content: texto,
    model,
    promptTokens: uso.promptTokenCount ?? 0,
    completionTokens: uso.candidatesTokenCount ?? 0,
    totalTokens: uso.totalTokenCount ?? 0,
    cachedTokens: uso.cachedContentTokenCount ?? 0,
  };
}

/** Reintento con backoff para errores 5xx / timeout del proveedor. */
export async function conReintentos<T>(fn: () => Promise<T>, intentos = 3): Promise<T> {
  let ultimoError: any;
  for (let i = 0; i < intentos; i++) {
    try {
      return await fn();
    } catch (e: any) {
      ultimoError = e;
      const status = e?.status ?? e?.response?.status;
      const recuperable = status === undefined || status >= 500 || status === 429;
      if (!recuperable || i === intentos - 1) throw e;
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, i)));
    }
  }
  throw ultimoError;
}

export interface EntradaGeneracion {
  openai: ClienteOpenAI;
  supabase: ClienteDatos;
  /** `Deno.env.get` en la Edge Function, `process.env[...]` en Node. */
  leerEnv: (clave: string) => string | undefined;
  organizationId: number;
  /** `ai_settings.provider` ('openai' | 'google'). */
  proveedor: string;
  model: string;
  chatMessages: Array<any>;
  temperatura: number;
  maxTokens: number;
}

/**
 * Genera con el proveedor configurado, con reintento ante 5xx / 429 / timeout.
 * Devuelve el proveedor y el modelo con los que de verdad se respondio: si la
 * organizacion eligio Google sin credencial, se responde con OpenAI.
 */
export async function generarSegunProveedor(
  entrada: EntradaGeneracion
): Promise<{ respuesta: RespuestaLlm; proveedor: string; model: string }> {
  const { openai, supabase, leerEnv, organizationId, chatMessages, temperatura, maxTokens } = entrada;
  let { proveedor, model } = entrada;
  let respuesta: RespuestaLlm;

  if (proveedor === 'google') {
    const claveGoogle = await credencialProveedor(supabase, organizationId, 'google', ['GOOGLE_AI_API_KEY', 'GEMINI_API_KEY'], leerEnv);
    if (claveGoogle) {
      // Fase 0.4: reintento con backoff ante 5xx / 429 / timeout.
      respuesta = await conReintentos(() =>
        generarConGoogle(claveGoogle, model, chatMessages, temperatura, maxTokens)
      );
    } else {
      // Sin credencial no se deja al cliente sin respuesta: se cae a OpenAI y
      // queda registrado, porque es un fallo de configuracion, no del cliente.
      console.error(`Org ${organizationId} tiene provider=google sin credencial; se responde con OpenAI.`);
      proveedor = 'openai';
      model = MODELO_POR_DEFECTO_ATENCION;
      respuesta = await conReintentos(() =>
        generarConOpenAI(openai, model, chatMessages, temperatura, maxTokens)
      );
    }
  } else {
    respuesta = await conReintentos(() =>
      generarConOpenAI(openai, model, chatMessages, temperatura, maxTokens)
    );
  }

  return { respuesta, proveedor, model };
}
