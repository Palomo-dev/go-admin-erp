import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Etapa de desenlace (ganada/perdida) de un pipeline: la indicada (si es del
 * pipeline y del tipo pedido) o la primera por `position`; `null` si no hay.
 *
 * Criterio ÚNICO: lo usan `opportunityStageHttp.etapaDeDesenlace` (rutas
 * `…/win` y `…/lose`, que traducen el `null` a 400/409) y el agente de voz al
 * dar por perdida una oportunidad (`voiceAgent/perdidaPorDesinteres.ts`).
 * Vive aparte de `opportunityStageHttp` porque aquel importa `next/server` y
 * el servidor de voz (ws-server) no puede cargarlo.
 */
export async function buscarEtapaDeDesenlace(
  supabase: SupabaseClient,
  pipelineId: string,
  tipo: 'won' | 'lost',
  stageId?: string,
): Promise<string | null> {
  const columna = tipo === 'won' ? 'is_won' : 'is_lost';
  let q = supabase.from('stages').select('id').eq('pipeline_id', pipelineId).eq(columna, true);
  if (stageId) q = q.eq('id', stageId);
  const { data, error } = await q.order('position', { ascending: true }).limit(1).maybeSingle();
  if (error) throw error;
  return (data as { id: string } | null)?.id ?? null;
}
