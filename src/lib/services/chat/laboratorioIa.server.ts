/**
 * Laboratorio de la IA del chat de atención al cliente final — SOLO SERVIDOR.
 *
 * «Probar» genera la respuesta REAL que daría la IA (Figma 93-chat-pendientes
 * 04 y 05): el mismo prompt y la misma generación que `ai-auto-response`
 * (núcleo compartido en `supabase/functions/_shared/ai-chat/promptAtencion.ts`
 * y `generacionLlm.ts`), con los ajustes de la prueba (canal, creatividad,
 * largo) y los fragmentos elegidos en la pantalla. No envía nada a ningún
 * cliente ni crea conversaciones, mensajes ni trabajos: solo devuelve el texto.
 *
 * Es del chat de atención (no de GO Assistant): no comparte catálogo de
 * acciones, prompt ni política de confirmación con el asistente; sí el cobro.
 *
 * Créditos (CLAUDE.md): saldo comprobado ANTES de llamar al proveedor
 * (`checkAICredits`) y cobro DESPUÉS de recibir la respuesta con el punto único
 * `chargeAiCredits` — 1 crédito, igual que una respuesta a un cliente
 * (`ai-auto-response` cobra `p_cost: 1`). Si el proveedor falla no se cobra.
 *
 * Lo que NO entra en la prueba (no hay conversación): catálogo de productos,
 * pedidos del cliente, historial e imágenes. El prompt es el mismo; el bloque
 * «CONTEXTO ACTUAL» solo lleva el cliente de prueba y el canal.
 */
import OpenAI from 'openai';
import { z } from 'zod';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { checkAICredits } from '@/lib/services/aiCreditsService';
import { chargeAiCredits, InsufficientCreditsError } from '@/lib/services/crm/aiCostService';
import {
  cargarCheckoutConfig,
  cargarInfoOrganizacion,
  cargarVertical,
  construirContextoDinamico,
  construirPromptEstable,
  mensajesDeSistema,
  type EntradaReferencia,
} from '../../../../supabase/functions/_shared/ai-chat/promptAtencion';
import { generarSegunProveedor, MODELO_POR_DEFECTO_ATENCION } from '../../../../supabase/functions/_shared/ai-chat/generacionLlm';

/** Mismo permiso que configurar la IA del chat: la prueba gasta créditos de la organización. */
export { PERMISO_CONFIGURAR_IA_CHAT as PERMISO_LABORATORIO_IA } from './aiSettingsServidor';

/** Tipo de acción en `ai_usage_logs`: distingue la prueba de las respuestas a clientes. */
export const ACCION_LABORATORIO = 'chat_lab_test';

/** Créditos por prueba: los mismos que una respuesta a un cliente. */
export const CREDITOS_POR_PRUEBA = 1;

/** Canales que el laboratorio ofrece por tipo (`channels.type`). */
const TIPOS_DE_CANAL = new Set(['whatsapp', 'webchat', 'instagram', 'facebook']);

/** Cliente con el que la IA saluda en la prueba (`Cliente: … | Canal: …`). */
const CLIENTE_DE_PRUEBA = 'Cliente';

export const pruebaLaboratorioSchema = z
  .object({
    query: z.string().trim().min(1).max(2000),
    /** Tipo de canal (`whatsapp`…) o id de un canal de la organización. */
    canal: z.string().trim().min(1).max(64),
    temperatura: z.number().min(0).max(2),
    maxTokens: z.number().int().min(50).max(2000),
    fragmentIds: z.array(z.string().uuid()).max(20).default([]),
    /**
     * Modelo de la prueba (del catálogo `ai_modelos_disponibles`). Sin él, el de
     * la configuración. No cambia la configuración real.
     */
    modelo: z.string().trim().min(1).max(120).optional(),
    /** Reglas del sistema de la prueba; sin ellas, las de la configuración. Vacías = sin reglas. */
    reglas: z.string().max(8000).nullable().optional(),
    /** Tono de la prueba (`TONE_OPTIONS`); sin él, el de la configuración. */
    tono: z.enum(['professional', 'friendly', 'formal', 'casual', 'empathetic']).optional(),
    /** Idioma principal de la prueba (`LANGUAGE_OPTIONS`); sin él, el de la configuración. */
    idioma: z.enum(['es', 'en', 'pt', 'fr']).optional(),
  })
  .strict();

export type PruebaLaboratorio = z.infer<typeof pruebaLaboratorioSchema>;

export type CodigoErrorLaboratorio = 'sin_creditos' | 'proveedor' | 'sin_configuracion' | 'modelo_invalido';

export class ErrorLaboratorio extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly codigo: CodigoErrorLaboratorio,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorLaboratorio';
  }
}

