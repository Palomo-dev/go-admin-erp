import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore: Deno URL import (resolves at runtime in Supabase Edge Functions)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore: Deno URL import (resolves at runtime in Supabase Edge Functions)
import OpenAI from "https://esm.sh/openai@4";
// Logica pura compartida (primer ladrillo del nucleo de la Fase 1). Se importa
// con extension .ts porque lo exige Deno; Jest la testea importandola sin ella.
import { decidirSilencio, secretosCoinciden } from "../_shared/ai-chat/politicaRespuesta.ts";
import { decidirBusquedaCatalogo } from "../_shared/ai-chat/intencionConsulta.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const openaiKey = Deno.env.get('OPENAI_API_KEY')!;

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiKey });

// =============================================================================
// Fase 0 — Seguridad, creditos, idempotencia y trazabilidad
// =============================================================================

/**
 * Secreto compartido con `trigger_ai_auto_response`. Preferimos la variable de
 * entorno (si algun dia se configura en el panel) y si no, lo leemos de vault
 * via RPC. Se cachea en memoria para no consultar en cada invocacion.
 */
let cachedInternalSecret: string | null = null;
async function getInternalSecret(): Promise<string | null> {
  if (cachedInternalSecret) return cachedInternalSecret;
  const fromEnv = Deno.env.get('AI_INTERNAL_SECRET');
  if (fromEnv) {
    cachedInternalSecret = fromEnv;
    return cachedInternalSecret;
  }
  const { data, error } = await supabase.rpc('get_ai_internal_secret');
  if (error || !data) {
    console.error('No se pudo leer AI_INTERNAL_SECRET:', error?.message);
    return null;
  }
  cachedInternalSecret = data as string;
  return cachedInternalSecret;
}

interface AiSettingsRow {
  model?: string;
  temperature?: string | number;
  max_tokens?: number;
  system_rules?: string;
  fallback_message?: string;
  is_active?: boolean;
  auto_response_enabled?: boolean;
  auto_response_delay_seconds?: number;
  hybrid_agent_pause_minutes?: number;
  hybrid_respect_business_hours?: boolean;
  reply_fallback_on_no_credits?: boolean;
}

// =============================================================================
// Fase 5.2 — Multiproveedor real
//
// Antes `ai_settings.provider` era decorativo: se podia elegir Anthropic o
// Google en /crm/ia y la funcion llamaba a OpenAI igual. Ahora Google se
// implementa de verdad; Anthropic NO se ofrece porque no hay ni credencial en
// providerRegistry ni tarifa en provider_pricing.
// =============================================================================

interface RespuestaLlm {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Credencial del proveedor: primero la de la organizacion, si no la global. */
async function credencialProveedor(
  organizationId: number,
  proveedor: string,
  claves: string[]
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
    const valor = Deno.env.get(clave);
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
function usaResponsesApi(model: string): boolean {
  return /^gpt-(5|6)/.test(model);
}

async function generarConChatCompletions(
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
  };
}

async function generarConResponses(
  model: string,
  chatMessages: Array<any>,
  temperature: number,
  maxTokens: number
): Promise<RespuestaLlm> {
  const system = chatMessages.find((m) => m.role === 'system');
  const resto = chatMessages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : '',
    }))
    .filter((m) => m.content.length > 0);

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
  };
}

/** Modelo de emergencia: legacy, pero comprobado que funciona por Chat Completions. */
const MODELO_DE_EMERGENCIA = 'gpt-4o-mini';

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
async function generarConOpenAI(
  model: string,
  chatMessages: Array<any>,
  temperature: number,
  maxTokens: number
): Promise<RespuestaLlm> {
  if (!usaResponsesApi(model)) {
    return await generarConChatCompletions(model, chatMessages, temperature, maxTokens);
  }
  try {
    return await generarConResponses(model, chatMessages, temperature, maxTokens);
  } catch (e: any) {
    console.error(
      `Responses API fallo con ${model} (${e?.status ?? '?'}: ${e?.message}); ` +
      `se responde con ${MODELO_DE_EMERGENCIA}. Revisar acceso al modelo.`
    );
    return await generarConChatCompletions(
      MODELO_DE_EMERGENCIA, chatMessages, temperature, maxTokens
    );
  }
}

/**
 * Genera con Gemini. El historial de OpenAI se traduce al formato de Google:
 * el mensaje `system` va aparte en `systemInstruction` y `assistant` se llama
 * `model`.
 */
async function generarConGoogle(
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
  };
}

/** Cierra un job de ai_jobs. Nunca lanza: la telemetria no debe tumbar la respuesta. */
async function finalizarJob(
  jobId: string | null,
  patch: Record<string, unknown>
): Promise<void> {
  if (!jobId) return;
  try {
    await supabase.from('ai_jobs').update(patch).eq('id', jobId);
  } catch (e) {
    console.error('No se pudo actualizar ai_jobs:', e);
  }
}

/** Reintento con backoff para errores 5xx / timeout del proveedor. */
async function conReintentos<T>(fn: () => Promise<T>, intentos = 3): Promise<T> {
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

async function classifyAndTagConversation(
  conversationId: string,
  organizationId: number,
  messageContent: string
) {
  try {
    const systemPrompt = `Eres un clasificador de intenciones de mensajes de clientes. Analiza el mensaje y determina:\n1. La intención principal (consulta, queja, solicitud, agradecimiento, saludo, despedida, urgente, venta, soporte, facturacion, otro)\n2. Un nivel de confianza (0-1)\n3. Tags sugeridos para la conversación (máximo 3)\n\nResponde SOLO en formato JSON:\n{"intent": "...", "confidence": 0.95, "suggestedTags": ["tag1"]}\n\nTags disponibles: Urgente, Queja, Venta, Soporte, Facturación, Consulta, Seguimiento, Devolución, Envío, Pedido`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: messageContent }
      ],
      temperature: 0.2,
      max_tokens: 200,
    });

    const responseContent = completion.choices[0]?.message?.content || '{}';
    const cleanedResponse = responseContent.replace(/```json\n?|```\n?/g, '').trim();
    const result = JSON.parse(cleanedResponse);

    if (result.suggestedTags && result.suggestedTags.length > 0 && result.confidence > 0.6) {
      const { data: existingTags } = await supabase
        .from('conversation_tags')
        .select('id, name')
        .eq('organization_id', organizationId);

      const tagMap = new Map(existingTags?.map(t => [t.name.toLowerCase(), t.id]) || []);

      for (const suggestedTag of result.suggestedTags) {
        const tagId = tagMap.get(suggestedTag.toLowerCase());
        if (tagId) {
          const { data: existingRelation } = await supabase
            .from('conversation_tag_relations')
            .select('id')
            .eq('conversation_id', conversationId)
            .eq('tag_id', tagId)
            .single();
          if (!existingRelation) {
            await supabase.from('conversation_tag_relations').insert({
              organization_id: organizationId,
              conversation_id: conversationId,
              tag_id: tagId,
            });
          }
        }
      }
    }
    return result;
  } catch (error) {
    console.error('Error clasificación:', error);
    return null;
  }
}

// correctTypos() y extractKeywords() se eliminaron.
//
// correctTypos era un mapa fijo de erratas de electrodomesticos
// ("labadora" -> "lavadora"). No servia para la drogueria ni la perfumeria, y
// ahora lo hace `palabras_de_catalogo()` por similitud contra el catalogo real
// de cada organizacion: "pocilo" -> "pocillo", "acetaminofeno" -> "acetaminofen".
//
// extractKeywords vive ahora en ../_shared/ai-chat/intencionConsulta.ts
// (`extraerTokens` / `decidirBusquedaCatalogo`), donde ademas descarta correos y
// telefonos y se puede testear con Jest.

/**
 * Palabras del hilo reciente que podrian nombrar un producto.
 *
 * Antes filtraba contra una lista cableada de electrodomesticos y muebles, asi
 * que para la perfumeria, la drogueria, la licorera o la tienda de tenis este
 * respaldo devolvia SIEMPRE vacio. Ahora devuelve candidatas y quien decide si
 * nombran algo es `palabras_de_catalogo()`, contra el catalogo de la tienda.
 */
