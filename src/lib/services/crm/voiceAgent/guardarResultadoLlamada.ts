/**
 * Escribe `voice_agent_calls.resultado` (categoría de `resultadoLlamada.ts`).
 *
 * SOLO servidor, con la organización ya resuelta desde la fila persistida.
 * Dos llamadores:
 *  - `conversationRelayHandler.endSession` (ws-server), al cerrarse la
 *    conversación: es la fuente buena, con los turnos y las herramientas. Pisa
 *    lo que hubiera, salvo la categoría que el modelo declaró en `end_call`,
 *    que entra como `resultadoAgente`.
 *  - `/api/voice/ai-agent/status`, con el estado final de Twilio: solo escribe
 *    si aún no hay resultado (`.is('resultado', null)`), así no pisa al
 *    ws-server cuando llega después.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { clasificarResultado, type HerramientaEjecutada, type ResultadoLlamada } from './resultadoLlamada';

interface FilaResultado {
  status: string | null;
  outcome: string | null;
  resultado: string | null;
}

/**
 * Al cerrarse la conversación del ws-server. La fila puede seguir en
 * `in_progress` (el `completed` de Twilio llega después): una conversación que
 * terminó cuenta como `completed`.
 */
export async function guardarResultadoConversacion(
  sb: SupabaseClient,
  orgId: number,
  voiceAgentCallId: string,
  turnosCliente: number
): Promise<ResultadoLlamada | null> {
  const [{ data: fila, error: filaError }, { data: runs, error: runsError }] = await Promise.all([
    sb
      .from('voice_agent_calls')
      .select('status, outcome, resultado')
      .eq('id', voiceAgentCallId)
      .eq('organization_id', orgId)
      .maybeSingle(),
    sb
      .from('voice_agent_tool_runs')
      .select('tool, status, args')
      .eq('organization_id', orgId)
      .eq('voice_agent_call_id', voiceAgentCallId),
  ]);
  if (filaError || !fila) {
    console.error('[resultadoLlamada] no se pudo leer la llamada:', filaError?.message ?? 'sin fila');
    return null;
  }
  if (runsError) console.error('[resultadoLlamada] no se pudieron leer las herramientas:', runsError.message);

  const f = fila as FilaResultado;
  const status = !f.status || ['pending', 'queued', 'in_progress'].includes(f.status) ? 'completed' : f.status;
  const resultado = clasificarResultado({
    status,
    outcome: f.outcome,
    herramientas: (runs ?? []) as HerramientaEjecutada[],
    turnosCliente,
    resultadoAgente: f.resultado,
  });
  if (!resultado || resultado === f.resultado) return resultado;

  const { error } = await sb
    .from('voice_agent_calls')
    .update({ resultado })
    .eq('id', voiceAgentCallId)
    .eq('organization_id', orgId);
  if (error) {
    console.error('[resultadoLlamada] no se pudo guardar el resultado:', error.message);
    return null;
  }
  return resultado;
}

/**
 * Con el estado final de Twilio (`statusCallback`). Solo llena el hueco: si
 * el ws-server ya clasificó la conversación, no se toca.
 */
export async function guardarResultadoPorEstado(
  sb: SupabaseClient,
  orgId: number,
  voiceAgentCallId: string,
  status: string | null,
  outcome: string | null
): Promise<void> {
  const resultado = clasificarResultado({ status, outcome, turnosCliente: 0 });
  if (!resultado) return;
  const { error } = await sb
    .from('voice_agent_calls')
    .update({ resultado })
    .eq('id', voiceAgentCallId)
    .eq('organization_id', orgId)
    .is('resultado', null);
  if (error) console.error('[resultadoLlamada] no se pudo guardar el resultado por estado:', error.message);
}
