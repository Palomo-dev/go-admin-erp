/**
 * Lógica pura de la pestaña «Campañas» (UXM-D): estado legible, destino en
 * lenguaje humano y cuerpo que viaja a la API. Sin React, se prueba sola.
 *
 * El contrato de la API no cambia: `target_source: 'pipeline_stage'` con
 * `target_config: { stage_id }`, o `manual_list` con `{}`.
 */

import type { PipelineOption, StageOption } from "@/components/crm/shared/useCrmLookups";

export interface CampaignRow {
  id: string;
  name: string;
  status: string;
  target_source: string;
  target_config: Record<string, unknown> | null;
  max_calls_per_day: number;
  max_calls_per_hour: number;
  max_concurrent: number;
  emergency_stop: boolean;
  stopped_reason: string | null;
  voice_agents?: { id?: string; name: string } | null;
}

export type CampaignBadgeVariant = "success" | "secondary" | "destructive" | "warning" | "info";

export interface CampaignStatusView {
  label: string;
  variant: CampaignBadgeVariant;
  /** Frase corta para el lector de pantalla y el pie de la tarjeta. */
  detail: string | null;
}

const STATUS_LABELS: Record<string, { label: string; variant: CampaignBadgeVariant }> = {
  draft: { label: "Borrador", variant: "secondary" },
  scheduled: { label: "Programada", variant: "info" },
  running: { label: "En marcha", variant: "success" },
  paused: { label: "En pausa", variant: "warning" },
  completed: { label: "Terminada", variant: "secondary" },
};

/** Traductor de `crm.agentesIa.campaignModel`; sin él, español (servidor y pruebas). */
export type TraductorCampana = (clave: string, valores?: Record<string, string>) => string;

export function campaignStatusView(
  c: Pick<CampaignRow, "status" | "emergency_stop" | "stopped_reason">,
  tr?: TraductorCampana,
): CampaignStatusView {
  if (c.emergency_stop) {
    return {
      label: tr ? tr("estados.detenida") : "Detenida",
      variant: "destructive",
      detail: c.stopped_reason
        ? tr ? tr("paradaConMotivo", { motivo: c.stopped_reason }) : `Parada de emergencia: ${c.stopped_reason}`
        : tr ? tr("parada") : "Parada de emergencia",
    };
  }
  const conocido = STATUS_LABELS[c.status];
  const base = conocido ? { ...conocido, label: tr ? tr(`estados.${c.status}`) : conocido.label } : { label: c.status, variant: "secondary" as const };
  return { ...base, detail: c.stopped_reason ? (tr ? tr("motivo", { motivo: c.stopped_reason }) : `Motivo: ${c.stopped_reason}`) : null };
}

/** `true` si la acción disponible es «Activar» (si no, «Parada de emergencia»). */
export function campaignCanActivate(c: Pick<CampaignRow, "status" | "emergency_stop">): boolean {
  return c.emergency_stop || c.status !== "running";
}

export function campaignStageId(
  c: Pick<CampaignRow, "target_source" | "target_config">,
): string | null {
  if (c.target_source !== "pipeline_stage") return null;
  const id = c.target_config?.stage_id;
  return typeof id === "string" && id ? id : null;
}

/** «Etapa Propuesta enviada · Ventas B2B», «Lista manual» o «Etapa (ya no existe)». */
export function describeCampaignTarget(
  c: Pick<CampaignRow, "target_source" | "target_config">,
  stages: StageOption[],
  pipelines: PipelineOption[],
  tr?: TraductorCampana,
): string {
  const stageId = campaignStageId(c);
  if (!stageId) return c.target_source === "manual_list" ? (tr ? tr("listaManual") : "Lista manual") : c.target_source;
  const stage = stages.find((s) => s.id === stageId);
  if (!stage) return tr ? tr("etapaYaNoExiste") : "Etapa del embudo (ya no existe)";
  const pipeline = pipelines.find((p) => p.id === stage.pipeline_id);
  if (tr) return pipeline ? tr("etapaEmbudo", { etapa: stage.name, embudo: pipeline.name }) : tr("etapa", { etapa: stage.name });
  return pipeline ? `Etapa ${stage.name} · ${pipeline.name}` : `Etapa ${stage.name}`;
}

export interface NewCampaignInput {
  name: string;
  voiceAgentId: string;
  stageId: string | null;
}

export function buildCampaignBody(input: NewCampaignInput): Record<string, unknown> {
  const stageId = input.stageId?.trim() || null;
  return {
    name: input.name.trim(),
    voice_agent_id: input.voiceAgentId,
    target_source: stageId ? "pipeline_stage" : "manual_list",
    target_config: stageId ? { stage_id: stageId } : {},
    max_calls_per_day: 120,
    max_calls_per_hour: 40,
    max_concurrent: 5,
    status: "draft",
  };
}

/** Etapas elegibles como destino: las del pipeline, sin las de cierre (ganada/perdida). */
export function targetStagesOf(stages: StageOption[], pipelineId: string | null): StageOption[] {
  return stages
    .filter((s) => (pipelineId ? s.pipeline_id === pipelineId : true))
    .filter((s) => !s.is_won && !s.is_lost)
    .sort((a, b) => a.position - b.position);
}
