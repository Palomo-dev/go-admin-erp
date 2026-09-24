import type { SupabaseClient } from '@supabase/supabase-js';
import { runCampaignsForAllOrgs, type CampaignRunSummary } from '@/lib/services/crm/voiceAgentCron';
import type { makeJobLogger } from '../runner';

/**
 * F6 — tarea programada EN PROCESO que drena la cola de campañas del agente de
 * voz (`ScheduledTask 'voice_campaigns'`, ver `scheduledOrgs.ts`).
 *
 * Es el eslabón que faltaba: `runCampaignQueue` estaba implementada y protegida
 * (reclamo atómico, topes, consentimiento), pero solo la alcanzaban dos rutas de
 * cron que NADIE llamaba —`vercel.json` no tenía ninguna entrada de voz— así que
 * una campaña `running` se quedaba muda para siempre.
 *
 * Aquí NO se duplica nada de la lógica de marcación (regla dura 7): se llama a
 * `runCampaignsForAllOrgs`, el mismo punto que usan las dos rutas de cron. Este
 * módulo solo aporta el presupuesto y el registro estructurado.
 *
 * Por qué es seguro que dos pasadas se solapen: la reserva de filas es de la
 * base (`fn_claim_voice_agent_calls`, FOR UPDATE SKIP LOCKED) y el intento queda
 * anotado en `voice_agent_call_attempts` antes de marcar. Dos ejecuciones
 * simultáneas reclaman conjuntos disjuntos; ninguna marca dos veces la misma
 * fila. Por eso esta tarea NO necesita un cerrojo propio.
 */
export type VoiceCampaignsResult = CampaignRunSummary;

export async function runVoiceCampaigns(
  sb: SupabaseClient,
  log: ReturnType<typeof makeJobLogger>,
  signal: AbortSignal,
  opts: { budgetMs: number; worker: string }
): Promise<VoiceCampaignsResult> {
  const summary = await runCampaignsForAllOrgs(sb, opts.worker, { signal, budgetMs: opts.budgetMs });
  log.info('voice_campaigns_done', {
    orgs: summary.results.length,
    calls_initiated: summary.total_calls_initiated,
    campaigns_stopped: summary.campaigns_stopped.length,
    errors: summary.total_errors.length,
    ms: summary.execution_time_ms,
    ...(summary.truncated ? { truncated: true, pending: summary.pending_org_ids?.length ?? 0 } : {}),
  });
  // Los motivos por los que una campaña no marcó viajan en `total_errors`: son
  // exactamente los que el panel muestra al usuario, no se silencian aquí.
  for (const message of summary.total_errors.slice(0, 20)) log.warn('voice_campaigns_blocked', { message });
  return summary;
}
