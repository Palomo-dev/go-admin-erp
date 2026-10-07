/**
 * Qué pasa con la oportunidad cuando la llamada del agente de voz termina con
 * desinterés DEFINITIVO (el cliente dijo que no después del único reintento).
 *
 * Decisión del dueño (2026-10-07). Solo se considera la oportunidad si:
 *  - la llamada tiene oportunidad (`voice_agent_calls.opportunity_id`);
 *  - el objetivo de la llamada es de VENTA (`OBJETIVOS_DE_VENTA`): el de la
 *    etapa (`stage_agents.objective`) si la llamada la tiene, si no el del
 *    agente (`voice_agents.purpose_type`). `voice_agent_campaigns.objective`
 *    es texto libre (verificado por MCP: «Ensayo pedido por el dueño…»), no
 *    sirve para decidir;
 *  - el pipeline de la oportunidad es de ventas (`pipelines.pipeline_type =
 *    'sales'`; existen también `renewal` y `onboarding`);
 *  - la oportunidad sigue abierta (`status = 'open'`).
 *
 * Qué se hace lo decide la configuración de la organización
 * (`desinteresConfig.ts`): marcar perdida (por defecto), solo dejar tarea o no
 * hacer nada, con excepciones por valor y por etapa, y la política de la etapa
 * (`action_policy`). Gana la opción más restrictiva.
 *
 * El cierre NO es una segunda implementación: mueve a la etapa `is_lost` del
 * pipeline (`buscarEtapaDeDesenlace`, el mismo criterio de `POST …/lose`) por
 * `opportunityStageService.changeStage`, el único punto de cambio de etapa del
 * CRM, con la objeción como motivo de pérdida (`loss_reason`) y la marca
 * `metadata.cierre_agente_voz` (para la franja «Reabrir» de la oportunidad).
 * Los triggers de la base dejan el historial, el evento y `closed_at`, igual
 * que cuando lo hace un vendedor. Además queda una actividad `ai_call` y la
 * ejecución en `voice_agent_tool_runs`.
 *
 * Aviso: al marcar perdida o dejar la tarea, el vendedor recibe un aviso en el
 * momento (`avisoDesinteres.ts`). Con «no hacer nada», no hay aviso.
 *
 * Permisos: la organización y la oportunidad salen del contexto de la llamada
 * (`AgentRuntimeConfig`), nunca del modelo; toda lectura filtra por la
 * organización (el ws-server usa la clave de servicio).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { CLAVE_CIERRE_AGENTE_VOZ, changeStage } from '@/lib/services/crm/opportunityStageService';
import { buscarEtapaDeDesenlace } from '@/lib/services/crm/opportunityStageDesenlace';
import { createTask, logActivity, recordToolRun, type ToolContext, type ToolResult } from '@/lib/services/crm/voiceAgentTools';
import { resolveOrgCurrency } from '@/lib/services/monedaOrganizacion';
import type { TasaCambio } from '@/lib/crm/monedaCrm';
import type { ObjecionRegistrada } from './cierreLlamada';
import {
  decidirAccionDesinteres,
  leerConfigDesinteres,
  necesitaDatosDeExcepciones,
  type DecisionDesinteres,
} from './desinteresConfig';
import { avisarVendedorDesinteres, type ResultadoAvisoDesinteres } from './avisoDesinteres';

/** Objetivos de llamada que buscan una venta (o el paso previo: demo, calificación). */
export const OBJETIVOS_DE_VENTA = [
  'sell_product',
  'book_meeting',
  'qualify_lead',
  'recover_cart',
  'confirm_demo',
  'follow_up_proposal',
  'reactivate_cold',
] as const;

export function objetivoEsVenta(objetivo: string | null | undefined): boolean {
  return Boolean(objetivo) && (OBJETIVOS_DE_VENTA as readonly string[]).includes(objetivo as string);
}

/** Nombre con que la ejecución queda en `voice_agent_tool_runs.tool`. */
export const ACCION_PERDIDA = 'mark_opportunity_lost';

/** Etiqueta de la tarea (`tasks.tags`): el trigger omite su aviso genérico. */
export const ETIQUETA_TAREA_DESINTERES = 'agente_voz_desinteres';