export interface ResultadoLaboratorio {
  respuesta: string;
  modelo: string;
  proveedor: string;
  /** Milisegundos de la generación (llamada al proveedor). */
  tiempoMs: number;
  tokens: { entrada: number; salida: number; total: number };
  /** Fragmentos de conocimiento que entraron en el prompt. */
  fragmentos: number;
  creditosCobrados: number;
  /** Saldo tras el cobro; `null` si no se pudo leer. */
  saldoRestante: number | null;
  /**
   * Lo que le costó la prueba a GO Admin en el proveedor (USD), contra
   * `provider_pricing`. `null` si el modelo no tiene tarifa cargada: no se inventa.
   * A la organización se le cobran `creditosCobrados`, no este importe.
   */
  costoUsd: number | null;
}

type Generar = typeof generarSegunProveedor;

/** Dependencias inyectables (pruebas). En runtime: OpenAI con la clave del entorno. */
export interface DependenciasLaboratorio {
  generar?: Generar;
  crearOpenAI?: () => unknown;
  ahora?: () => number;
}

function crearOpenAIDelEntorno(): unknown {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new ErrorLaboratorio(503, 'sin_configuracion', 'La IA no está configurada en el servidor');
  return new OpenAI({ apiKey });
}

/** Tipo de canal de la prueba: el tipo tal cual o el de un canal de la organización. */
async function tipoDeCanal(ctx: ServerOrgContext, canal: string): Promise<string | null> {
  if (TIPOS_DE_CANAL.has(canal)) return canal;
  if (!z.string().uuid().safeParse(canal).success) return null;
  const { data } = await ctx.supabase.from('channels').select('type').eq('id', canal).eq('organization_id', ctx.organizationId).maybeSingle();
  return (data as { type?: string | null } | null)?.type ?? null;
}

/**
 * Genera la respuesta de prueba. Lanza `ErrorLaboratorio` (402 sin créditos,
 * 502 si el proveedor falla —sin cobro—, 503 sin clave de IA).
 */
