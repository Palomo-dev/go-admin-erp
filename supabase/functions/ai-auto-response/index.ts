import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore: Deno URL import (resolves at runtime in Supabase Edge Functions)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore: Deno URL import (resolves at runtime in Supabase Edge Functions)
import OpenAI from "https://esm.sh/openai@4";
// Logica pura compartida (primer ladrillo del nucleo de la Fase 1). Se importa
// con extension .ts porque lo exige Deno; Jest la testea importandola sin ella.
import { decidirSilencio, secretosCoinciden } from "../_shared/ai-chat/politicaRespuesta.ts";
import { decidirBusquedaCatalogo, pareceSeguimientoDeVariante } from "../_shared/ai-chat/intencionConsulta.ts";
import { GUIA_TALLAS, ResumenVariantes, extraerMedidas, resumirVariantes } from "../_shared/ai-chat/variantesCatalogo.ts";
import { MAXIMO_PEDIDOS_MOSTRADOS, correoParaBuscar, decidirCorreoDelChat, escaparLike, esCorreoDelWidget, extraerNumeroDePedido, formatearFacturas, formatearPedidosWeb } from "../_shared/ai-chat/pedidosCliente.ts";
// Prompt y generacion: nucleo compartido con el Laboratorio de IA (/api/chat/ai/lab-test),
// para que la prueba responda exactamente como esta funcion. Extraidos literal el 2026-11-13.
import { cargarCheckoutConfig, cargarInfoOrganizacion, cargarVertical, construirContextoDinamico, construirPromptEstable, mensajesDeSistema, type ConfigCheckout, type InfoOrganizacion } from "../_shared/ai-chat/promptAtencion.ts";
import { generarSegunProveedor, usaResponsesApi, type RespuestaLlm } from "../_shared/ai-chat/generacionLlm.ts";
import { armarCarritoDelResumen, metodoPagoDelChat, subtotalDelCarrito, subtotalDelResumen } from "../_shared/ai-chat/pedidoDelChat.ts";

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

// La generacion vive en `_shared/ai-chat/generacionLlm.ts` (compartida con el
// Laboratorio de IA): credencial del proveedor (primero la de la organizacion,
// si no la global), eleccion de endpoint (Responses API / Chat Completions),
// respaldo de emergencia, Gemini y reintentos. Aqui solo se le pasan el
// cliente de OpenAI, el de Supabase y el entorno (`generarSegunProveedor`).

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

/**
 * Variantes reales (tallas, colores, presentaciones) de unos productos, ya
 * redactadas por producto padre. Antes el modelo solo sabia "hay 5
 * presentaciones" y, ante "talla 40", contestaba "no la tenemos" sin haber
 * visto ninguna.
 */
async function detalleDeVariantes(organizationId: number, ids: number[]): Promise<ResumenVariantes> {
  const vacio: ResumenVariantes = { porRaiz: new Map<number, string>(), hayTallas: false };
  if (ids.length === 0) return vacio;
  const { data: filas, error } = await supabase
    .rpc('variantes_de_productos', { p_org: organizationId, p_ids: ids, p_max_por_producto: 40 });
  if (error) {
    console.error('Error consultando variantes:', error.message);
    return vacio;
  }
  return resumirVariantes(filas || []);
}

/**
 * Medidas sacadas de la descripcion de cada producto ("30 x 20 cm", "1,5
 * litros"). La descripcion completa no cabe en el contexto; sus medidas si.
 */
async function medidasDeProductos(organizationId: number, ids: number[]): Promise<Map<number, string>> {
  const salida = new Map<number, string>();
  if (ids.length === 0) return salida;
  const { data, error } = await supabase
    .from('products')
    .select('id, description')
    .eq('organization_id', organizationId)
    .in('id', ids);
  if (error) {
    console.error('Error consultando descripciones:', error.message);
    return salida;
  }
  for (const fila of data || []) {
    const medidas = extraerMedidas(fila.description);
    if (medidas) salida.set(Number(fila.id), medidas);
  }
  return salida;
}