function extractHistoryKeywords(messages: Array<{content: string, role: string, content_type?: string}>): string[] {
  const candidatas: string[] = [];
  const recientes = messages.slice(-6).filter(m => m.role === 'customer');
  for (const msg of recientes) {
    if (!msg.content || msg.content_type === 'image') continue;
    const decision = decidirBusquedaCatalogo(msg.content);
    candidatas.push(...decision.tokens);
  }
  return [...new Set(candidatas)].slice(0, 5);
}

function extractAssistantProductKeywords(messages: Array<{content: string, role: string, content_type?: string}>): string[] {
  const productKeywords: string[] = [];
  const assistantMsgs = messages.filter(m => m.role === 'ai' || m.role === 'assistant').slice(-3);
  for (const msg of assistantMsgs) {
    if (!msg.content) continue;
    const boldMatches = msg.content.match(/\*\*([^*]+)\*\*/g);
    if (boldMatches) {
      for (const match of boldMatches) {
        const productName = match.replace(/\*\*/g, '').toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const words = productName.split(/\s+/).filter(w => w.length > 3);
        if (words.length > 0) {
          productKeywords.push(words[0]);
        }
      }
    }
  }
  return [...new Set(productKeywords)].slice(0, 5);
}

function extractEmailFromMessages(messages: Array<{content: string, role: string}>): string | null {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const customerMsgs = messages.filter(m => m.role === 'customer').reverse();
  for (const msg of customerMsgs) {
    const matches = msg.content.match(emailRegex);
    if (matches) {
      const realEmail = matches.find(e => !e.includes('@widget.local'));
      if (realEmail) return realEmail.toLowerCase();
    }
  }
  return null;
}

async function searchProducts(organizationId: number, keywords: string[]): Promise<{text: string, products: any[]}> {
  if (keywords.length === 0) return { text: '', products: [] };

  try {
    // Paso 1: ¿alguna de estas palabras nombra algo del catalogo DE ESTA tienda?
    // Sustituye a las listas cableadas de electrodomesticos, que no servian para
    // la perfumeria, la drogueria, la licorera ni la tienda de tenis. Ademas
    // corrige erratas por similitud contra el catalogo real: "pocilo" ->
    // "pocillo", "acetaminofeno" -> "acetaminofen".
    const { data: reconocidas, error: errorVocab } = await supabase
      .rpc('palabras_de_catalogo', { p_org: organizationId, p_palabras: keywords });
    if (errorVocab) console.error('Error consultando vocabulario:', errorVocab.message);

    const tokens: string[] = (reconocidas || [])
      .map((r: any) => r.palabra_catalogo)
      .filter(Boolean);

    // Ninguna palabra del cliente existe en este catalogo: no hay nada que buscar.
    // Aqui es donde mueren "hila", "estafadores" y "pago".
    if (tokens.length === 0) return { text: '', products: [] };

    // Paso 2: UNA consulta que normaliza (tildes y apostrofos), busca en nombre,
    // marca, sku, referencia y descripcion con pesos, agrupa las variantes bajo
    // su producto padre y exige un umbral minimo de relevancia.
    const { data: encontrados, error: errorBusqueda } = await supabase
      .rpc('buscar_productos', { p_org: organizationId, p_tokens: tokens, p_limite: 6 });
    if (errorBusqueda) {
      console.error('Error buscando productos:', errorBusqueda.message);
      return { text: '', products: [] };
    }
    if (!encontrados || encontrados.length === 0) return { text: '', products: [] };

    const products = encontrados.map((p: any) => ({
      id: p.id,
      name: p.nombre,
      sku: p.sku,
      price: p.precio ? Number(p.precio) : 0,
      comparePrice: p.precio_anterior ? Number(p.precio_anterior) : null,
      imageUrl: p.imagen ? `${supabaseUrl}/storage/v1/object/public/product-images/${p.imagen}` : null,
      stock: p.stock !== null && p.stock !== undefined ? Number(p.stock) : null,
      presentaciones: p.presentaciones ?? 1,
    }));

    let text = '';
    for (const p of products) {
      const price = p.price ? `$${p.price.toLocaleString('es-CO')}` : 'Precio no disponible';
      const comparePrice = p.comparePrice && p.comparePrice > p.price
        ? ` (precio anterior tachado: $${p.comparePrice.toLocaleString('es-CO')}, NO usar este valor)` : '';
      const stockText = p.stock !== null ? ` | Stock: ${p.stock}` : '';
      // Las variantes van agrupadas: se le dice al modelo cuantas hay para que
      // pregunte por la presentacion en vez de listar la misma cosa seis veces.
      const presentaciones = p.presentaciones > 1
        ? ` | Disponible en ${p.presentaciones} presentaciones (pregunta cual quiere)` : '';
      text += `- **${p.name}** | PRECIO DE VENTA: ${price}${comparePrice}${stockText}${presentaciones}`;
      if (p.imageUrl) text += ` | Imagen: ${p.imageUrl}`;
      text += '\n';
    }

    return { text, products };
  } catch (e) {
    console.error('Error en searchProducts:', e);
    return { text: '', products: [] };
  }
}

async function getCategories(organizationId: number): Promise<string> {
  try {
    const { data } = await supabase
      .from('categories')
      .select('name')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .limit(15);
    if (!data || data.length === 0) return '';
    return data.map(c => c.name).join(', ');
  } catch {
    return '';
  }
}

async function getCustomerOrders(organizationId: number, email: string | null, customerId: string | null, emailFromChat: string | null): Promise<string> {
  try {
    const searchEmail = email || emailFromChat;
    if (!searchEmail && !customerId) return '';
    
    let customerIdToSearch = customerId;
    if (!customerIdToSearch && searchEmail) {
      const { data: cust } = await supabase
        .from('customers')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('email', searchEmail)
        .maybeSingle();
      if (cust) customerIdToSearch = cust.id;
    }
    if (!customerIdToSearch) return '';
    
    const { data: orders } = await supabase
      .from('invoice_sales')
      .select('number, total, status, created_at')
      .eq('organization_id', organizationId)
      .eq('customer_id', customerIdToSearch)
      .order('created_at', { ascending: false })
      .limit(3);
    
    if (!orders || orders.length === 0) return '';
    
    let text = '';
    for (const o of orders) {
      const date = new Date(o.created_at).toLocaleDateString('es-CO');
      text += `- Pedido #${o.number} | $${Number(o.total).toLocaleString('es-CO')} | Estado: ${o.status} | Fecha: ${date}\n`;
    }
    return text;
  } catch {
    return '';
  }
}

async function getCheckoutConfig(organizationId: number): Promise<{deliveryTypes: string[], shippingEnabled: boolean, shippingRate: number, shippingTitle: string, freeShippingThreshold: number, paymentMethods: Array<{code: string, name: string}>, taxRate: number, taxName: string, taxIncluded: boolean}> {
  try {
    const [wsResult, pmResult] = await Promise.all([
      supabase.from('website_settings').select('enable_shipping, available_delivery_types, shipping_flat_rate, shipping_flat_rate_title, free_shipping_threshold, tax_rate, tax_name, tax_included').eq('organization_id', organizationId).single(),
      supabase.from('organization_payment_methods').select('payment_method_code, website_display_name').eq('organization_id', organizationId).eq('is_active', true).eq('show_on_website', true),
    ]);
    const ws = wsResult.data as any || {};
    const methods = (pmResult.data || []).map((m: any) => ({ code: m.payment_method_code, name: m.website_display_name || m.payment_method_code }));
    let taxRate = Number(ws.tax_rate || 0);
    if (taxRate === 0) {
      const { data: defaultTax } = await supabase.from('organization_taxes').select('rate, name').eq('organization_id', organizationId).eq('is_active', true).eq('is_default', true).maybeSingle();
      if (defaultTax) taxRate = Number(defaultTax.rate);
    }
    return {
      deliveryTypes: ws.available_delivery_types || ['delivery_own'],
      shippingEnabled: ws.enable_shipping !== false,
      shippingRate: Number(ws.shipping_flat_rate || 0),
      shippingTitle: ws.shipping_flat_rate_title || 'Envío',
      freeShippingThreshold: Number(ws.free_shipping_threshold || 0),
      paymentMethods: methods.length > 0 ? methods : [{ code: 'cash', name: 'Efectivo' }],
      taxRate,
      taxName: ws.tax_name || 'IVA',
      taxIncluded: ws.tax_included === true,
    };
  } catch (e) {
    console.error('Error getCheckoutConfig:', e);
    return { deliveryTypes: ['delivery_own'], shippingEnabled: false, shippingRate: 0, shippingTitle: 'Envío', freeShippingThreshold: 0, paymentMethods: [{ code: 'cash', name: 'Efectivo' }], taxRate: 0, taxName: 'IVA', taxIncluded: false };
  }
}

