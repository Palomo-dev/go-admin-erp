/**
 * D-17: Barrido proactivo de llamadas atascadas.
 * 
 * Marca como failed las llamadas en dialing/ringing con más de 10 minutos.
 * Se ejecuta en cada status callback y al iniciar una nueva llamada para
 * prevenir que `canDial` quede bloqueado por concurrencia fantasma.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const STALLED_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos

export async function sweepStalledCalls(
  orgId: number,
  supabase: SupabaseClient
): Promise<void> {
  const tenMinutesAgo = new Date(Date.now() - STALLED_TIMEOUT_MS).toISOString();
  
  const { data: stalled, error } = await supabase
    .from('voice_agent_calls')
    .select('id, call_id, status, started_at')
    .eq('organization_id', orgId)
    .in('status', ['dialing', 'ringing'])
    .lt('started_at', tenMinutesAgo);
  
  if (error) {
    console.error('[Stalled Calls Sweeper] Error al buscar llamadas atascadas:', error);
    return;
  }
  
  if (!stalled || stalled.length === 0) return;
  
  const now = new Date().toISOString();
  
  for (const vac of stalled) {
    console.warn('[Stalled Calls Sweeper] Cerrando llamada atascada', {
      vacId: vac.id,
      callId: vac.call_id,
      status: vac.status,
      startedAt: vac.started_at,
      orgId
    });
    
    // Actualizar voice_agent_calls
    const { error: vacError } = await supabase
      .from('voice_agent_calls')
      .update({
        status: 'failed',
        outcome: 'stuck_timeout',
        completed_at: now,
        updated_at: now,
        locked_by: null
      })
      .eq('id', vac.id)
      .eq('organization_id', orgId);
    
    if (vacError) {
      console.error('[Stalled Calls Sweeper] Error al actualizar voice_agent_calls:', vacError);
    }
    
    // Actualizar calls espejo si existe
    if (vac.call_id) {
      const { error: callError } = await supabase
        .from('calls')
        .update({
          status: 'failed',
          ended_at: now,
          updated_at: now
        })
        .eq('id', vac.call_id)
        .eq('organization_id', orgId);
      
      if (callError) {
        console.error('[Stalled Calls Sweeper] Error al actualizar calls:', callError);
      }
    }
  }
  
  if (stalled.length > 0) {
    console.log(`[Stalled Calls Sweeper] ${stalled.length} llamadas atascadas cerradas para org ${orgId}`);
  }
}