async function searchProducts(organizationId: number, keywords: string[]): Promise<{text: string, products: any[], hayTallas?: boolean}> {
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
      // storage_path puede ser una URL externa completa (catálogos importados): se usa tal cual.
      imageUrl: p.imagen
        ? (/^https?:\/\//i.test(p.imagen) ? p.imagen : `${supabaseUrl}/storage/v1/object/public/product-images/${p.imagen}`)
        : null,
      stock: p.stock !== null && p.stock !== undefined ? Number(p.stock) : null,
      presentaciones: p.presentaciones ?? 1,
    }));

    // Paso 3: las variantes reales (tallas, colores, presentaciones) de lo
    // encontrado.
    const [variantes, medidas] = await Promise.all([
      detalleDeVariantes(organizationId, products.map((p: any) => Number(p.id))),
      medidasDeProductos(organizationId, products.map((p: any) => Number(p.id))),
    ]);

    let text = '';
    for (const p of products) {
      const price = p.price ? `$${p.price.toLocaleString('es-CO')}` : 'Precio no disponible';
      const comparePrice = p.comparePrice && p.comparePrice > p.price
        ? ` (precio anterior tachado: $${p.comparePrice.toLocaleString('es-CO')}, NO usar este valor)` : '';
      const stockText = p.stock !== null ? ` | Stock: ${p.stock}` : '';
      // Las variantes van agrupadas: se le dice al modelo cuantas hay para que
      // pregunte por la presentacion en vez de listar la misma cosa seis veces.
      const detalleVariantes = variantes.porRaiz.get(Number(p.id));
      const presentaciones = p.presentaciones > 1 && !detalleVariantes
        ? ` | Disponible en ${p.presentaciones} presentaciones (pregunta cual quiere)` : '';
      text += `- **${p.name}** | PRECIO DE VENTA: ${price}${comparePrice}${stockText}${presentaciones}`;
      if (p.imageUrl) text += ` | Imagen: ${p.imageUrl}`;
      if (detalleVariantes) text += `\n  ${detalleVariantes}`;
      const medidasProducto = medidas.get(Number(p.id));
      if (medidasProducto) text += `\n  Medidas/capacidad (de la descripción): ${medidasProducto}`;
      text += '\n';
    }

    return { text, products, hayTallas: variantes.hayTallas };
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

/**
 * Pedidos del cliente para el contexto del bot.
 *
 * Bug que corrige (visto el 2026-09-14): una clienta con un pedido pagado y
 * facturado escribio su correo tres veces y el bot respondio "no puedo consultar
 * el estado del pedido". La causa: `email || emailFromChat` y `customerId`
 * tomaban SIEMPRE el registro del visitante anonimo del widget
 * (`visitor_...@widget.local`), que existe siempre y no tiene pedidos. El correo
 * que la clienta escribio nunca llegaba a usarse.
 *
 * Ademas solo miraba `invoice_sales`, donde solo estan los pedidos PAGADOS: en
 * la organizacion principal hay 2.139 pedidos en `web_orders` en 30 dias y solo
 * 272 facturas. Un pedido pendiente, cancelado o expirado —justo por el que un
 * cliente escribe preocupado— era invisible.
 *
 * Orden de busqueda:
 *   1. Numero de pedido escrito en el chat (WO-<org>-XXXX): el mas preciso.
 *   2. Correo escrito en el chat: lo que el cliente dijo manda sobre el
 *      registro anonimo de la conversacion.
 *   3. Cliente real enlazado a la conversacion (`metadata.linked_customer_id`).
 *   4. Correo real del cliente de la conversacion, si no es el ficticio del widget.
 */
