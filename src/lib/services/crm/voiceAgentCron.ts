/**
 * Ejecución del despachador de campañas del agente IA (FASE 06).
 *
 * Vive fuera de los route handlers porque un archivo `route.ts` de Next.js no puede
 * exportar nada más que sus handlers y su configuración; la lógica compartida entre
 * la ruta canónica (`/api/voice/agent-campaigns/run`) y el alias histórico
 * (`/api/crm/voice-agents/campaigns/run`) tiene que estar aquí.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { runCampaignQueue, type RunCampaignQueueResult } from '@/lib/services/crm/voiceAgentService';

export interface CampaignRunRow extends RunCampaignQueueResult {
  organization_id: number;
}

export interface CampaignRunSummary {
  results: CampaignRunRow[];
  total_calls_initiated: number;
  total_errors: string[];
  campaigns_stopped: string[];
  execution_time_ms: number;
  date: string;
}

function emptyRow(organizationId: number, message: string): CampaignRunRow {
  return {
    organization_id: organizationId,
    campaigns_processed: 0,
    calls_initiated: 0,
    calls_skipped: 0,
    calls_enqueued: 0,
    campaigns_stopped: [],
    errors: [message],
  };
}

function summarize(results: CampaignRunRow[], startedAt: number): CampaignRunSummary {
  return {
    results,
    total_calls_initiated: results.reduce((sum, r) => sum + r.calls_initiated, 0),
    total_errors: results.flatMap((r) => r.errors),
    campaigns_stopped: results.flatMap((r) => r.campaigns_stopped),
    execution_time_ms: Date.now() - startedAt,
    date: new Date().toISOString(),
  };
}

/** Recorre las organizaciones con campañas `running` y sin parada de emergencia. */
export async function runCampaignsForAllOrgs(
  supabase: SupabaseClient,
  worker: string
): Promise<CampaignRunSummary> {
  const startedAt = Date.now();

  const { data, error } = await supabase
    .from('voice_agent_campaigns')
    .select('organization_id')
    .eq('status', 'running')
    .eq('emergency_stop', false);
  if (error) throw error;

  const orgIds = Array.from(
    new Set((data || []).map((r) => (r as { organization_id: number }).organization_id))
  );

  const results: CampaignRunRow[] = [];
  for (const orgId of orgIds) {
    try {
      const result = await runCampaignQueue(orgId, supabase, { worker });
      results.push({ organization_id: orgId, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      // El error viaja al informe con su mensaje real: nunca se convierte en «0 llamadas».
      console.error(`[Voice Agent Queue] org ${orgId}:`, message);
      results.push(emptyRow(orgId, message));
    }
  }

  return summarize(results, startedAt);
}

/** Ejecuta el despachador para una sola organización (alias histórico del cron). */
export async function runCampaignsForOrg(
  supabase: SupabaseClient,
  organizationId: number,
  worker: string
): Promise<CampaignRunSummary> {
  const startedAt = Date.now();
  try {
    const result = await runCampaignQueue(organizationId, supabase, { worker });
    return summarize([{ organization_id: organizationId, ...result }], startedAt);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error(`[Voice Agent Queue] org ${organizationId}:`, message);
    return summarize([emptyRow(organizationId, message)], startedAt);
  }
}
