/**
 * CRM ola 1 — pipelines por el servidor (plan §4.3, M6).
 *
 * «Nuevo pipeline» (desde plantilla o con etapas propias), «por defecto» y
 * borrado pasan por las RPC de 20260930160700, todas con
 * `crm.pipelines.manage`: pipeline y etapas en UNA transacción (antes, dos
 * escrituras desde el navegador o desde la ruta de importar, con pipelines a
 * medias si fallaban las etapas), validación de etapas (una ganadora, en
 * ventas una perdedora, probabilidades en orden) y un solo por defecto por
 * organización (índice `unique_default_pipeline_per_org`).
 *
 * Las plantillas siguen siendo `PIPELINE_TEMPLATES` (fuente única); aquí solo
 * se traducen al cuerpo de la RPC.
 */

import { z } from 'zod';
import type { CrmSesion } from './crmRouteSupport';
import type { PipelineTemplate } from './pipelineTemplates';

const etapaSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    probability: z.number().int().min(0).max(100).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    sla_days: z.number().int().min(0).max(3650).nullable().optional(),
    exit_criteria: z.union([z.record(z.unknown()), z.array(z.unknown())]).nullable().optional(),
    is_won: z.boolean().optional(),
    is_lost: z.boolean().optional(),
    description: z.string().max(1000).nullable().optional(),
  })
  .strict();

export const pipelineAltaSchema = z
  .object({
    template: z.string().max(40).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    pipeline_type: z.enum(['sales', 'onboarding', 'renewal']).optional(),
    is_default: z.boolean().optional(),
    goal_amount: z.number().min(0).max(1e13).optional(),
    goal_period: z.enum(['monthly', 'quarterly', 'yearly']).optional(),
    goal_currency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
    stages: z.array(etapaSchema).min(1).max(30).optional(),
  })
  .strict();

export type PipelineAlta = z.infer<typeof pipelineAltaSchema>;
type EtapaAlta = z.infer<typeof etapaSchema>;

/** Cuerpo de `crm_create_pipeline_with_stages`. */
export interface PipelineRpcData {
  name: string;
  pipeline_type: 'sales' | 'onboarding' | 'renewal';
  is_default: boolean;
  goal_amount?: number;
  goal_period?: string;
  goal_currency?: string;
  stages: EtapaAlta[];
}

/**
 * Plantilla (opcional) + lo que el usuario cambió → cuerpo de la RPC. Las
 * etapas explícitas mandan sobre las de la plantilla (paso 3 del asistente).
 * Devuelve `null` si falta el nombre o las etapas (la ruta responde 400).
 */
export function datosDePipeline(entrada: PipelineAlta, plantilla: PipelineTemplate | null): PipelineRpcData | null {
  const name = entrada.name ?? plantilla?.label;
  const stages: EtapaAlta[] | undefined =
    entrada.stages ??
    plantilla?.stages
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        name: s.name,
        probability: s.probability,
        color: s.color,
        sla_days: s.sla_days,
        is_won: s.is_won,
        is_lost: s.is_lost,
      }));
  if (!name || !stages || stages.length === 0) return null;
  const tipo = entrada.pipeline_type ?? (plantilla?.pipeline_type as PipelineRpcData['pipeline_type'] | null) ?? 'sales';
  return {
    name,
    pipeline_type: tipo,
    is_default: entrada.is_default ?? false,
    ...(entrada.goal_amount !== undefined ? { goal_amount: entrada.goal_amount } : {}),
    ...(entrada.goal_period ? { goal_period: entrada.goal_period } : {}),
    ...(entrada.goal_currency ? { goal_currency: entrada.goal_currency.toUpperCase() } : {}),
    stages,
  };
}

export async function crearPipeline(ctx: CrmSesion, datos: PipelineRpcData): Promise<{ pipeline: Record<string, unknown>; stages: Record<string, unknown>[] }> {
  const { data, error } = await ctx.supabase.rpc('crm_create_pipeline_with_stages', { p_org: ctx.organizationId, p_data: datos });
  if (error) throw error;
  return data as { pipeline: Record<string, unknown>; stages: Record<string, unknown>[] };
}

export async function marcarPipelinePorDefecto(ctx: CrmSesion, id: string): Promise<Record<string, unknown>> {
  const { data, error } = await ctx.supabase.rpc('crm_set_default_pipeline', { p_org: ctx.organizationId, p_id: id });
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function eliminarPipeline(ctx: CrmSesion, id: string): Promise<Record<string, unknown>> {
  const { data, error } = await ctx.supabase.rpc('crm_delete_pipeline', { p_org: ctx.organizationId, p_id: id });
  if (error) throw error;
  return data as Record<string, unknown>;
}