async function getCustomerOrders(
  organizationId: number,
  email: string | null,
  customerId: string | null,
  emailFromChat: string | null,
  numeroDePedido: string | null = null,
  linkedCustomerId: string | null = null,
  zonaHoraria: string | null = null
): Promise<string> {
  try {

    // --- 1) Por numero de pedido ------------------------------------------
    if (numeroDePedido) {
      const { data: porNumero } = await supabase
        .from('web_orders')
        .select('order_number, status, payment_status, total, delivery_type, delivery_partner, created_at, confirmed_at, ready_at, delivered_at, cancelled_at, estimated_delivery_at, customer_email')
        .eq('organization_id', organizationId)
        .ilike('order_number', numeroDePedido)
        .limit(1);
      if (porNumero && porNumero.length > 0) {
        return formatearPedidosWeb(porNumero, `Pedido consultado por número: ${numeroDePedido}`, zonaHoraria);
      }
    }

    // --- 2) Por correo: primero el que escribio el cliente -------------------
    const correoReal = correoParaBuscar(emailFromChat, email);

    let texto = '';

    if (correoReal) {
      const { data: pedidosWeb } = await supabase
        .from('web_orders')
        .select('order_number, status, payment_status, total, delivery_type, delivery_partner, created_at, confirmed_at, ready_at, delivered_at, cancelled_at, estimated_delivery_at, customer_email')
        .eq('organization_id', organizationId)
        .ilike('customer_email', escaparLike(correoReal))
        .order('created_at', { ascending: false })
        // Uno mas del maximo, para poder avisar de que hay otros.
        .limit(MAXIMO_PEDIDOS_MOSTRADOS + 1);
      if (pedidosWeb && pedidosWeb.length > 0) {
        texto += formatearPedidosWeb(pedidosWeb, `Pedidos web asociados al correo ${correoReal}`, zonaHoraria);
      }
    }

    // --- 3) Facturas: por cliente enlazado, o por correo real ------------------
    let idParaFacturas: string | null = linkedCustomerId;
    if (!idParaFacturas && correoReal) {
      const { data: cust } = await supabase
        .from('customers')
        .select('id')
        .eq('organization_id', organizationId)
        .ilike('email', escaparLike(correoReal))
        .order('created_at', { ascending: true })
        .limit(1);
      if (cust && cust.length > 0) idParaFacturas = cust[0].id;
    }
    if (!idParaFacturas && customerId && !esCorreoDelWidget(email)) {
      idParaFacturas = customerId;
    }

    if (idParaFacturas) {
      const { data: facturas } = await supabase
        .from('invoice_sales')
        .select('number, total, status, created_at')
        .eq('organization_id', organizationId)
        .eq('customer_id', idParaFacturas)
        .order('created_at', { ascending: false })
        .limit(3);
      if (facturas && facturas.length > 0) {
        texto += formatearFacturas(facturas, zonaHoraria);
      }
    }

    return texto;
  } catch (e) {
    console.error('Error consultando pedidos:', e);
    return '';
  }
}

function getCheckoutConfig(organizationId: number): Promise<ConfigCheckout> {
  return cargarCheckoutConfig(supabase, organizationId);
}

