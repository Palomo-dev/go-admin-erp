/** Respuestas del contrato privado. Las reglas financieras se prueban en Postgres. */
export const RESERVA_VOZ_DOBLE = '20000000-0000-4000-8000-000000000090';
export const LLAMADA_VOZ_DOBLE = '20000000-0000-4000-8000-000000000091';
export function dobleReservaVoz() {
  let preparacion: Record<string, unknown> = {};
  return (name: string, args: Record<string, unknown>): unknown => {
    if (name === 'crm_voice_dispatch_prepare') {
      preparacion = args;
      return { reservation_id: RESERVA_VOZ_DOBLE, call_id: LLAMADA_VOZ_DOBLE, created: true, state: 'reserved', submission_state: 'prepared' };
    }
    if (name === 'crm_voice_dispatch_begin') return true;
    if (name === 'crm_voice_dispatch_accept') return {
      reservation_id: args.p_reservation, call_id: LLAMADA_VOZ_DOBLE, voice_agent_call_id: preparacion.p_vac, attempt_no: preparacion.p_attempt,
    };
    if (name === 'crm_voice_dispatch_failure') return { refunded: false, uncertain: true, applied: true };
    if (name === 'crm_voice_retry_rejected') return { requeued: false, reason: 'retry_disabled' };
    return undefined;
  };
}
