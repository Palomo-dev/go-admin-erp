/** Reserva e intención privadas; el proveedor queda fuera de la transacción y su incertidumbre se conserva. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { parametrosAmd } from './amd';
import {
  prepararCreditoVoz, iniciarEnvioVoz, cancelarPreparacionVoz, confirmarEnvioVoz,
  registrarFalloEnvioVoz, programarReintentoVoz, VoiceCreditPendingError, type PreparacionCreditoVoz,
} from './creditosVoz';

const PREPARACION_RECHAZADA = new Set([
  'preparacion_voz_invalida', 'intento_voz_no_reclamado', 'agente_no_encontrado', 'objetivo_voz_ajeno',
  'contacto_no_autorizado', 'canal_voz_inactivo', 'politica_datos_pendiente', 'campana_no_ejecutable',
  'rne_pendiente', 'concurrencia_voz', 'tope_intentos_voz', 'tope_cliente_voz', 'destinatario_voz_modificado', 'creditos_insuficientes',
]);
/** Solo errores que prueban que preparar revirtió sin reservar ni enviar. */
export function preparacionVozRechazada(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown };
  return ['P0001', 'P0002', '22023'].includes(String(e.code)) && PREPARACION_RECHAZADA.has(String(e.message));
}
export interface DespachoConReserva {
  supabase: SupabaseClient; organizationId: number; agentId: string; webhookBase: string;
  preparation: PreparacionCreditoVoz;
  provider: { calls: { create: (options: Record<string, unknown>) => Promise<{ sid: string }> } };
}
export interface ResultadoDespachoConReserva { initiated: boolean; reason?: string; providerFailure?: boolean }

export async function despacharVozConReserva(input: DespachoConReserva): Promise<ResultadoDespachoConReserva> {
  const { supabase, organizationId: org, preparation, provider } = input;
  let prepared;
  try {
    prepared = await prepararCreditoVoz(supabase, org, preparation);
  } catch (error) {
    if (preparacionVozRechazada(error)) throw error;
    // Incluso una respuesta perdida al preparar puede haber creado la reserva.
    throw new VoiceCreditPendingError(error);
  }
  const reservation = prepared.reservation_id;
  let began: boolean;
  try {
    began = await iniciarEnvioVoz(supabase, org, reservation);
  } catch (error) {
    try {
      const canceled = await cancelarPreparacionVoz(supabase, org, reservation);
      if (canceled) return { initiated: false, reason: 'La llamada cambió antes de enviarse.' };
    } catch {
      // La reserva sigue conciliable. El siguiente intento no se envía aquí.
    }
    throw new VoiceCreditPendingError(error);
  }
  if (!began) return { initiated: false, reason: 'El intento ya fue procesado.' };

  const query = new URLSearchParams({ callId: preparation.callId, reservationId: reservation });
  const statusUrl = `${input.webhookBase}/api/voice/ai-agent/status?${query}`;
  query.set('agentId', input.agentId);
  const twimlUrl = `${input.webhookBase}/api/voice/twiml/ai-agent?${query}`;
  let call: { sid: string };
  try {
    call = await provider.calls.create({
      to: preparation.to, from: preparation.from, url: twimlUrl,
      statusCallback: statusUrl, statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST', timeout: 30, ...parametrosAmd(),
      // La grabación se inicia en TwiML después del aviso y del acta; nunca aquí.
    });
  } catch (error) {
    try {
      const failure = await registrarFalloEnvioVoz(supabase, org, reservation, error);
      if (failure.refunded && !failure.uncertain) {
        await programarReintentoVoz(supabase, org, reservation);
        return { initiated: false, reason: 'El proveedor rechazó la llamada.', providerFailure: true };
      }
    } catch (reconciliationError) {
      throw new VoiceCreditPendingError(reconciliationError);
    }
    throw new VoiceCreditPendingError(error);
  }
  // Un error después de aceptar jamás se presenta como un rechazo para devolver.
  try {
    const confirmed = await confirmarEnvioVoz(supabase, org, reservation, call.sid);
    if (confirmed.call_id !== prepared.call_id || confirmed.voice_agent_call_id !== preparation.callId || confirmed.attempt_no !== preparation.attempt)
      throw new Error('Correlación del intento de voz inválida');
  } catch (error) {
    throw new VoiceCreditPendingError(error);
  }
  return { initiated: true };
}