function getOrganizationInfo(organizationId: number): Promise<InfoOrganizacion> {
  return cargarInfoOrganizacion(supabase, organizationId);
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
      .select('id, channel_id, customer_id, organization_id, organization:organizations(timezone), customer:customers(id, first_name, last_name, full_name, email, metadata)')
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

    // Chat › «Bloquear contacto» (2026-11-13): la IA no le responde a un
    // contacto bloqueado. El trigger `trigger_ai_auto_response` ya no invoca
    // esta funcion para sus mensajes; se comprueba otra vez por si llega por
    // otra via. Sin trabajo ni cobro.
    if (conv.customer_id) {
      const { data: bloqueo } = await supabase
        .from('chat_contactos_bloqueados')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('customer_id', conv.customer_id)
        .is('desbloqueado_en', null)
        .limit(1)
        .maybeSingle();
      if (bloqueo) {
        return new Response(JSON.stringify({ skipped: true, reason: 'contacto_bloqueado' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
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

    // --- Tope diario de respuestas por conversacion ---------------------------
    //
    // Ultima defensa de los creditos: actua aunque el atacante cambie de sesion,
    // porque cuenta por conversacion. Dimensionado con el trafico real (881
    // conversaciones en 30 dias): mediana 3 mensajes, p99 = 32, maximo historico
    // 62. Con el default de 60 no toca a ningun cliente legitimo.
    const topeDiario = (settings as any).max_respuestas_ia_por_conversacion_dia ?? 60;
    if (topeDiario > 0) {
      const inicioDelDia = new Date();
      inicioDelDia.setUTCHours(0, 0, 0, 0);
      const { count: respuestasHoy, error: errorConteo } = await supabase
        .from('ai_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversationId)
        .eq('status', 'completed')
        .gte('created_at', inicioDelDia.toISOString());

      // Si el conteo falla NO se bloquea: dejar mudo a un cliente por un fallo
      // de telemetria seria peor que el abuso que esto previene.
      if (errorConteo) {
        console.error('No se pudo contar el tope diario:', errorConteo.message);
      } else if ((respuestasHoy ?? 0) >= topeDiario) {
        console.error(
          `Conversacion ${conversationId} alcanzo el tope diario (${respuestasHoy}/${topeDiario}).`
        );
        await finalizarJob(jobId, {
          status: 'skipped',
          error_code: 'tope_diario_conversacion',
          error_message: `La conversacion alcanzo el tope de ${topeDiario} respuestas en un dia.`,
          completed_at: new Date().toISOString(),
        });
        return new Response(JSON.stringify({ skipped: true, reason: 'tope_diario_conversacion' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
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
                  { type: 'text', text: 'Describe este producto/imagen en español, en máximo 3 líneas. Si es una captura de pantalla de una tienda o de una ficha de producto, TRANSCRIBE LITERALMENTE el nombre del producto, la marca, el modelo o referencia, la talla o presentación y el SKU que se vean. Si es una foto, identifica marca, modelo, tipo de producto y color. Termina con una línea "Palabras clave:" con las 6 palabras más distintivas para buscarlo en un catálogo (marca y modelo primero; nada de palabras genéricas como producto, par, marca, imagen).' },
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
            imageKeywords = decidirBusquedaCatalogo(imageAnalysis).tokens.slice(0, 8);
          }
        } catch (e) {
          console.error('Error vision:', e);
        }
      }
    }

    // Si el cliente ya probo mas de dos correos distintos, se deja de buscar
    // por correo: el chat no es un oraculo para enumerar quien compra aqui.
    const decisionCorreo = decidirCorreoDelChat(recentMessages);
    const emailFromChat = decisionCorreo.correo;
    const numeroDePedido = extraerNumeroDePedido(recentMessages);
    // Cliente real al que el widget enlazo esta conversacion (cuando el
    // visitante dio un correo que ya existia en la base).
    const linkedCustomerId: string | null = conv.customer?.metadata?.linked_customer_id ?? null;
    // Las fechas de pedidos y facturas se muestran en el dia calendario de la
    // organizacion, no en el de UTC (regla canonica de fechas del repo).
    const zonaHoraria: string | null = conv.organization?.timezone ?? null;

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
    let skipProductCards = userSelectingProduct || isOrderPhase || isSupportQuery || isSimpleMessage;

    // "Que tienes talla 40?", "en rojo?", "el de 100 ml": pregunta por una
    // variante de lo que acaba de ver. Si el mensaje no nombra nada del catalogo
    // (la busqueda vuelve vacia), se responde con las tarjetas anteriores y sus
    // variantes reales. Si SI nombra algo ("talla 40 en calzado"), manda la
    // busqueda nueva: en la primera version esto reutilizaba unas pantalonetas
    // para responder por calzado.
    const hayTarjetasRecientes = last4.some(m => m.direction === 'outbound' && m.metadata?.products?.length > 0);
    const esSeguimientoDeVariante = hayTarjetasRecientes && pareceSeguimientoDeVariante(lastUserMsg);

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
    let productsFromPreviousCards: {text: string, products: any[], hayTallas?: boolean} | null = null;
    if (userSelectingProduct || esSeguimientoDeVariante) {
      const aiWithProducts = recentMessages.filter(m => m.direction === 'outbound' && m.metadata?.products?.length > 0);
      const lastAiWithProducts = aiWithProducts[aiWithProducts.length - 1];
      if (lastAiWithProducts?.metadata?.products) {
        const prods = lastAiWithProducts.metadata.products;
        // El cliente esta eligiendo talla/presentacion de una tarjeta anterior:
        // aqui es donde mas falta hacen las variantes reales.
        const idsPrevios = prods.map((p: any) => Number(p.id)).filter((n: number) => !Number.isNaN(n));
        const [variantesPrevias, medidasPrevias] = await Promise.all([
          detalleDeVariantes(organizationId, idsPrevios),
          medidasDeProductos(organizationId, idsPrevios),
        ]);
        let text = '';
        for (const p of prods) {
          const price = p.price ? `$${Number(p.price).toLocaleString('es-CO')}` : 'Precio no disponible';
          const comparePrice = p.comparePrice && Number(p.comparePrice) > Number(p.price) ? ` (precio anterior tachado: $${Number(p.comparePrice).toLocaleString('es-CO')}, NO usar)` : '';
          const stockText = p.stock !== null && p.stock !== undefined ? ` | Stock: ${p.stock}` : ' | Stock: disponible';
          const detalle = variantesPrevias.porRaiz.get(Number(p.id));
          const medidasPrev = medidasPrevias.get(Number(p.id));
          text += `- **${p.name}** | PRECIO DE VENTA: ${price}${comparePrice}${stockText}${detalle ? `\n  ${detalle}` : ''}${medidasPrev ? `\n  Medidas/capacidad (de la descripción): ${medidasPrev}` : ''}\n`;
        }
        productsFromPreviousCards = { text, products: prods, hayTallas: variantesPrevias.hayTallas };
      }
    }

    const [categoriesText, productosBuscados, ordersText, orgInfo, checkoutConfig] = await Promise.all([
      getCategories(organizationId),
      (userSelectingProduct && productsFromPreviousCards) ? Promise.resolve(productsFromPreviousCards) : searchProducts(organizationId, keywords),
      getCustomerOrders(organizationId, customerEmail, customerId, emailFromChat, numeroDePedido, linkedCustomerId, zonaHoraria),
      getOrganizationInfo(organizationId),
      getCheckoutConfig(organizationId),
    ]);

    // Seguimiento sin resultados propios: se hereda lo ultimo mostrado, con
    // sus variantes, y no se repiten las tarjetas.
    let productsResult = productosBuscados;
    if (esSeguimientoDeVariante && !userSelectingProduct && productsResult.products.length === 0 && productsFromPreviousCards) {
      productsResult = productsFromPreviousCards;
      skipProductCards = true;
    }

    // Vertical de la organizacion (retail, hotel, restaurante...): decide que
    // encargo recibe el prompt. Ver `cargarVertical` en promptAtencion.ts.
    const vertical = await cargarVertical(supabase, organizationId);

    // Prompt en dos partes (promptAtencion.ts, compartido con el Laboratorio):
    // lo estable de la organizacion —el prefijo que el proveedor cachea— y,
    // como turno aparte, lo que cambia en cada mensaje.
    const systemPrompt = construirPromptEstable({
      systemRules: settings.system_rules,
      vertical,
      orgInfo,
      checkoutConfig,
      quickReplies,
      knowledgeFragments,
      tono: settings.tone,
      idioma: settings.language,
    });
    const contextoDinamico = construirContextoDinamico({
      emailFromChat,
      imageAnalysis,
      customerName,
      canal: conv.channel?.type,
      categoriesText,
      productsResult,
      guiaTallas: GUIA_TALLAS,
      ordersText,
      sondeoCorreo: decisionCorreo.sondeo,
    });
    const chatMessages: Array<any> = mensajesDeSistema(systemPrompt, contextoDinamico);

    // ¿El mensaje que estamos respondiendo AHORA trae imagen?
    //
    // Antes esto miraba si CUALQUIERA de los ultimos 20 mensajes tenia imagen,
    // asi que una sola foto contaminaba toda la conversacion: cada respuesta
    // posterior se forzaba a gpt-4o hasta que la imagen salia de la ventana.
    // Medido en produccion: de 62 respuestas por gpt-4o en 18 horas, solo 10
    // las disparo una imagen; las otras 52 pagaron 15x de mas ($0,0068 frente a
    // $0,0004) por una foto vieja que ya no tenia nada que ver.
    const mensajeActualConImagen = !!lastCustomerMessage &&
      (lastCustomerMessage.content_type === 'image' || !!lastCustomerMessage.metadata?.imageUrl);

    for (const msg of recentMessages) {
      const role = msg.role === 'customer' ? 'user' : 'assistant';
      const tieneImagen = msg.content_type === 'image' || msg.metadata?.imageUrl;
      const imgUrl = tieneImagen ? (msg.metadata?.imageUrl || msg.content) : null;
      // La imagen solo se manda al modelo si es la del mensaje actual. Las
      // anteriores se citan por su descripcion: asi el hilo conserva el
      // contexto sin obligar a un modelo con vision en cada turno.
      const esLaImagenActual = tieneImagen && msg.id === lastCustomerMessage?.id;

      if (tieneImagen && role === 'user' && imgUrl && imgUrl.startsWith('http') && esLaImagenActual) {
        chatMessages.push({
          role: 'user',
          content: [
            { type: 'text', text: msg.metadata?.caption || msg.content || 'El cliente envió esta imagen:' },
            { type: 'image_url', image_url: { url: imgUrl, detail: 'low' } }
          ]
        });
      } else if (tieneImagen && role === 'user') {
        chatMessages.push({
          role,
          content: msg.metadata?.caption
            ? `[el cliente envió una imagen] ${msg.metadata.caption}`
            : '[el cliente envió una imagen antes en la conversación]',
        });
      } else {
        chatMessages.push({ role, content: msg.content || '' });
      }
    }

    const hasImage = mensajeActualConImagen;
    const temperatura = parseFloat(String(settings.temperature)) || 0.7;
    const maxTokens = settings.max_tokens || 600;

    // La vision va SIEMPRE por gpt-4o, independientemente del proveedor elegido:
    // es el unico modelo del catalogo con soporte de imagen confirmado.
    let proveedor = hasImage ? 'openai' : ((settings as any).provider || 'openai');
    let model = hasImage ? 'gpt-4o' : (settings.model || 'gpt-5.6-luna');

    // Proveedor configurado, reintentos y caida a OpenAI si Google no tiene
    // credencial: `generarSegunProveedor` (generacionLlm.ts), el mismo camino
    // que usa el Laboratorio de IA.
    const generada = await generarSegunProveedor({
      openai,
      supabase,
      leerEnv: (clave) => Deno.env.get(clave),
      organizationId,
      proveedor,
      model,
      chatMessages,
      temperatura,
      maxTokens,
    });
    proveedor = generada.proveedor;
    model = generada.model;
    const respuesta: RespuestaLlm = generada.respuesta;

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
        p_tokens_cacheados: respuesta.cachedTokens,
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

      // Productos del pedido: los que el chat MOSTRO (tarjetas de la conversacion)
      // cruzados con el resumen que la IA acaba de confirmar, linea por linea y
      // con el nombre mas largo primero (ver `armarCarritoDelResumen`). Antes se
      // buscaba cada nombre en todo el texto y un nombre que era el comienzo de
      // otro se colaba al carrito: el checkout cobraba un producto de mas.
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
      const cartItems = armarCarritoDelResumen(responseContent, allProducts);
      // Si lo que viaja al checkout no suma lo que el cliente acepto, se deja
      // rastro (sin datos del cliente) para encontrar el siguiente caso.
      const subtotalResumen = subtotalDelResumen(responseContent);
      const subtotalCarrito = subtotalDelCarrito(cartItems);
      if (subtotalResumen !== null && subtotalResumen !== subtotalCarrito) {
        console.warn(
          `Pedido del chat: el carrito suma ${subtotalCarrito} y el resumen dice ${subtotalResumen} (conversacion ${conversationId}, ${cartItems.length} productos).`
        );
      }
      // Medio de pago elegido en la conversacion, mapeado a un codigo REAL de
      // los medios activos de la tienda (checkoutConfig.paymentMethods). Sin uno
      // claro, no viaja nada y el checkout queda como siempre.
      const anteriores = [...recentMessages].reverse()
        .filter((m: any) => typeof m.content === 'string' && m.content && (m.role === 'customer' || m.direction === 'outbound'))
        .map((m: any) => ({ autor: m.role === 'customer' ? 'cliente' as const : 'ia' as const, texto: m.content }));
      const paymentMethodCode = metodoPagoDelChat(responseContent, anteriores, checkoutConfig.paymentMethods);
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
      // Contrato con el checkout de la tienda: `/checkout?metodo=<codigo>` con el
      // codigo del medio de pago (organization_payment_methods.payment_method_code).
      // El widget conserva este parametro y le agrega `cart` y `customer`.
      const checkoutUrl = checkoutDomain
        ? `${checkoutDomain}/checkout${paymentMethodCode ? `?metodo=${encodeURIComponent(paymentMethodCode)}` : ''}`
        : null;
      orderAction = {
        type: 'checkout_redirect',
        checkoutUrl,
        cartItems,
        customerData: customerInfo,
        paymentMethodCode,
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
          // Para comprobar si el prompt caching entra de verdad, en vez de suponerlo.
          cached_tokens: respuesta.cachedTokens,
          endpoint: usaResponsesApi(model) ? 'responses' : 'chat_completions',
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
