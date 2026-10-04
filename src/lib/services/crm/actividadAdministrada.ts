type ActividadAdministrada = { activity_type?: unknown; metadata?: unknown; call_id?: unknown };

/** Una reunión con evento real se modifica por la API de reuniones. */
export function esReunionDeCalendario(fila: ActividadAdministrada): boolean {
  if (fila.activity_type !== 'meeting' || !fila.metadata || typeof fila.metadata !== 'object' || Array.isArray(fila.metadata)) return false;
  const eventId = (fila.metadata as Record<string, unknown>).event_id;
  return typeof eventId === 'string' && eventId.trim().length > 0;
}

/** El resultado y las notas de una llamada vinculada se modifican en su ficha. */
export function esActividadDeLlamada(fila: ActividadAdministrada): boolean {
  if (fila.activity_type !== 'call' && fila.activity_type !== 'ai_call') return false;
  if (typeof fila.call_id === 'string' && fila.call_id.trim()) return true;
  if (!fila.metadata || typeof fila.metadata !== 'object' || Array.isArray(fila.metadata)) return false;
  const callId = (fila.metadata as Record<string, unknown>).call_id;
  return typeof callId === 'string' && callId.trim().length > 0;
}

export function esActividadAdministrada(fila: ActividadAdministrada): boolean {
  return esReunionDeCalendario(fila) || esActividadDeLlamada(fila);
}
