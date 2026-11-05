/**
 * Registro de llamadas y avisos de las integraciones de logística en `integration_events`.
 *
 * Trampas del esquema (verificadas por MCP): `connection_id` NOT NULL; `status` solo
 * received | processed | error; `source` webhook | sync | manual | system; `direction`
 * inbound | outbound; `event_time` lo pone la base. El índice único (connection_id,
 * external_event_id) deduplica los avisos: un registro auxiliar va con external_event_id null.
 * El error del insert se comprueba siempre (falla en silencio si no). El payload va redactado.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { redactar } from './redaccion';

export interface EventoIntegracion {
  connectionId: string;
  organizationId: number;
  eventType: string;
  source: 'webhook' | 'sync' | 'manual' | 'system';
  direction: 'inbound' | 'outbound';
  status: 'received' | 'processed' | 'error';
  payload?: unknown;
  errorMessage?: string | null;
  externalEventId?: string | null;
  /** Valores que nunca deben quedar en el registro (secretos de la conexión). */
  secretos?: readonly string[];
}

/** Devuelve true si quedó registrado; false si el evento ya existía (duplicado). Lanza si falla. */
export async function registrarEvento(db: SupabaseClient, evento: EventoIntegracion): Promise<boolean> {
  const payload = redactar(evento.payload ?? {}, evento.secretos ?? []);
  const { error } = await db.from('integration_events').insert({
    connection_id: evento.connectionId,
    organization_id: evento.organizationId,
    source: evento.source,
    direction: evento.direction,
    event_type: evento.eventType,
    status: evento.status,
    payload: payload && typeof payload === 'object' ? payload : { valor: payload },
    error_message: evento.errorMessage ? (redactar(evento.errorMessage, evento.secretos ?? []) as string).slice(0, 2000) : null,
    external_event_id: evento.externalEventId ?? null,
    processed_at: evento.status === 'received' ? null : new Date().toISOString(),
  });
  if (error) {
    if (error.code === '23505') return false;
    throw new Error(`integration_events: ${error.message}`);
  }
  return true;
}
