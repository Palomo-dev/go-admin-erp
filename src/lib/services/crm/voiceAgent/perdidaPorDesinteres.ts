/**
 * Oportunidad a «perdida» cuando la llamada del agente de voz termina con
 * desinterés DEFINITIVO (el cliente dijo que no después del único reintento).
 *
 * Decisión del dueño (2026-10-07). Solo se toca la oportunidad si:
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
 * El cierre NO es una segunda implementación: mueve a la etapa `is_lost` del
 * pipeline (`buscarEtapaDeDesenlace`, el mismo criterio de `POST …/lose`) por
 * `opportunityStageService.changeStage`, el único punto de cambio de etapa del
 * CRM, con la objeción como motivo de pérdida (`loss_reason`). Los triggers
 * de la base dejan el historial (`opportunity_stage_history`), el evento
 * `opportunity.stage_changed` (de donde sale la actividad `system`) y
 * `closed_at`, igual que cuando lo hace un vendedor. Además queda una
 * actividad `ai_call` con la objeción y la ejecución en `voice_agent_tool_runs`.
 *
 * Permisos: la organización y la oportunidad salen del contexto de la llamada
 * (`AgentRuntimeConfig`), nunca del modelo. Si la etapa configuró
 * `action_policy = 'suggest'`, no se cierra: queda una tarea para que el
 * vendedor confirme la pérdida. Lo mismo si el gate de la etapa lo impide.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { changeStage } from '@/lib/services/crm/opportunityStageService';
import { buscarEtapaDeDesenlace } from '@/lib/services/crm/opportunityStageDesenlace';
import { createTask, logActivity, recordToolRun, type ToolContext, type ToolResult } from '@/lib/services/crm/voiceAgentTools';
import type { ObjecionRegistrada } from './cierreLlamada';

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
}

export type ResultadoPerdida =
  | { aplicada: true; stageId: string }
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
        | 'no_aplicada'
        | 'error';
      tareaCreada?: boolean;
      detalle?: string;
    };

/** Motivo de pérdida (`loss_reason`, máx. 200 como en `lossDataSchema`). */
export function motivoDePerdida(objecion: ObjecionRegistrada): string {
  return `Sin interés: ${objecion.texto}`.replace(/\s+/g, ' ').trim().slice(0, 200);
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
      .select('id, name, pipeline_id, status, salesperson_id')
      .eq('id', ctx.opportunityId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle();
    if (oppError) throw new Error(`opportunities: ${oppError.message}`);
    const o = opp as { id: string; name: string; pipeline_id: string; status: string | null; salesperson_id: string | null } | null;
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

    /** Sin cierre automático posible: una persona confirma la pérdida. */
    const dejarTarea = async (
      m: 'sin_etapa_perdida' | 'politica_sugerir' | 'no_aplicada',
      detalle?: string,
    ): Promise<ResultadoPerdida> => {
      const task = await createTask(toolCtx, {
        title: `Confirmar pérdida de «${o.name}» (sin interés)`,
        description:
          `El cliente dijo que no le interesa después del reintento del agente IA. Motivo: ${motivo}.` +
          (detalle ? ` (${detalle})` : ''),
        related_to_id: o.id,
        related_to_type: 'opportunity',
        assigned_to: o.salesperson_id ?? undefined,
      });
      const res: ToolResult = { success: true, data: { applied: false, motivo: m, task: task.data ?? null } };
      await recordToolRun(toolCtx, ACCION_PERDIDA, args, res, 'suggested');
      return { aplicada: false, motivo: m, tareaCreada: task.success, detalle };
    };

    const stageId = await buscarEtapaDeDesenlace(ctx.supabase, o.pipeline_id, 'lost');
    if (!stageId) return dejarTarea('sin_etapa_perdida');
    if (ctx.politicaEtapa === 'suggest') return dejarTarea('politica_sugerir');

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
      },
      ctx.supabase,
    );
    if (!result.ok) return dejarTarea('no_aplicada', result.reason);

    await logActivity(toolCtx, {
      relatedType: 'opportunity',
      relatedId: o.id,
      notes: `El agente IA marcó la oportunidad como perdida. Motivo: ${motivo}.`,
      outcome: 'opportunity_lost',
      metadata: { stage_id: stageId, loss_reason: motivo, objection_tipo: objecion.tipo },
    });
    await recordToolRun(toolCtx, ACCION_PERDIDA, args, { success: true, data: { applied: true, stage_id: stageId } }, 'applied');
    return { aplicada: true, stageId };
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    console.error(`[perdidaPorDesinteres] org ${ctx.orgId}, oportunidad ${ctx.opportunityId}: ${detalle}`);
    await recordToolRun(toolCtx, ACCION_PERDIDA, args, { success: false, error: detalle }, 'failed');
    return { aplicada: false, motivo: 'error', detalle };
  }
}