export async function probarEnLaboratorio(
  ctx: ServerOrgContext,
  prueba: PruebaLaboratorio,
  deps: DependenciasLaboratorio = {},
): Promise<ResultadoLaboratorio> {
  const org = ctx.organizationId;

  // 1) Saldo ANTES de llamar al proveedor.
  const saldo = await checkAICredits(org);
  if (!saldo.allowed) throw new ErrorLaboratorio(402, 'sin_creditos', 'No tienes créditos de IA');

  // 2) Lo mismo que lee `ai-auto-response`, filtrado SIEMPRE por la organización
  //    de la sesión. El cliente de servicio hace falta para lo que la función lee
  //    con service_role (vertical, credencial del proveedor, medios de pago); los
  //    fragmentos se leen con la sesión del usuario (RLS).
  const servicio = getServiceClient();
  const [ajustes, vertical, orgInfo, checkoutConfig, respuestasRapidas, fragmentos, canal] = await Promise.all([
    servicio.from('ai_settings').select('provider, model, system_rules, tone, language').eq('organization_id', org).maybeSingle(),
    cargarVertical(servicio, org),
    cargarInfoOrganizacion(servicio, org),
    cargarCheckoutConfig(servicio, org),
    servicio.from('quick_replies').select('title, content').eq('organization_id', org).eq('is_active', true).limit(20),
    prueba.fragmentIds.length > 0
      ? ctx.supabase.from('knowledge_fragments').select('title, content').eq('organization_id', org).eq('is_active', true).in('id', prueba.fragmentIds)
      : Promise.resolve({ data: [] as EntradaReferencia[], error: null }),
    tipoDeCanal(ctx, prueba.canal),
  ]);
  const config = (ajustes.data ?? {}) as {
    provider?: string | null;
    model?: string | null;
    system_rules?: string | null;
    tone?: string | null;
    language?: string | null;
  };

  // Modelo de la prueba: solo uno del catálogo (con su proveedor), nunca un
  // texto libre. Se valida ANTES de llamar al proveedor y de cobrar.
  let modeloPrueba: { model: string; provider: string } | null = null;
  if (prueba.modelo) {
    const { data: fila } = await ctx.supabase
      .from('ai_modelos_disponibles')
      .select('provider, model')
      .eq('model', prueba.modelo)
      .limit(1)
      .maybeSingle();
    const f = fila as { provider?: string; model?: string } | null;
    if (!f?.model) throw new ErrorLaboratorio(400, 'modelo_invalido', 'Ese modelo no está en el catálogo');
    modeloPrueba = { model: f.model, provider: f.provider || 'openai' };
  }
  const conocimiento = (fragmentos.data ?? []) as EntradaReferencia[];

  const systemPrompt = construirPromptEstable({
    // Las reglas de la prueba mandan sobre las de la configuración (sin guardarlas).
    systemRules: prueba.reglas !== undefined ? prueba.reglas : config.system_rules,
    vertical,
    orgInfo,
    checkoutConfig,
    quickReplies: (respuestasRapidas.data ?? []) as EntradaReferencia[],
    knowledgeFragments: conocimiento,
    // Igual que las reglas: lo de la prueba manda, sin guardarlo.
    tono: prueba.tono ?? config.tone,
    idioma: prueba.idioma ?? config.language,
  });
  const contextoDinamico = construirContextoDinamico({
    customerName: CLIENTE_DE_PRUEBA,
    canal,
    productsResult: { text: '' },
  });
  const chatMessages = [...mensajesDeSistema(systemPrompt, contextoDinamico), { role: 'user', content: prueba.query }];

  // 3) Generación real: modelo de la organización → entorno → default.
  const modeloConfigurado = modeloPrueba?.model || config.model || process.env.OPENAI_MODEL || MODELO_POR_DEFECTO_ATENCION;
  const ahora = deps.ahora ?? Date.now;
  const inicio = ahora();
  let generada: Awaited<ReturnType<Generar>>;
  try {
    generada = await (deps.generar ?? generarSegunProveedor)({
      openai: (deps.crearOpenAI ?? crearOpenAIDelEntorno)(),
      supabase: servicio,
      leerEnv: (clave) => process.env[clave],
      organizationId: org,
      proveedor: modeloPrueba?.provider || config.provider || 'openai',
      model: modeloConfigurado,
      chatMessages,
      temperatura: prueba.temperatura,
      maxTokens: prueba.maxTokens,
    });
  } catch (err) {
    if (err instanceof ErrorLaboratorio) throw err;
    // Sin cobro: la generación falló. El detalle del proveedor queda en el log
    // del servidor, nunca en la respuesta (puede traer datos de la cuenta).
    console.error('[laboratorioIa] el proveedor falló', { org, message: err instanceof Error ? err.message.slice(0, 300) : String(err) });
    throw new ErrorLaboratorio(502, 'proveedor', 'El proveedor de IA no respondió');
  }
  const tiempoMs = Math.max(0, ahora() - inicio);
  const { respuesta, proveedor, model } = generada;
  if (!respuesta.content.trim()) {
    throw new ErrorLaboratorio(502, 'proveedor', 'El proveedor de IA devolvió una respuesta vacía');
  }

  // 4) Cobro DESPUÉS de la respuesta (punto único). Costo real contra provider_pricing.
  let costoUsd: number | null = null;
  try {
    const { data: costo } = await servicio.rpc('calcular_costo_llm', {
      p_model: respuesta.model || model,
      p_tokens_entrada: respuesta.promptTokens,
      p_tokens_salida: respuesta.completionTokens,
      p_tokens_cacheados: respuesta.cachedTokens,
    });
    costoUsd = costo === null || costo === undefined ? null : Number(costo);
  } catch {
    /* el costo es informativo: no bloquea la prueba */
  }
  let creditosCobrados = 0;
  let saldoRestante: number | null = null;
  try {
    const cargo = await chargeAiCredits({
      orgId: org,
      actionType: ACCION_LABORATORIO,
      model: respuesta.model || model,
      units: respuesta.totalTokens,
      credits: CREDITOS_POR_PRUEBA,
      provider: proveedor,
      userId: ctx.userId,
      metadata: {
        source: 'chat_lab',
        prompt_tokens: respuesta.promptTokens,
        completion_tokens: respuesta.completionTokens,
        cached_tokens: respuesta.cachedTokens,
        cost_usd: costoUsd,
      },
    });
    creditosCobrados = cargo.credits;
    saldoRestante = cargo.previousBalance === null ? null : Math.max(0, cargo.previousBalance - cargo.credits);
  } catch (err) {
    // El saldo se agotó mientras se generaba (otra respuesta lo gastó): igual
    // que `ai-auto-response`, no se entrega lo generado sin cobrar.
    if (err instanceof InsufficientCreditsError) throw new ErrorLaboratorio(402, 'sin_creditos', 'No tienes créditos de IA');
    throw err;
  }

  return {
    respuesta: respuesta.content,
    modelo: respuesta.model || model,
    proveedor,
    tiempoMs,
    tokens: { entrada: respuesta.promptTokens, salida: respuesta.completionTokens, total: respuesta.totalTokens },
    fragmentos: conocimiento.length,
    creditosCobrados,
    saldoRestante,
    costoUsd,
  };
}