async function getOrganizationInfo(organizationId: number): Promise<{name: string, domain: string | null, subdomain: string | null}> {
  try {
    const { data } = await supabase
      .from('organizations')
      .select('name, custom_domain, subdomain')
      .eq('id', organizationId)
      .single();
    if (!data) return { name: '', domain: null, subdomain: null };
    return { 
      name: data.name, 
      domain: data.custom_domain || (data.subdomain ? `${data.subdomain}.goadmin.io` : null),
      subdomain: data.subdomain || null
    };
  } catch {
    return { name: '', domain: null, subdomain: null };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // --- Fase 0.1: solo el trigger puede invocar esta funcion -------------------
  const secretoEsperado = await getInternalSecret();
  const secretoRecibido = req.headers.get('x-internal-secret') || '';
  if (!secretoEsperado || !secretosCoinciden(secretoRecibido, secretoEsperado)) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let jobId: string | null = null;
  let organizationId = 0;
  let conversationId = '';
  let messageId: string | null = null;

  try {
    const body = await req.json();
    conversationId = body.conversationId;
    messageId = body.messageId ?? null;
    if (!conversationId) {
      return new Response(JSON.stringify({ error: 'Falta conversationId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: conv } = await supabase
      .from('conversations')
      .select('id, channel_id, customer_id, organization_id, customer:customers(id, first_name, last_name, full_name, email, metadata)')
      .eq('id', conversationId)
      .single();
    if (!conv) {
      return new Response(JSON.stringify({ error: 'Conversacion no encontrada' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fase 0.1: la organizacion SIEMPRE sale de la fila real. El valor del body
    // es meramente informativo y, si no coincide, se rechaza la llamada.
    organizationId = conv.organization_id;
    if (body.organizationId !== undefined && Number(body.organizationId) !== organizationId) {
      console.error(`organizationId del body (${body.organizationId}) no coincide con la conversacion (${organizationId})`);
      return new Response(JSON.stringify({ error: 'organizationId no coincide con la conversacion' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: channelData } = await supabase
      .from('channels')
      .select('id, type, name, ai_mode, organization_id, business_hours, ai_draft_mode')
      .eq('id', conv.channel_id)
      .eq('organization_id', organizationId)
      .single();
    if (!channelData) {
      return new Response(JSON.stringify({ skipped: true, reason: 'canal_no_encontrado' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    conv.channel = channelData;

    // --- Fase 0.3: semantica real de ai_mode --------------------------------
    // El enum es ai_only | hybrid | manual. La comparacion anterior era contra
    // 'disabled', un valor que no existe: guardia muerta.
    const aiMode = channelData.ai_mode as string;
    if (aiMode === 'manual') {
      return new Response(JSON.stringify({ skipped: true, reason: 'canal_manual' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: aiSettings } = await supabase
      .from('ai_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle();
    const settings: AiSettingsRow = aiSettings || {
      model: 'gpt-5.6-luna', temperature: '0.7', max_tokens: 600, system_rules: '', fallback_message: '',
    };

    // --- Fase 0.2: la IA tambien se apaga desde aqui, no solo desde el trigger
    if (aiSettings && (settings.is_active === false || settings.auto_response_enabled === false)) {
      return new Response(JSON.stringify({ skipped: true, reason: 'ia_desactivada' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Fase 0.4: candado de idempotencia ----------------------------------
    // El indice unico parcial sobre (conversation_id, trigger_message_id) hace
    // que dos invocaciones concurrentes no puedan generar dos respuestas.
    if (messageId) {
      const { data: job, error: jobError } = await supabase
        .from('ai_jobs')
        .insert({
          organization_id: organizationId,
          conversation_id: conversationId,
          trigger_message_id: messageId,
          job_type: 'auto_response',
          status: 'processing',
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (jobError) {
        // 23505 = ya hay un job para este mensaje: otra invocacion se nos adelanto.
        if ((jobError as any).code === '23505') {
          return new Response(JSON.stringify({ skipped: true, reason: 'job_duplicado' }), {
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        console.error('No se pudo crear ai_jobs:', jobError.message);
      } else {
        jobId = job?.id ?? null;
      }
    }

    // --- Fase 0.4: debounce --------------------------------------------------
    // Si el cliente manda 3 mensajes seguidos, esperamos la ventana configurada
    // y solo responde la invocacion del ultimo mensaje.
    const delaySegundos = Math.max(0, Math.min(60, settings.auto_response_delay_seconds ?? 0));
    if (delaySegundos > 0 && messageId) {
      await new Promise((r) => setTimeout(r, delaySegundos * 1000));

      const { data: msgDisparador } = await supabase
        .from('messages')
        .select('created_at')
        .eq('id', messageId)
        .single();

      if (msgDisparador) {
        const { data: posteriores } = await supabase
          .from('messages')
          .select('id')
          .eq('conversation_id', conversationId)
          .eq('role', 'customer')
          .gt('created_at', msgDisparador.created_at)
          .limit(1);
        if (posteriores && posteriores.length > 0) {
          await finalizarJob(jobId, {
            status: 'skipped',
            error_code: 'superseded',
            error_message: 'Llego un mensaje posterior del cliente; responde esa invocacion.',
            completed_at: new Date().toISOString(),
          });
          return new Response(JSON.stringify({ skipped: true, reason: 'mensaje_superado' }), {
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    const { data: messages } = await supabase
      .from('messages')
      .select('id, content, content_type, direction, role, created_at, metadata')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(20);
    const recentMessages = (messages || []).reverse();
    if (recentMessages.length === 0) {
      await finalizarJob(jobId, {
        status: 'skipped', error_code: 'sin_mensajes', completed_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ skipped: true, reason: 'sin_mensajes' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Fase 0.3: en hybrid, el humano manda ---------------------------------
    const pausaMinutos = settings.hybrid_agent_pause_minutes ?? 30;
    let minutosDesdeUltimoAgente: number | null = null;
    if (aiMode === 'hybrid') {
      const { data: ultimoAgente } = await supabase
        .from('messages')
        .select('created_at')
        .eq('conversation_id', conversationId)
        .eq('role', 'agent')
        .order('created_at', { ascending: false })
        .limit(1);
      if (ultimoAgente && ultimoAgente.length > 0) {
        minutosDesdeUltimoAgente =
          (Date.now() - new Date(ultimoAgente[0].created_at).getTime()) / 60_000;
      }
    }

    const motivoSilencio = decidirSilencio({
      aiMode,
      iaActiva: settings.is_active !== false,
      autoRespuestaActiva: settings.auto_response_enabled !== false,
      minutosDesdeUltimoAgente,
      pausaPorAgenteMinutos: pausaMinutos,
      // Opt-in: default false para no silenciar los canales que hoy responden siempre.
      respetarHorarioLaboral: settings.hybrid_respect_business_hours === true,
      horario: channelData.business_hours ?? null,
    });

    if (motivoSilencio) {
      await finalizarJob(jobId, {
        status: 'skipped',
        error_code: motivoSilencio,
        completed_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ skipped: true, reason: motivoSilencio }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Fase 0.2: sin creditos no se llama al modelo -------------------------
    const creditosDisponibles = (aiSettings as any)?.credits_remaining ?? null;
    if (creditosDisponibles !== null && creditosDisponibles <= 0) {
      let mensajeEnviado = false;
      if (settings.reply_fallback_on_no_credits === true && settings.fallback_message) {
        await supabase.from('messages').insert({
          organization_id: organizationId,
          conversation_id: conversationId,
          channel_id: conv.channel_id,
          direction: 'outbound',
          role: 'ai',
          content_type: 'text',
          content: settings.fallback_message,
          is_read: true,
          metadata: { source: 'auto_response_fase0', reason: 'sin_creditos' },
        });
        mensajeEnviado = true;
      }
      await finalizarJob(jobId, {
        status: 'skipped',
        error_code: 'no_credits',
        error_message: 'La organizacion se quedo sin creditos de IA.',
        completed_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ skipped: true, reason: 'no_credits', fallbackEnviado: mensajeEnviado }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const lastCustomerMessage = [...recentMessages].reverse().find(m => m.role === 'customer');
    const lastAiMsg = [...recentMessages].reverse().find(m => m.direction === 'outbound');
    const lastAiContent = (lastAiMsg?.content || '').toLowerCase();

    if (lastCustomerMessage?.content) {
      classifyAndTagConversation(conversationId, organizationId, lastCustomerMessage.content);

      // Detect and update customer data from message (email, phone, name, address)
      if (conv.customer_id) {
        const msg = lastCustomerMessage.content;
        const msgNorm = msg.replace(/(\d)\s+(\d)/g, '$1$2'); // join split numbers: "57320 2381311" → "573202381311"
        const emailMatch = msg.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
        const phoneMatch = msgNorm.match(/\b(?:57)?3\d{9}\b/) || msgNorm.match(/\b\d{7,10}\b/);
        if (emailMatch || phoneMatch) {
          const parts = msg.split(/[,\n]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 0);
          const updateData: any = {};
          let nameCandidate = '';
          let detectedEmail = '';
          for (const part of parts) {
            const emailInPart = part.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
            if (emailInPart) {
              detectedEmail = emailInPart[0];
            } else if (/^\d{7,12}$/.test(part.replace(/\s/g, ''))) {
              let ph = part.replace(/\s/g, '');
              if (ph.length === 12 && ph.startsWith('57')) ph = ph.slice(2); // 573001234567 → 3001234567
              updateData.phone = ph;
            } else if (!nameCandidate && /^[A-ZÁÉÍÓÚÑa-záéíóúñ\s]{3,}$/.test(part) && !/(calle|carrera|avenida|cra|cl|av|#|\d{2,})/i.test(part)) {
              nameCandidate = part;
            } else if (/(calle|carrera|cra|cl|av|#|diagonal|transversal|\d+\s*#)/i.test(part)) {
              updateData.address = part;
            } else if (/^[A-ZÁÉÍÓÚÑa-záéíóúñ\s]{3,}$/.test(part) && nameCandidate && !updateData.city) {
              updateData.city = part;
            }
          }
          if (!updateData.phone && phoneMatch) {
            let ph = phoneMatch[0];
            if (ph.length === 12 && ph.startsWith('57')) ph = ph.slice(2);
            updateData.phone = ph;
          }
          if (!detectedEmail && emailMatch) detectedEmail = emailMatch[0];
          if (nameCandidate) {
            const nameParts = nameCandidate.split(' ');
            updateData.first_name = nameParts[0];
            updateData.last_name = nameParts.slice(1).join(' ') || '';
          }
          // Merge: find existing real customer by email and link
          if (detectedEmail && !detectedEmail.includes('@widget.local')) {
            const { data: realCustomer } = await supabase
              .from('customers').select('id, first_name, phone, address')
              .eq('organization_id', organizationId)
              .eq('email', detectedEmail)
              .maybeSingle();
            if (realCustomer && realCustomer.id !== conv.customer_id) {
              updateData.metadata = { ...(conv.customer?.metadata || {}), real_email: detectedEmail, linked_customer_id: realCustomer.id };
              // Sync data to real customer
              const realUpd: any = { last_seen_at: new Date().toISOString() };
              if (updateData.first_name) { realUpd.first_name = updateData.first_name; realUpd.last_name = updateData.last_name || ''; }
              if (updateData.phone) realUpd.phone = updateData.phone;
              if (updateData.address) realUpd.address = updateData.address;
              if (updateData.city) realUpd.city = updateData.city;
              await supabase.from('customers').update(realUpd).eq('id', realCustomer.id);
            } else {
              updateData.metadata = { ...(conv.customer?.metadata || {}), real_email: detectedEmail };
            }
          }
          // Update visitor customer fields (name, phone, address - never email)
          if (Object.keys(updateData).length > 0) {
            await supabase.from('customers').update(updateData).eq('id', conv.customer_id);
          }
        }
      }
    }

    let imageAnalysis = '';
    let imageKeywords: string[] = [];
    if (lastCustomerMessage?.content_type === 'image' || lastCustomerMessage?.metadata?.imageUrl) {
      const imgUrl = lastCustomerMessage?.metadata?.imageUrl || lastCustomerMessage?.content;
      if (imgUrl && imgUrl.startsWith('http')) {
        try {
          const visionCompletion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'Describe este producto/imagen en español. Si es un electrodoméstico o producto, identifica: marca, modelo, tipo de producto y color. Sé breve y específico. Incluye palabras clave para buscar este producto en un catálogo.' },
                  { type: 'image_url', image_url: { url: imgUrl, detail: 'low' } }
                ]
              }
            ],
            max_tokens: 200,
          });
          imageAnalysis = visionCompletion.choices[0]?.message?.content || '';
          if (imageAnalysis) {
            // La descripcion que devuelve el modelo se trata como una consulta
            // mas: las palabras candidatas salen de ahi y quien decide si nombran
            // algo del catalogo es `palabras_de_catalogo()`. Las listas de marcas
            // (samsung|lg|mabe...) y de electrodomesticos que habia aqui dejaban
            // fuera cualquier foto de un perfume, un medicamento o unos tenis.
            imageKeywords = decidirBusquedaCatalogo(imageAnalysis).tokens.slice(0, 5);
          }
        } catch (e) {
          console.error('Error vision:', e);
        }
      }
    }

    const emailFromChat = extractEmailFromMessages(recentMessages);

    const { data: quickReplies } = await supabase
      .from('quick_replies')
      .select('title, content')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .limit(20);

    const { data: knowledgeFragments } = await supabase
      .from('knowledge_fragments')
      .select('title, content, tags')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .limit(10);

    const customerName = conv.customer?.full_name || 
      `${conv.customer?.first_name || ''} ${conv.customer?.last_name || ''}`.trim() || 'Cliente';
    const customerEmail = conv.customer?.email || null;
    const customerId = conv.customer?.id || null;
    
    // Detect if conversation is in order-taking phase (collecting customer data)
    const lastUserMsg = (lastCustomerMessage?.content || '').toLowerCase().trim();
    const last4 = recentMessages.slice(-4);

    // Detect product selection: user sends a product name from previously shown cards
    const userSelectingProduct = (() => {
      if (!lastUserMsg || lastUserMsg.length < 4) return false;
      const aiWithProducts = last4.filter(m => m.direction === 'outbound' && m.metadata?.products?.length > 0);
      if (aiWithProducts.length === 0) return false;
      for (const aiMsg of aiWithProducts) {
        const productNames = aiMsg.metadata.products.map((p: any) => (p.name || '').toLowerCase());
        if (productNames.some((name: string) => lastUserMsg.includes(name) || name.includes(lastUserMsg))) return true;
      }
      if (lastUserMsg.includes(',')) {
        const parts = lastUserMsg.split(',').map(s => s.trim()).filter(s => s.length > 5);
        for (const aiMsg of aiWithProducts) {
          const productNames = aiMsg.metadata.products.map((p: any) => (p.name || '').toLowerCase());
          if (parts.some(part => productNames.some((name: string) => name.includes(part) || part.includes(name)))) return true;
        }
      }
      // Decision phrases + word overlap with previously shown products (e.g. "solo quiero la nevera", "me llevo esa", "la primera")
      const decisionPhrase = /\b(solo quiero|me llevo|me quedo con|quiero (la|el|ese|esa|esta|este)|deseo (la|el)|voy a llevar|dame (la|el)|esa esta bien|esa está bien|la primera|la segunda|la tercera|el primero|el segundo|el tercero|opci[oó]n \d)\b/i.test(lastUserMsg);
      if (decisionPhrase) {
        const userWords = lastUserMsg.normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/).filter(w => w.length > 3);
        for (const aiMsg of aiWithProducts) {
          const productNames = aiMsg.metadata.products.map((p: any) => (p.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
          if (userWords.some(w => productNames.some((name: string) => name.includes(w)))) return true;
        }
        // Ordinal selection ("la primera", "opción 2") without product words also counts
        if (/\b(la primera|la segunda|la tercera|el primero|el segundo|el tercero|opci[oó]n \d)\b/i.test(lastUserMsg)) return true;
      }
      return false;
    })();

    // isOrderPhase: blocks product search entirely (AI is collecting customer data)
    const isOrderPhase = (() => {
      // Solo verbos de intencion, que valen para cualquier vertical. La lista de
      // electrodomesticos que habia aqui no servia para la perfumeria, la
      // drogueria, la licorera ni la tienda de tenis; que la palabra nombre un
      // producto lo decide el catalogo de la organizacion, no una regex.
      const productInquiry = /\b(tienes|tienen|hay|busco|quiero|necesito|muestr|ver|enseñ|catalog|product|ofert|promo|precio|vale|cuesta|disponible)/i.test(lastUserMsg);
      if (productInquiry || userSelectingProduct) return false;

      const orderPhrases = ['nombre completo', 'teléfono', 'dirección', 'tipo de entrega', 'método de pago', 'domicilio', 'datos para', 'confirmar pedido', 'resumen del pedido', 'deseas agregar algo más', 'algo más a tu pedido', 'todo está correcto', 'todo esta correcto', 'resumen de tu pedido', 'finalizar el pedido', 'procesar tu pedido', 'procesado con éxito', 'pedido ha sido', 'correo electrónico'];
      const lastAiAskedForData = orderPhrases.some(p => lastAiContent.includes(p));
      const userMsgs = last4.filter(m => m.direction === 'inbound').map(m => (m.content || '').toLowerCase().trim());
      const doneExact = ['no', 'listo', 'confirmo', 'confirmar', 'correcto'];
      const doneContains = ['no mas', 'no más', 'eso es todo', 'solo eso', 'no gracias', 'con eso', 'eso nada mas', 'eso nada más', 'no quiero más', 'no quiero mas', 'ya no', 'nada mas', 'nada más', 'esta bien', 'está bien'];
      const userConfirmedDone = userMsgs.some(msg => {
        if (msg.length > 50) return false; // Product names are long, skip them
        if (doneExact.includes(msg)) return true;
        return doneContains.some(p => msg.includes(p));
      });
      return lastAiAskedForData || userConfirmedDone;
    })();

    // Detect support/tracking intent - should NOT show product cards
    const isSupportQuery = (() => {
      if (!lastCustomerMessage?.content) return false;
      const msg = lastCustomerMessage.content.toLowerCase();
      return /no.+(lleg|recibi|mand|envi)|d(o|ó)nde.+(pedido|orden|paquete)|estado.+(pedido|orden)|gu(i|í)a.+(env|ped)|reclam|quej|devoluci|devolv|reembolso|problema|hice.+pedido|ya.+pagu|ya.+compr|todav(i|í)a.+esper|llevo.+esper|mi.+compra.+(que|ya|hace)|mes.+(esper|ped|compr)|cuándo.+(lleg|envi)|cuando.+(lleg|envi)|garantía|garantia|dañad|danad|defectuos|no funciona|no sirve|no prende|no enciende|cancelar.+(pedido|orden|compra)|cambiar.+(pedido|producto)|error|falla|mal estado|roto|incompleto|equivocad|frustra|lament|molest|insatisf|inconform|pésim|pesim|demora|demorad|retras/.test(msg);
    })();

    // Detect simple messages (greetings, closings, acknowledgements) - no product cards
    const isSimpleMessage = (() => {
      if (!lastUserMsg || lastUserMsg.length > 40) return false;
      return /^(ok|listo|dale|bueno|vale|gracias|ok gracias|muchas gracias|hola|buenas|buenos d[ií]as|buenas tardes|buenas noches|buenas? tarde|si|sí|no|claro|perfecto|entendido|de acuerdo|ya)(\s|$)/i.test(lastUserMsg.trim());
    })();

    // skipProductCards: search products for AI context but don't show visual cards
    const skipProductCards = userSelectingProduct || isOrderPhase || isSupportQuery || isSimpleMessage;

    // --- ¿Hay que consultar el catalogo? -------------------------------------
    // Antes se buscaba con casi cualquier palabra: el 45% de las busquedas no
    // encontraba nada y las palabras que mas fallaban eran "pago", "entrega",
    // "estafadores"... incluso un correo y un telefono. En 342 respuestas se
    // mostraron tarjetas de producto sobre mensajes de reclamo.
    let keywords: string[] = [];
    let motivoSinBusqueda: string | null = null;

    if (isOrderPhase) {
      motivoSinBusqueda = 'tomando_datos_del_pedido';
    } else {
      const texto = lastCustomerMessage?.content_type !== 'image'
        ? (lastCustomerMessage?.content || '')
        : '';
      const decision = decidirBusquedaCatalogo(texto);

      if (decision.buscar) {
        keywords = decision.tokens;
      } else {
        motivoSinBusqueda = decision.motivo;
      }

      // Lo que se reconocio en una imagen si es una consulta de producto, aunque
      // el texto que la acompaña sea un saludo.
      if (imageKeywords.length > 0) {
        keywords = [...new Set([...keywords, ...imageKeywords])].slice(0, 8);
        motivoSinBusqueda = null;
      }

      // Sin palabras propias, se hereda el hilo: de que se venia hablando.
      if (keywords.length === 0 && !motivoSinBusqueda) {
        const historyKw = extractHistoryKeywords(recentMessages);
        const assistantKw = historyKw.length > 0 ? [] : extractAssistantProductKeywords(recentMessages);
        keywords = [...new Set([...historyKw, ...assistantKw])].slice(0, 8);
      }
    }

    if (motivoSinBusqueda) {
      console.log(`Sin busqueda de catalogo (${motivoSinBusqueda}) en conversacion ${conversationId}`);
    }
    
    // When user is selecting a product, reuse products from previous AI message metadata
    let productsFromPreviousCards: {text: string, products: any[]} | null = null;
    if (userSelectingProduct) {
      const aiWithProducts = recentMessages.filter(m => m.direction === 'outbound' && m.metadata?.products?.length > 0);
      const lastAiWithProducts = aiWithProducts[aiWithProducts.length - 1];
      if (lastAiWithProducts?.metadata?.products) {
        const prods = lastAiWithProducts.metadata.products;
        let text = '';
        for (const p of prods) {
          const price = p.price ? `$${Number(p.price).toLocaleString('es-CO')}` : 'Precio no disponible';
          const comparePrice = p.comparePrice && Number(p.comparePrice) > Number(p.price) ? ` (precio anterior tachado: $${Number(p.comparePrice).toLocaleString('es-CO')}, NO usar)` : '';
          const stockText = p.stock !== null && p.stock !== undefined ? ` | Stock: ${p.stock}` : ' | Stock: disponible';
          text += `- **${p.name}** | PRECIO DE VENTA: ${price}${comparePrice}${stockText}\n`;
        }
        productsFromPreviousCards = { text, products: prods };
      }
    }

    const [categoriesText, productsResult, ordersText, orgInfo, checkoutConfig] = await Promise.all([
      getCategories(organizationId),
      productsFromPreviousCards ? Promise.resolve(productsFromPreviousCards) : searchProducts(organizationId, keywords),
      getCustomerOrders(organizationId, customerEmail, customerId, emailFromChat),
      getOrganizationInfo(organizationId),
      getCheckoutConfig(organizationId),
    ]);

    let systemPrompt = '';
    
    if (settings.system_rules) {
      systemPrompt = `INSTRUCCIONES PRINCIPALES:\n${settings.system_rules}\n\nIMPORTANTE: \"Dar solución\" significa ayudar con información REAL del catálogo o redirigir al cliente. NUNCA inventes estados de pedidos, números de seguimiento, tiempos de entrega ni información que no tengas. Si no tienes datos reales, pregunta al cliente o sugiere contactar por otro medio.\n\n`;
    }
    
    systemPrompt += `FORMATO DE RESPUESTA:\n- Usa saltos de línea (\\n) para separar ideas.\n- IMPORTANTE: Los productos se muestran AUTOMÁTICAMENTE como tarjetas visuales con imagen, nombre y precio. NO listes los productos como texto. Solo escribe un mensaje introductorio breve como "Aquí te muestro las opciones:" o "Tenemos estos disponibles:" y las tarjetas se mostrarán solas.\n- NO uses formato [IMG:url]. Las imágenes se muestran automáticamente en las tarjetas.\n- Usa **negritas** solo para datos importantes que NO sean productos.\n- Sé conciso y conversacional.\n- Máximo 3-4 productos por respuesta.\n\n`;
    
    systemPrompt += `TIENDA:\n- Nombre: ${orgInfo.name || 'Tienda'}\n`;
    if (orgInfo.domain) {
      systemPrompt += `- Web: https://${orgInfo.domain}\n- Productos: https://${orgInfo.domain}/productos\n- Ofertas: https://${orgInfo.domain}/ofertas\n- Checkout: https://${orgInfo.domain}/checkout\n`;
    }
    systemPrompt += `\nTU ROL: Eres un asistente de ventas. Toma el pedido del cliente de forma conversacional. Cuando el cliente quiera un producto, muéstralo. Cuando confirme qué quiere, recopila sus datos y confirma el pedido.\n\nPRECIOS: SIEMPRE usa el "PRECIO DE VENTA" indicado en el catálogo. NUNCA uses el "precio anterior tachado" como precio real. Si el cliente pregunta por el precio, responde SOLO con el precio de venta. No te contradigas ni corrijas el precio a menos que haya cambiado en el catálogo.\n\n`;
    // Add checkout config context
    const deliveryLabels: Record<string, string> = { pickup: 'Recoger en tienda', delivery_own: 'Domicilio (delivery propio)', delivery_third_party: 'Envío por transportadora' };
    const availableDeliveries = checkoutConfig.deliveryTypes.map(d => deliveryLabels[d] || d).join(', ');
    const payMethodNames = checkoutConfig.paymentMethods.map(m => m.name).join(', ');
    const onlyPickup = checkoutConfig.deliveryTypes.length === 1 && checkoutConfig.deliveryTypes[0] === 'pickup';
    const hasPickup = checkoutConfig.deliveryTypes.includes('pickup');
    const hasDelivery = checkoutConfig.deliveryTypes.some(d => d === 'delivery_own' || d === 'delivery_third_party');
    const onlyDelivery = hasDelivery && !hasPickup;
    systemPrompt += `CONFIGURACIÓN DE PEDIDOS:\n- Tipos de entrega: ${availableDeliveries}\n`;
    if (checkoutConfig.shippingEnabled && hasDelivery) {
      systemPrompt += `- Costo de envío: $${checkoutConfig.shippingRate.toLocaleString()}\n- Envío gratis en compras desde: $${checkoutConfig.freeShippingThreshold.toLocaleString()}\n`;
    }
    if (checkoutConfig.taxRate > 0) {
      systemPrompt += `- Impuesto: ${checkoutConfig.taxName} ${checkoutConfig.taxRate}%${checkoutConfig.taxIncluded ? ' (incluido en precio)' : ' (se suma al subtotal)'}\n`;
    }
    systemPrompt += `- Métodos de pago: ${payMethodNames}\n\n`;
    // Build dynamic order flow
    let flowSteps = `FLUJO DE PEDIDO:\n1. El cliente pregunta por productos → Muestra las opciones (las tarjetas se muestran automáticamente)\n2. El cliente elige → Confirma el producto y pregunta: "¿Deseas agregar algo más?"\n`;
    if (onlyPickup) {
      flowSteps += `3. Cuando el cliente confirme que no quiere más → Pregunta SOLO: nombre completo, teléfono y correo electrónico. La entrega es SIEMPRE recoger en tienda, NO preguntes tipo de entrega ni dirección.\n`;
      flowSteps += `4. Pregunta método de pago (${payMethodNames})\n`;
      flowSteps += `5. Calcula y muestra resumen con los PRECIOS REALES de los productos (usa los precios de la lista de productos):\n`;
    } else if (onlyDelivery) {
      flowSteps += `3. Cuando el cliente confirme que no quiere más → Pregunta: nombre completo, teléfono, correo electrónico, dirección y ciudad. NO preguntes tipo de entrega porque SOLO hay envío (no hay opción de recoger en tienda).\n`;
      flowSteps += `4. Pregunta método de pago (${payMethodNames})\n`;
      flowSteps += `5. Calcula y muestra resumen con los PRECIOS REALES:\n`;
    } else {
      flowSteps += `3. Cuando el cliente confirme que no quiere más → Pregunta: nombre completo, teléfono, correo electrónico y tipo de entrega (${availableDeliveries})\n`;
      flowSteps += `4. Si elige domicilio o transportadora → Pide dirección y ciudad\n`;
      flowSteps += `5. Pregunta método de pago (${payMethodNames})\n`;
      flowSteps += `6. Calcula y muestra resumen con los PRECIOS REALES:\n`;
    }
    flowSteps += `   - Producto(s): SIEMPRE lista el NOMBRE COMPLETO de cada producto seleccionado con su precio (ej: "Nevera HACEB 404 Lt: $289,000")\n`;
    flowSteps += `   - Subtotal: suma los precios REALES × cantidad de cada producto seleccionado (NUNCA escribas texto como "(suma de precios)", calcula el número)\n`;
    if (checkoutConfig.taxRate > 0) {
      flowSteps += `   - ${checkoutConfig.taxName} ${checkoutConfig.taxRate}%${checkoutConfig.taxIncluded ? ' (incluido)' : ''}\n`;
    }
    if (checkoutConfig.shippingEnabled && hasDelivery) {
      flowSteps += `   - Envío: $${checkoutConfig.shippingRate.toLocaleString()} (gratis si subtotal >= $${checkoutConfig.freeShippingThreshold.toLocaleString()})\n`;
    }
    flowSteps += `   - **Total**: la suma final en pesos\n`;
    const confirmStep = onlyPickup ? '6' : onlyDelivery ? '6' : '7';
    flowSteps += `${confirmStep}. Cuando el cliente confirme el resumen, incluye AL FINAL de tu respuesta estas etiquetas EXACTAS en líneas separadas:\n[DATOS_CLIENTE:nombre_completo|telefono|email|direccion|ciudad]\n[PEDIDO_LISTO]\nEjemplo: [DATOS_CLIENTE:Juan Pérez|3001234567|juan@email.com|Calle 123 #45-67|Bogotá]\nUSA LOS DATOS REALES que el cliente proporcionó durante la conversación. Si algún dato no se proporcionó, deja el campo vacío entre los pipes.\n\n`;
    flowSteps += `REGLAS IMPORTANTES:\n- [PEDIDO_LISTO] es OBLIGATORIA cuando el cliente confirma. Sin ella no se crea el pedido.\n- NO uses formularios. TODO es por conversación natural.\n- SIEMPRE calcula los totales con NÚMEROS REALES, nunca con texto placeholder.\n- Una vez el cliente confirme sus productos, NO vuelvas a listar ni sugerir otros productos.\n- Enfócate ÚNICAMENTE en recopilar datos del pedido después de elegir productos.\n- MÉTODOS DE PAGO: Solo ofrece EXACTAMENTE estos: ${payMethodNames}. NO inventes ni menciones otros métodos de pago que no estén en esta lista.\n- STOCK: Si un producto aparece en la lista de PRODUCTOS abajo con stock > 0, ESTÁ DISPONIBLE para la venta. Solo di que NO está disponible si el stock es 0. NUNCA inventes que un producto no está disponible si tiene stock.\n- En la respuesta de confirmación (cuando incluyes [PEDIDO_LISTO]), REPITE el nombre completo y precio de cada producto del pedido.\n\n`;
    systemPrompt += flowSteps;
    
    systemPrompt += `PEDIDOS: Si preguntan por su pedido, pide el correo. Si ya dieron email, usa los datos de abajo.\n`;
    if (emailFromChat) systemPrompt += `Email detectado: ${emailFromChat}\n`;
    systemPrompt += `\n`;
    
    if (imageAnalysis) {
      systemPrompt += `IMAGEN RECIBIDA DEL CLIENTE:\nAnálisis: ${imageAnalysis}\n\nINSTRUCCIÓN IMPORTANTE: Verifica si este producto EXISTE en la lista de PRODUCTOS de abajo. Si encuentras el mismo producto o modelo en la lista, confirma que SÍ lo tenemos disponible, muestra su precio e imagen con [IMG:url]. Si NO existe en la lista, ofrece alternativas similares del catálogo.\n\n`;
    }
    
    systemPrompt += `Cliente: ${customerName} | Canal: ${conv.channel?.type || 'chat'}\n\n`;

    if (categoriesText || productsResult.text || ordersText) {
      systemPrompt += `DATOS DEL INVENTARIO REAL Y DISPONIBLE:\n\n`;
      if (categoriesText) systemPrompt += `CATEGORÍAS: ${categoriesText}\n\n`;
      if (productsResult.text) systemPrompt += `PRODUCTOS ENCONTRADOS EN BÚSQUEDA ACTUAL:\n${productsResult.text}\n`;
      if (ordersText) systemPrompt += `PEDIDOS DEL CLIENTE:\n${ordersText}\n`;
      systemPrompt += `\nREGLAS CRÍTICAS:\n- Si un producto aparece en la lista de arriba, SÍ lo tenemos disponible. Confirma su disponibilidad y precio.\n- CAMBIO DE TEMA: Si el cliente pregunta por un producto DIFERENTE al que se venía hablando, responde sobre el NUEVO producto. No sigas hablando del producto anterior.\n- Si buscamos un producto nuevo y NO aparece en la lista de arriba, di honestamente que no lo tenemos disponible actualmente y ofrece alternativas si hay.\n- Si el cliente se refiere al MISMO producto que ya mostraste antes, confirma que sigue disponible.\n- Usa [IMG:url] para mostrar imágenes de productos del catálogo.\n- NO inventes productos que no estén en la lista.\n\n`;
    } else {
      systemPrompt += `\nREGLAS CRÍTICAS (SIN RESULTADOS EN BÚSQUEDA):\n- SALUDO: Si el cliente dice \"Hola\", \"Buenos días\", \"Buenas\" o cualquier saludo, responde con un saludo amable y pregunta en qué puedes ayudar. NO menciones pedidos, envíos ni productos sin que te pregunten.\n- CAMBIO DE TEMA: Si el cliente pregunta por un producto NUEVO y no hay resultados, informa honestamente que no lo tenemos.\n- NO INVENTAR: Nunca inventes estados de pedidos, envíos ni información ficticia.\n- Si el cliente se refiere al MISMO producto que ya mostraste antes, confirma que sigue disponible.\n\n`;
    }

    if ((quickReplies && quickReplies.length > 0) || (knowledgeFragments && knowledgeFragments.length > 0)) {
      systemPrompt += `REFERENCIA:\n`;
      if (quickReplies) for (const qr of quickReplies) systemPrompt += `- ${qr.title}: ${qr.content}\n`;
      if (knowledgeFragments) for (const kf of knowledgeFragments) systemPrompt += `- ${kf.title}: ${kf.content}\n`;
      systemPrompt += '\n';
    }
    
    systemPrompt += `RECORDATORIO FINAL: Responde SIEMPRE sobre lo que el cliente pregunta AHORA. Si pregunta por un producto nuevo, enfócate en ese. Si no lo encontramos, dilo honestamente. Si se refiere a uno ya mostrado, confirma disponibilidad. Si saluda, responde el saludo. Formato legible. Usa [IMG:url] para mostrar productos.`;

    const chatMessages: Array<any> = [
      { role: 'system', content: systemPrompt }
    ];
    
    for (const msg of recentMessages) {
      const role = msg.role === 'customer' ? 'user' : 'assistant';
      if (msg.content_type === 'image' || msg.metadata?.imageUrl) {
        const imgUrl = msg.metadata?.imageUrl || msg.content;
        if (role === 'user' && imgUrl && imgUrl.startsWith('http')) {
          chatMessages.push({
            role: 'user',
            content: [
              { type: 'text', text: msg.metadata?.caption || msg.content || 'El cliente envió esta imagen:' },
              { type: 'image_url', image_url: { url: imgUrl, detail: 'low' } }
            ]
          });
        } else {
          chatMessages.push({ role, content: msg.content || '' });
        }
      } else {
        chatMessages.push({ role, content: msg.content || '' });
      }
    }

    const hasImage = recentMessages.some(m => m.content_type === 'image' || m.metadata?.imageUrl);
    const temperatura = parseFloat(String(settings.temperature)) || 0.7;
    const maxTokens = settings.max_tokens || 600;

    // La vision va SIEMPRE por gpt-4o, independientemente del proveedor elegido:
    // es el unico modelo del catalogo con soporte de imagen confirmado.
    let proveedor = hasImage ? 'openai' : ((settings as any).provider || 'openai');
    let model = hasImage ? 'gpt-4o' : (settings.model || 'gpt-5.6-luna');

    let respuesta: RespuestaLlm;

    if (proveedor === 'google') {
      const claveGoogle = await credencialProveedor(organizationId, 'google', ['GOOGLE_AI_API_KEY', 'GEMINI_API_KEY']);
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
        model = 'gpt-5.6-luna';
        respuesta = await conReintentos(() =>
          generarConOpenAI(model, chatMessages, temperatura, maxTokens)
        );
      }
    } else {
      respuesta = await conReintentos(() =>
        generarConOpenAI(model, chatMessages, temperatura, maxTokens)
      );
    }

    let responseContent = respuesta.content || settings.fallback_message || 'Lo siento, no puedo responder en este momento.';

    // Fase 5.3: costo real contra provider_pricing. Devuelve null —no cero—
    // cuando el modelo no tiene tarifa cargada (gpt-4o y gpt-4o-mini, hoy).
    let costoUsd: number | null = null;
    try {
      // El modelo REAL que reporto el proveedor, no el configurado: si entro el
      // respaldo de emergencia son distintos, y cobrar por el configurado seria
      // una cifra falsa. `calcular_costo_llm` acepta el snapshot con fecha.
      const { data: costo } = await supabase.rpc('calcular_costo_llm', {
        p_model: respuesta.model || model,
        p_tokens_entrada: respuesta.promptTokens,
        p_tokens_salida: respuesta.completionTokens,
      });
      costoUsd = costo !== null && costo !== undefined ? Number(costo) : null;
    } catch (e) {
      console.error('No se pudo calcular el costo:', e);
    }

    // Compatibilidad con el resto del cuerpo, escrito contra la forma de OpenAI.
    const completion = { model: respuesta.model };
    const usage = {
      prompt_tokens: respuesta.promptTokens,
      completion_tokens: respuesta.completionTokens,
      total_tokens: respuesta.totalTokens,
    };

    // Detect [PEDIDO_LISTO] marker and build checkout redirect
    let orderAction: any = undefined;
    if (responseContent.includes('[PEDIDO_LISTO]')) {
      responseContent = responseContent.replace('[PEDIDO_LISTO]', '').trim();

      // Parse [DATOS_CLIENTE:nombre|telefono|email|direccion|ciudad]
      let customerInfo: any = {};
      const clienteMatch = responseContent.match(/\[DATOS_CLIENTE:([^\]]*)\]/);
      if (clienteMatch) {
        const parts = clienteMatch[1].split('|');
        const fullName = (parts[0] || '').trim();
        const nameParts = fullName.split(' ');
        customerInfo = {
          firstName: nameParts[0] || '',
          lastName: nameParts.slice(1).join(' ') || '',
          phone: (parts[1] || '').trim(),
          email: (parts[2] || '').trim(),
          address: (parts[3] || '').trim(),
          city: (parts[4] || '').trim(),
        };
        responseContent = responseContent.replace(clienteMatch[0], '').trim();
      }

      // Only match against the CURRENT response (the one with PEDIDO_LISTO that has the order summary)
      // Do NOT include previous AI messages as they contain full product listings that cause false matches
      const responseLower = responseContent.toLowerCase();
      const cartItems: any[] = [];
      const seenIds = new Set();
      const allProducts: any[] = [];
      for (const msg of recentMessages) {
        if (msg.direction === 'outbound' && msg.metadata?.products?.length > 0) {
          for (const p of msg.metadata.products) {
            if (p.id && !seenIds.has(p.id)) {
              seenIds.add(p.id);
              allProducts.push(p);
            }
          }
        }
      }
      // Match by word overlap: require 60%+ of significant words from product name in response
      for (const p of allProducts) {
        // Skip products with no stock
        if (p.stock !== null && p.stock !== undefined && Number(p.stock) <= 0) continue;
        // Skip if product is mentioned as "no disponible" in context
        const pNameLower = p.name.toLowerCase();
        const nameIdx = responseLower.indexOf(pNameLower);
        if (nameIdx >= 0) {
          const afterName = responseLower.substring(nameIdx + pNameLower.length, nameIdx + pNameLower.length + 50);
          if (afterName.includes('no disponible') || afterName.includes('agotad')) continue;
        }
        // Use words > 3 chars to avoid generic short words like "256", "GB", "5G" shared across similar products
        const nameWords = pNameLower.split(/[\s\-\/\(\)\+]+/).filter((w: string) => w.length > 3);
        const matchCount = nameWords.filter((w: string) => responseLower.includes(w)).length;
        const matchRatio = nameWords.length > 0 ? matchCount / nameWords.length : 0;
        if (responseLower.includes(pNameLower) || matchRatio >= 0.9) {
          cartItems.push({ productId: p.id, name: p.name, price: p.price, comparePrice: p.comparePrice, imageUrl: p.imageUrl, quantity: 1 });
        }
      }
      // Fallback: if no products matched by name, match by price mentioned in response
      if (cartItems.length === 0) {
        const priceMatches = responseLower.match(/\$[\d.,]+/g) || [];
        const mentionedPrices = priceMatches.map(p => Number(p.replace(/[$.,]/g, ''))).filter(n => n > 0);
        for (const p of allProducts) {
          if (p.price && mentionedPrices.includes(Number(p.price))) {
            cartItems.push({ productId: p.id, name: p.name, price: p.price, comparePrice: p.comparePrice, imageUrl: p.imageUrl, quantity: 1 });
          }
        }
      }
      // Update customer + merge with real customer if email matches
      if (conv.customer_id && (customerInfo.firstName || customerInfo.phone || customerInfo.address)) {
        const upd: any = {};
        if (customerInfo.firstName) { upd.first_name = customerInfo.firstName; upd.last_name = customerInfo.lastName || ''; }
        if (customerInfo.phone) upd.phone = customerInfo.phone;
        if (customerInfo.address) upd.address = customerInfo.address;
        if (customerInfo.city) upd.city = customerInfo.city;
        if (customerInfo.email && !customerInfo.email.includes('@widget.local')) {
          const { data: realCust } = await supabase
            .from('customers').select('id').eq('organization_id', organizationId)
            .eq('email', customerInfo.email).maybeSingle();
          if (realCust && realCust.id !== conv.customer_id) {
            upd.metadata = { ...(conv.customer?.metadata || {}), real_email: customerInfo.email, linked_customer_id: realCust.id };
            const rUpd: any = { last_seen_at: new Date().toISOString() };
            if (customerInfo.firstName) { rUpd.first_name = customerInfo.firstName; rUpd.last_name = customerInfo.lastName || ''; }
            if (customerInfo.phone) rUpd.phone = customerInfo.phone;
            if (customerInfo.address) rUpd.address = customerInfo.address;
            if (customerInfo.city) rUpd.city = customerInfo.city;
            await supabase.from('customers').update(rUpd).eq('id', realCust.id);
          } else {
            upd.metadata = { ...(conv.customer?.metadata || {}), real_email: customerInfo.email };
          }
        }
        if (Object.keys(upd).length > 0) {
          await supabase.from('customers').update(upd).eq('id', conv.customer_id);
        }
      }

      const checkoutDomain = orgInfo.domain ? `https://${orgInfo.domain}` : null;
      orderAction = {
        type: 'checkout_redirect',
        checkoutUrl: checkoutDomain ? `${checkoutDomain}/checkout` : null,
        cartItems,
        customerData: customerInfo,
        subdomain: orgInfo.subdomain || '',
        label: 'Completar Pedido',
      };
    }

    // --- Fase 0.2: cobro explicito de creditos ------------------------------
    // Unica fuente de verdad desde la Fase 0 (el trigger trg_consume_ai_credits_on_message
    // se elimino). decrement_ai_credits es atomico: hace SELECT ... FOR UPDATE.
    const creditosAntes = (aiSettings as any)?.credits_remaining ?? null;
    const { data: cobrado, error: errorCobro } = await supabase.rpc('decrement_ai_credits', {
      p_org_id: organizationId,
      p_cost: 1,
    });
    if (errorCobro) {
      console.error('Error cobrando creditos:', errorCobro.message);
    }
    if (cobrado === false) {
      await finalizarJob(jobId, {
        status: 'skipped',
        error_code: 'no_credits',
        error_message: 'Los creditos se agotaron mientras se generaba la respuesta.',
        prompt_tokens: usage?.prompt_tokens || 0,
        completion_tokens: usage?.completion_tokens || 0,
        completed_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ skipped: true, reason: 'no_credits' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (cobrado === true) {
      await supabase.from('ai_usage_logs').insert({
        organization_id: organizationId,
        action_type: 'auto_response',
        model: completion.model || model,
        prompt_tokens: usage?.prompt_tokens || 0,
        completion_tokens: usage?.completion_tokens || 0,
        total_tokens: usage?.total_tokens || 0,
        credits_consumed: 1,
        credits_before: creditosAntes,
        credits_after: creditosAntes !== null ? creditosAntes - 1 : null,
        cost_amount: costoUsd,
        metadata: {
          conversation_id: conversationId, job_id: jobId, source: 'ai-auto-response',
          provider: proveedor,
        },
      });
    }

    // --- Fase 0 (modo borrador por canal) ------------------------------------
    // El borrador NO puede insertarse en `messages`: trg_channel_dispatch enviaria
    // el mensaje a WhatsApp/Facebook/Instagram. Se guarda en el job y ya esta.
    // La UI para que el agente lo apruebe llega en la Fase 4.
    if (channelData.ai_draft_mode === true) {
      await finalizarJob(jobId, {
        status: 'draft',
        response_text: responseContent,
        prompt_tokens: usage?.prompt_tokens || 0,
        completion_tokens: usage?.completion_tokens || 0,
        total_cost: costoUsd,
        completed_at: new Date().toISOString(),
        metadata: { model: completion.model, provider: proveedor, order_action: orderAction ?? null },
      });
      return new Response(JSON.stringify({ success: true, draft: true, jobId }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: aiMessage } = await supabase
      .from('messages')
      .insert({
        organization_id: organizationId,
        conversation_id: conversationId,
        channel_id: conv.channel_id,
        direction: 'outbound',
        role: 'ai',
        content_type: 'text',
        content: responseContent,
        is_read: true,
        metadata: { 
          source: 'auto_response_v20', 
          model: completion.model, 
          tokens: usage?.total_tokens,
          products: (!skipProductCards && !orderAction && productsResult.products.length > 0) ? productsResult.products.slice(0, 6) : undefined,
          order_action: orderAction,
          context_used: {
            categories: !!categoriesText,
            products: !!productsResult.text,
            orders: !!ordersText,
            imageAnalysis: !!imageAnalysis,
            keywords,
            emailFromChat,
            domain: orgInfo.domain
          }
        }
      })
      .select()
      .single();

    // El job ya existe (se creo como candado antes de generar): aqui se cierra.
    if (jobId) {
      await finalizarJob(jobId, {
        result_message_id: aiMessage?.id,
        status: 'completed',
        response_text: responseContent,
        prompt_tokens: usage?.prompt_tokens || 0,
        completion_tokens: usage?.completion_tokens || 0,
        total_cost: costoUsd,
        completed_at: new Date().toISOString(),
      });
    } else {
      await supabase.from('ai_jobs').insert({
        organization_id: organizationId,
        conversation_id: conversationId,
        trigger_message_id: messageId,
        result_message_id: aiMessage?.id,
        job_type: 'auto_response',
        status: 'completed',
        response_text: responseContent,
        prompt_tokens: usage?.prompt_tokens || 0,
        completion_tokens: usage?.completion_tokens || 0,
        total_cost: costoUsd,
        completed_at: new Date().toISOString(),
      });
    }

    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString(), last_agent_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    return new Response(JSON.stringify({ success: true, messageId: aiMessage?.id, version: 20 }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    // Fase 0.4: los fallos dejaban de existir (ai_jobs solo se escribia al triunfar).
    console.error('Error en ai-auto-response:', error);
    await finalizarJob(jobId, {
      status: 'failed',
      error_code: String(error?.status ?? error?.code ?? 'error_interno'),
      error_message: String(error?.message ?? error).slice(0, 1000),
      completed_at: new Date().toISOString(),
    });
    if (!jobId && conversationId && organizationId) {
      try {
        await supabase.from('ai_jobs').insert({
          organization_id: organizationId,
          conversation_id: conversationId,
          trigger_message_id: messageId,
          job_type: 'auto_response',
          status: 'failed',
          error_code: String(error?.status ?? error?.code ?? 'error_interno'),
          error_message: String(error?.message ?? error).slice(0, 1000),
          completed_at: new Date().toISOString(),
        });
      } catch (e) {
        console.error('Tampoco se pudo registrar el fallo en ai_jobs:', e);
      }
    }
    return new Response(JSON.stringify({ error: 'Error interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