export interface ContextoPerdida {
  orgId: number;
  supabase: SupabaseClient;
  voiceAgentCallId: string | null;
  customerId: string | null;
  opportunityId: string | null;
  agentId: string;
  /** Objetivo de la llamada: el de la etapa si la hay; si no, el del agente. */
  objetivo: string | null;
  /** `action_policy` configurada en la etapa (null si la llamada no tiene etapa). */
  politicaEtapa: 'auto' | 'suggest' | null;
  /** Resumen breve de la llamada para el aviso (`resumenBreveLlamada`). */
  resumenLlamada?: string | null;
}

export type ResultadoPerdida =
  | { aplicada: true; stageId: string; aviso?: ResultadoAvisoDesinteres }
  | {
      aplicada: false;
      motivo:
        | 'sin_oportunidad'
        | 'objetivo_no_venta'
        | 'no_encontrada'
        | 'ya_cerrada'
        | 'pipeline_no_ventas'
        | 'sin_etapa_perdida'
        | 'politica_sugerir'
        | 'configuracion_tarea'
        | 'excepcion_valor'
        | 'excepcion_etapa'
        | 'solo_registro'
        | 'no_aplicada'
        | 'error';
      tareaCreada?: boolean;
      detalle?: string;
      aviso?: ResultadoAvisoDesinteres;
    };

/** Motivo de pérdida (`loss_reason`, máx. 200 como en `lossDataSchema`). */
export function motivoDePerdida(objecion: ObjecionRegistrada): string {
  return `Sin interés: ${objecion.texto}`.replace(/\s+/g, ' ').trim().slice(0, 200);
}

interface OppFila {
  id: string;
  name: string;
  pipeline_id: string;
  stage_id: string;
  status: string | null;
  salesperson_id: string | null;
  created_by: string | null;
  amount: number | string | null;
  currency: string | null;
}

/** Motivo del resultado cuando se deja tarea, en orden de lo que más pesó. */
function motivoTarea(d: DecisionDesinteres): 'politica_sugerir' | 'configuracion_tarea' | 'excepcion_valor' | 'excepcion_etapa' {
  if (d.razones.includes('modo_tarea')) return 'configuracion_tarea';
  if (d.razones.includes('politica_etapa')) return 'politica_sugerir';
  if (d.razones.includes('excepcion_valor') || d.razones.includes('excepcion_valor_sin_tasa')) return 'excepcion_valor';
  return 'excepcion_etapa';
}

async function etapaPorId(supabase: SupabaseClient, orgId: number, id: string): Promise<{ pipelineId: string; position: number } | null> {
  const { data, error } = await supabase
    .from('stages')
    .select('id, pipeline_id, position, pipelines!inner(organization_id)')
    .eq('id', id)
    .eq('pipelines.organization_id', orgId)
    .maybeSingle();
  if (error) throw new Error(`stages: ${error.message}`);
  const e = data as { pipeline_id: string; position: number } | null;
  return e ? { pipelineId: e.pipeline_id, position: Number(e.position) } : null;
}

async function tasasDeLaOrganizacion(supabase: SupabaseClient, orgId: number): Promise<TasaCambio[]> {
  const { data, error } = await supabase
    .from('exchange_rates')
    .select('base_currency, target_currency, rate, effective_date')
    .eq('organization_id', orgId)
    .order('effective_date', { ascending: false })
    .limit(200);
  if (error) throw new Error(`exchange_rates: ${error.message}`);
  return (data ?? []) as TasaCambio[];
}

