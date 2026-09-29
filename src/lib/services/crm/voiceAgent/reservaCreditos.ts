/**
 * Devolución de la reserva de minutos de una llamada del agente que NO llegó a
 * conversar (F-NEW-6 + buzón de voz, 2026-09-30).
 *
 * El despachador reserva `CREDITS_RESERVED_PER_CALL` antes de marcar y el
 * ws-server concilia al colgar. Si la conversación nunca empezó —nadie
 * contestó, comunicaba, falló, se canceló o contestó una máquina— el ws-server
 * no abre sesión y la reserva se quedaba cobrada. Una sola implementación para
 * los dos sitios que lo detectan: el `statusCallback` y el TwiML del agente
 * (AMD). Idempotente por `credits_settled_at`.
 *
 * SOLO servidor, con la organización ya resuelta desde la fila persistida.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** Estados de `voice_agent_calls` en los que no hubo conversación con el modelo. */
export const ESTADOS_SIN_CONVERSACION = ['no_answer', 'failed', 'canceled', 'voicemail'] as const;

export function sinConversacion(status: string | null | undefined): boolean {
  return !!status && (ESTADOS_SIN_CONVERSACION as readonly string[]).includes(status);
}

/**
 * Devuelve la reserva si queda algo sin conciliar. Devuelve el parche que el
 * llamador debe escribir en la fila (o `null` si no había nada que devolver).
 * Lanza si el reembolso falla: el llamador responde 5xx y Twilio reintenta.
 */
export async function devolverReservaSinConversacion(
  supabase: SupabaseClient,
  vac: { organization_id: number; credits_reserved: number | null; credits_settled_at: string | null }
): Promise<{ credits_reserved: number; credits_settled_at: string } | null> {
  const reservado = vac.credits_reserved ?? 0;
  if (reservado <= 0 || vac.credits_settled_at) return null;
  const { error } = await supabase.rpc('deduct_comm_credits', {
    p_org_id: vac.organization_id,
    p_channel: 'voice',
    p_amount: -reservado,
  });
  if (error) throw error;
  return { credits_reserved: 0, credits_settled_at: new Date().toISOString() };
}
