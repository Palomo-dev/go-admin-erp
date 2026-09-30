/**
 * D-17: Barrido proactivo de llamadas atascadas.
 * 
 * Marca como failed las llamadas en dialing/ringing con más de 10 minutos.
 * Se ejecuta en cada status callback y al iniciar una nueva llamada para
 * prevenir que `canDial` quede bloqueado por concurrencia fantasma.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const STALLED_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos

/**
 * Variable de entorno para deshabilitar el barrido en tests.
 * NO usar en producción.
 */
const SWEEP_ENABLED = process.env.DISABLE_STALLED_CALLS_SWEEP !== 'true';

export async function sweepStalledCalls(
  orgId: number,
  supabase: SupabaseClient,
  nowMs?: number
): Promise<void> {
  if (!SWEEP_ENABLED) return;
  const now = nowMs ?? Date.now();
  const tenMinutesAgo = new Date(now - STALLED_TIMEOUT_MS).toISOString();
  
  // D-17: Buscar en `calls` que están en dialing/ringing (no en voice_agent_calls,
  // donde esos estados se mapean a in_progress). Luego obtener las filas
  // voice_agent_calls correspondientes para actualizar ambas tablas.
  const { data: stalledCalls, error: callsError } = await supabase
    .from('calls')
    .select('id, organization_id, status, started_at')
    .eq('organization_id', orgId)
    .in('status', ['dialing', 'ringing'])
    .lt('started_at', tenMinutesAgo)
    .is('ended_at', null);
  
  if (callsError) {
    console.error('[Stalled Calls Sweeper] Error al buscar llamadas atascadas:', callsError);
    return;
  }
  
  if (!stalledCalls || stalledCalls.length === 0) return;
  
  // Obtener las voice_agent_calls correspondientes
  const callIds = stalledCalls.map(c => c.id);
  const { data: stalledVacs, error: vacsError } = await supabase
    .from('voice_agent_calls')
    .select('id, call_id, status, started_at')
    .eq('organization_id', orgId)
    .in('call_id', callIds);
  
  if (vacsError) {
    console.error('[Stalled Calls Sweeper] Error al buscar voice_agent_calls:', vacsError);
    return;
  }
  
  const stalled = stalledVacs || [];
  
  const nowISO = new Date(now).toISOString();
  
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
        completed_at: nowISO,
        updated_at: nowISO,
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
          ended_at: nowISO,
          updated_at: nowISO
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