/** `calls.id` de la llamada (para el enlace a Llamadas `?call=`). */
async function llamadaDe(supabase: SupabaseClient, orgId: number, voiceAgentCallId: string | null): Promise<string | null> {
  if (!voiceAgentCallId) return null;
  const { data, error } = await supabase
    .from('voice_agent_calls')
    .select('call_id')
    .eq('id', voiceAgentCallId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (error) {
    console.error(`[perdidaPorDesinteres] voice_agent_calls: ${error.message}`);
    return null;
  }
  return (data as { call_id: string | null } | null)?.call_id ?? null;
}

export async function marcarPerdidaPorDesinteres(ctx: ContextoPerdida, objecion: ObjecionRegistrada): Promise<ResultadoPerdida> {
  if (!ctx.opportunityId) return { aplicada: false, motivo: 'sin_oportunidad' };
  if (!objetivoEsVenta(ctx.objetivo)) return { aplicada: false, motivo: 'objetivo_no_venta' };

  const toolCtx: ToolContext = {
    orgId: ctx.orgId,
    supabase: ctx.supabase,
    voiceAgentCallId: ctx.voiceAgentCallId,
    customerId: ctx.customerId,
    opportunityId: ctx.opportunityId,
    actionPolicy: ctx.politicaEtapa ?? 'auto',
  };
  const motivo = motivoDePerdida(objecion);
  const args = { opportunity_id: ctx.opportunityId, objection: objecion.texto, tipo: objecion.tipo };

  try {
    const { data: opp, error: oppError } = await ctx.supabase
      .from('opportunities')
      .select('id, name, pipeline_id, stage_id, status, salesperson_id, created_by, amount, currency')
      .eq('id', ctx.opportunityId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle();
    if (oppError) throw new Error(`opportunities: ${oppError.message}`);
    const o = opp as OppFila | null;
    if (!o) return { aplicada: false, motivo: 'no_encontrada' };
    if (o.status && o.status !== 'open') return { aplicada: false, motivo: 'ya_cerrada' };

    const { data: pipe, error: pipeError } = await ctx.supabase
      .from('pipelines')
      .select('id, pipeline_type')
      .eq('id', o.pipeline_id)
      .eq('organization_id', ctx.orgId)
      .maybeSingle();
    if (pipeError) throw new Error(`pipelines: ${pipeError.message}`);
    if ((pipe as { pipeline_type: string | null } | null)?.pipeline_type !== 'sales') {
      return { aplicada: false, motivo: 'pipeline_no_ventas' };
    }

    // ── Qué manda la organización ──────────────────────────────────────────
    const config = await leerConfigDesinteres(ctx.supabase, ctx.orgId);
    const necesita = necesitaDatosDeExcepciones(config);
    const [etapaActual, etapaAvanzada] = necesita.etapas
      ? await Promise.all([etapaPorId(ctx.supabase, ctx.orgId, o.stage_id), etapaPorId(ctx.supabase, ctx.orgId, config.excepcionEtapa.etapaId as string)])
      : [null, null];
    let monedaBase = '';
    let tasas: TasaCambio[] = [];
    if (necesita.valor) {
      monedaBase = (await resolveOrgCurrency(ctx.supabase, ctx.orgId)).code;
      const monedaOpp = (o.currency ?? '').trim().toUpperCase() || monedaBase;
      if (monedaOpp !== config.excepcionValor.moneda) tasas = await tasasDeLaOrganizacion(ctx.supabase, ctx.orgId);
    }
    const decision = decidirAccionDesinteres({
      config,
      politicaEtapa: ctx.politicaEtapa,
      oportunidad: { monto: o.amount, moneda: o.currency },
      monedaBase,
      tasas,
      etapaActual,
      etapaAvanzada,
    });

    const callId = await llamadaDe(ctx.supabase, ctx.orgId, ctx.voiceAgentCallId);
    const avisar = (tipo: 'perdida' | 'tarea', tareaId?: string | null) =>
      avisarVendedorDesinteres(
        {
          orgId: ctx.orgId,
          supabase: ctx.supabase,
          llaveLlamada: ctx.voiceAgentCallId ?? `${ctx.agentId}:${o.id}`,
          responsable: o.salesperson_id,
          creador: o.created_by,
          tareaId,
        },
        {
          tipo,
          oportunidad: { id: o.id, name: o.name },
          motivo,
          resumen: ctx.resumenLlamada ?? null,
          callId,
          razones: decision.razones,
          valor: decision.valorComparado,
          umbral:
            config.excepcionValor.monto !== null && config.excepcionValor.moneda
              ? { monto: config.excepcionValor.monto, moneda: config.excepcionValor.moneda }
              : null,
        },
      );

    if (decision.accion === 'nada') {
      // «No hacer nada»: solo queda la objeción en la actividad de la llamada.
      await logActivity(toolCtx, {
        relatedType: 'opportunity',
        relatedId: o.id,
        notes: `El cliente no tiene interés (después del reintento). Motivo: ${motivo}. Por la configuración de la organización, la oportunidad no cambia.`,
        outcome: 'not_interested',
        metadata: { objection_tipo: objecion.tipo, razones: decision.razones },
      });
      await recordToolRun(toolCtx, ACCION_PERDIDA, args, { success: true, data: { applied: false, motivo: 'solo_registro', razones: decision.razones } }, 'denied');
      return { aplicada: false, motivo: 'solo_registro' };
    }

    /** Sin cierre automático: una persona decide. */
    const dejarTarea = async (
      m: 'sin_etapa_perdida' | 'politica_sugerir' | 'configuracion_tarea' | 'excepcion_valor' | 'excepcion_etapa' | 'no_aplicada',
      detalle?: string,
    ): Promise<ResultadoPerdida> => {
      const task = await createTask(toolCtx, {
        title: `Confirmar pérdida de «${o.name}» (sin interés)`,
        description:
          `El cliente dijo que no le interesa después del reintento del agente IA. Motivo: ${motivo}.` +
          (ctx.resumenLlamada ? ` ${ctx.resumenLlamada}` : '') +
          (detalle ? ` (${detalle})` : ''),
        related_to_id: o.id,
        related_to_type: 'opportunity',
        assigned_to: o.salesperson_id ?? o.created_by ?? undefined,
        tags: [ETIQUETA_TAREA_DESINTERES],
      });
      const tareaId = (task.data as { id?: string } | undefined)?.id ?? null;
      const aviso = task.success ? await avisar('tarea', tareaId) : undefined;
      const res: ToolResult = { success: true, data: { applied: false, motivo: m, razones: decision.razones, task: task.data ?? null } };
      await recordToolRun(toolCtx, ACCION_PERDIDA, args, res, 'suggested');
      return { aplicada: false, motivo: m, tareaCreada: task.success, detalle, aviso };
    };

    if (decision.accion === 'tarea') return dejarTarea(motivoTarea(decision));

    const stageId = await buscarEtapaDeDesenlace(ctx.supabase, o.pipeline_id, 'lost');
    if (!stageId) return dejarTarea('sin_etapa_perdida');

    const result = await changeStage(
      ctx.orgId,
      `voice_agent:${ctx.agentId}`,
      {
        opportunityId: o.id,
        stageId,
        lossData: {
          lossReasonLabel: motivo,
          notes:
            `Marcada como perdida por el agente de voz IA al terminar la llamada ${ctx.voiceAgentCallId ?? ''}: ` +
            `el cliente dijo que no le interesa después del reintento.` +
            (objecion.detalle ? ` Detalle: ${objecion.detalle}` : ''),
        },
        cierreAgenteVoz: {
          at: new Date().toISOString(),
          agent_id: ctx.agentId,
          voice_agent_call_id: ctx.voiceAgentCallId,
          call_id: callId,
          motivo,
          resumen: ctx.resumenLlamada ?? null,
          etapa_anterior_id: o.stage_id,
        },
      },
      ctx.supabase,
    );
    if (!result.ok) return dejarTarea('no_aplicada', result.reason);

    await logActivity(toolCtx, {
      relatedType: 'opportunity',
      relatedId: o.id,
      notes: `El agente IA marcó la oportunidad como perdida. Motivo: ${motivo}.`,
      outcome: 'opportunity_lost',
      metadata: { stage_id: stageId, loss_reason: motivo, objection_tipo: objecion.tipo, [CLAVE_CIERRE_AGENTE_VOZ]: true },
    });
    await recordToolRun(toolCtx, ACCION_PERDIDA, args, { success: true, data: { applied: true, stage_id: stageId } }, 'applied');
    const aviso = await avisar('perdida');
    return { aplicada: true, stageId, aviso };
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    console.error(`[perdidaPorDesinteres] org ${ctx.orgId}, oportunidad ${ctx.opportunityId}: ${detalle}`);
    await recordToolRun(toolCtx, ACCION_PERDIDA, args, { success: false, error: detalle }, 'failed');
    return { aplicada: false, motivo: 'error', detalle };
  }
}
