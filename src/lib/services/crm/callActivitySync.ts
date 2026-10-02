/**
 * callActivitySync — una sola `activities` (activity_type 'call') por llamada.
 * GO Admin ERP — FASE-03 §2.2 paso 7 / D4 (SOLO servidor, service client).
 *
 * No existe trigger de BD; la actividad se crea/actualiza desde:
 *  - `/api/voice/status` y `/api/voice/dial-complete` al llegar a un estado terminal,
 *  - `callDispositionService.applyDisposition` (resultado, nota, próxima acción).
 *
 * Delegación: usa `callActivityService.upsertCallActivity` (F4: misma fila por
 * `activities.call_id`, la enriquece luego con transcript/análisis) pasando el
 * resultado de la disposición como `enrich.outcome` y la nota como `summary`.
 * Los errores se propagan para recuperar el evento; no existe un segundo escritor.
 * El trigger de activities actualiza ambos contactos con la misma evidencia temporal.
 *
 * Clave de unicidad: `activities.call_id` (índice UNIQUE parcial verificado).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isTerminalStatus } from './callStateMachine';
import { upsertCallActivity as upsertRichCallActivity, callChannel } from './callActivityService';

export interface CallForActivity {
  id: string;
  organization_id: number;
  direction: 'inbound' | 'outbound';
  mode: string;
  status: string;
  from_number: string;
  to_number: string;
  customer_id: string | null;
  opportunity_id: string | null;
  user_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  answered_by?: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Canal de la actividad. Delega en `callActivityService.callChannel` para que la
 * ruta principal (F4) y este respaldo (F3) escriban SIEMPRE el mismo valor
 * (`bridge` → `mobile`); antes divergían y la misma llamada quedaba con un canal
 * distinto según qué ruta la tocara primero (tester r1 nº 15).
 */
export function activityChannelForMode(mode: string): string {
  return callChannel(mode);
}

/** Metadata de disposición que se fusiona en `activities.metadata`. */
export function dispositionActivityMetadata(call: CallForActivity): Record<string, unknown> {
  const meta = call.metadata ?? {};
  const out: Record<string, unknown> = {
    source: 'voice',
    direction: call.direction,
    mode: call.mode,
    status: call.status,
    from: call.from_number,
    to: call.to_number,
  };
  if (meta.disposition_outcome) out.disposition_outcome = meta.disposition_outcome;
  if (meta.disposition_next_action) out.next_action = meta.disposition_next_action;
  return out;
}

/**
 * Crea o actualiza la actividad de la llamada. Devuelve el id de la actividad
 * (o null si no hay entidad relacionada o el estado no es terminal).
 */
export async function upsertCallActivity(call: CallForActivity, client: SupabaseClient): Promise<string | null> {
  if (!isTerminalStatus(call.status) || !call.ended_at) return null;
  const relatedType = call.opportunity_id ? 'opportunity' : call.customer_id ? 'customer' : null;
  const relatedId = call.opportunity_id ?? call.customer_id ?? null;
  if (!relatedType || !relatedId) return null;

  const rich = await upsertRichCallActivity(call.organization_id, call.id, {
    supabase: client,
    call: { ...call, answered_by: call.answered_by ?? null },
  });
  return rich?.activityId ?? null;
}
