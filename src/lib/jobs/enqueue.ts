import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import { isJobKind, type JobKind } from './types';

/**
 * Productores de la cola y del outbox. SOLO servidor (usa service_role):
 * las RPC `fn_enqueue_job` / `fn_emit_crm_event` tienen EXECUTE revocado para
 * `authenticated`, así que desde el browser fallarían igualmente.
 */

export interface EnqueueJobInput {
  organizationId: number;
  kind: JobKind;
  payload?: Record<string, unknown>;
  /** Fecha de ejecución (default now()). */
  runAt?: Date | string;
  /**
   * Clave de idempotencia. Con el índice parcial de BD, un job con la misma
   * clave en `queued|running` no se duplica (la RPC devuelve el id existente).
   */
  dedupeKey?: string;
  maxAttempts?: number;
  /** Inyectable en tests / transacciones. */
  supabase?: SupabaseClient;
}

/** `runAt` → ISO válido (tester r1: antes se pasaba cualquier string a la RPC). */
export function normalizeRunAt(runAt: Date | string | undefined): string {
  if (runAt === undefined) return new Date().toISOString();
  const d = runAt instanceof Date ? runAt : new Date(runAt);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`enqueueJob: runAt inválido "${String(runAt)}" (se espera Date o ISO 8601)`);
  }
  return d.toISOString();
}

export async function enqueueJob(input: EnqueueJobInput): Promise<string> {
  if (!Number.isInteger(input.organizationId) || input.organizationId <= 0) {
    throw new Error('enqueueJob: organizationId inválido');
  }
  if (!isJobKind(input.kind)) {
    throw new Error(`enqueueJob: kind inválido "${String(input.kind)}"`);
  }

  const sb = input.supabase ?? getServiceClient();
  const runAt = normalizeRunAt(input.runAt);

  const params: Record<string, unknown> = {
    p_org: input.organizationId,
    p_kind: input.kind,
    p_payload: input.payload ?? {},
    p_run_at: runAt,
    p_dedupe_key: input.dedupeKey ?? null,
  };
  if (input.maxAttempts !== undefined) params.p_max_attempts = input.maxAttempts;

  const { data, error } = await sb.rpc('fn_enqueue_job', params);
  if (error) {
    throw new Error(`fn_enqueue_job(${input.kind}) falló: ${error.message}`);
  }
  if (typeof data !== 'string') {
    throw new Error('fn_enqueue_job no devolvió un uuid');
  }
  return data;
}

export interface EmitCrmEventInput {
  organizationId: number;
  /** p. ej. 'opportunity.stage_changed', 'call.completed', 'email.opened' (FASE-08 §2.3). */
  type: string;
  /** 'opportunity' | 'call' | 'email_message' | 'message' | 'task' | 'customer' … */
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
  supabase?: SupabaseClient;
}

/**
 * Inserta en `crm_events` (outbox) vía `fn_emit_crm_event`, que además encola
 * el job `crm_event` con `dedupe_key = crm_event:{id}` (corrección tester #2).
 * Devuelve el id del evento.
 */
export async function emitCrmEvent(input: EmitCrmEventInput): Promise<string> {
  if (!Number.isInteger(input.organizationId) || input.organizationId <= 0) {
    throw new Error('emitCrmEvent: organizationId inválido');
  }
  if (!input.type || !input.type.includes('.')) {
    throw new Error(`emitCrmEvent: type inválido "${input.type}" (formato entidad.accion)`);
  }
  if (!input.entityType || !input.entityId) {
    throw new Error('emitCrmEvent: entityType/entityId requeridos');
  }

  const sb = input.supabase ?? getServiceClient();
  const { data, error } = await sb.rpc('fn_emit_crm_event', {
    p_org: input.organizationId,
    p_type: input.type,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
    p_payload: input.payload ?? {},
  });
  if (error) {
    throw new Error(`fn_emit_crm_event(${input.type}) falló: ${error.message}`);
  }
  if (typeof data !== 'string') {
    throw new Error('fn_emit_crm_event no devolvió un uuid');
  }
  return data;
}
