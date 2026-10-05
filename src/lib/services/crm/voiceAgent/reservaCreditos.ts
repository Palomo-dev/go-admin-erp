/** Compatibilidad con llamadas sin libro privado: nunca devolver a partir de flags editables. */

import type { SupabaseClient } from '@supabase/supabase-js';
import { VoiceCreditPendingError } from './creditosVoz';

/** Estados de `voice_agent_calls` en los que no hubo conversación con el modelo. */
export const ESTADOS_SIN_CONVERSACION = ['no_answer', 'failed', 'canceled', 'voicemail'] as const;

export function sinConversacion(status: string | null | undefined): boolean {
  return !!status && (ESTADOS_SIN_CONVERSACION as readonly string[]).includes(status);
}

/**
 * Compatibilidad con filas anteriores al libro privado. Los flags públicos no
 * prueban un débito: una reserva antigua sin evidencia exige conciliación.
 * Las llamadas nuevas se devuelven exclusivamente con crm_voice_callback_apply.
 */
export async function devolverReservaSinConversacion(
  supabase: SupabaseClient,
  vac: { organization_id: number; credits_reserved: number | null; credits_settled_at: string | null }
): Promise<{ credits_reserved: number; credits_settled_at: string } | null> {
  const reservado = vac.credits_reserved ?? 0;
  if (reservado <= 0 || vac.credits_settled_at) return null;
  void supabase;
  throw new VoiceCreditPendingError();
}
