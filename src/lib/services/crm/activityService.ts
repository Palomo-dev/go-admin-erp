import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACTIVITY_TYPES } from '@/lib/crm/enums';
import { seguimientoSchema } from './tareaRapidaService';

/**
 * activityService — creación server-side de actividades CRM (FASE-09 §4.2).
 *
 * Sustituye a `opportunitiesService.createActivity` (cliente). El cliente
 * nunca inserta en `activities`: siempre `POST /api/crm/activities`.
 *
 * - `organization_id` y `user_id` vienen de sesión.
 * - `related_id` debe pertenecer a la org (404 si no).
 * - Si `call_id` ya tiene actividad → 409 (la fila canónica es una sola).
 * - `metadata.client_key` opcional: idempotencia (devuelve la existente).
 * - Una RPC guarda historial y contacto juntos; deriva el autor de la sesión.
 */

export const activityInputSchema = z.object({
  activity_type: z.enum(ACTIVITY_TYPES).refine(type => !['system', 'ai_call', 'task'].includes(type), { message: 'Ese tipo se registra desde su flujo correspondiente' }),
  related_type: z.enum(['opportunity', 'customer']),
  related_id: z.string().uuid(),
  notes: z.string().max(20000).optional().nullable(),
  channel: z.string().max(40).optional().nullable(),
  outcome: z.string().max(60).optional().nullable(),
  duration_seconds: z.number().int().min(0).max(86400).optional().nullable(),
  occurred_at: z
    .string()
    .datetime({ offset: true })
    // F9-17: nada de actividades en el futuro (se admiten 5 min de desfase de
    // reloj). Una fecha futura ancla la entrada arriba del timeline para siempre
    // y escribe `opportunities.last_contact_at` en el futuro.
    .refine((v) => Date.parse(v) <= Date.now() + 5 * 60_000, {
      message: 'occurred_at no puede estar en el futuro',
    })
    .optional(),
  metadata: z.record(z.unknown()).refine(metadata =>
    !['event_id', 'activity_id', 'completed_at', 'voice_agent_call_id', 'request_fingerprint', 'follow_up_id'].some(key => key in metadata)
    && (metadata.client_key === undefined || (typeof metadata.client_key === 'string' && metadata.client_key.length > 0 && metadata.client_key.length <= 120)),
  { message: 'Metadata reservada o clave de reintento inválida' }).optional(),
  follow_up: seguimientoSchema.optional(),
  call_id: z.string().uuid().optional().nullable(),
  email_message_id: z.string().uuid().optional().nullable(),
  message_id: z.string().uuid().optional().nullable(),
  conversation_id: z.string().uuid().optional().nullable(),
}).strict().refine(input => !input.follow_up || input.activity_type === 'call', { message: 'El seguimiento requiere una llamada' });

export type ActivityInput = z.infer<typeof activityInputSchema>;

export interface ActivityRow {
  id: string;
  organization_id: number;
  activity_type: string;
  user_id: string | null;
  notes: string | null;
  related_type: string | null;
  related_id: string | null;
  occurred_at: string;
  channel: string | null;
  outcome: string | null;
  duration_seconds: number | null;
  metadata: Record<string, unknown>;
  call_id: string | null;
  email_message_id: string | null;
  message_id: string | null;
  conversation_id: string | null;
  created_at: string;
}

export class RelatedNotFoundError extends Error {
  constructor() {
    super('Entidad relacionada no encontrada en la organización');
    this.name = 'RelatedNotFoundError';
  }
}

export class DuplicateActivityError extends Error {
  existing: ActivityRow;
  constructor(existing: ActivityRow) {
    super('La llamada ya tiene una actividad registrada');
    this.name = 'DuplicateActivityError';
    this.existing = existing;
  }
}

export async function assertRelatedBelongsToOrg(
  orgId: number,
  type: 'opportunity' | 'customer',
  id: string,
  supabase: SupabaseClient
): Promise<{ customer_id: string | null }> {
  const table = type === 'opportunity' ? 'opportunities' : 'customers';
  const select = type === 'opportunity' ? 'id, customer_id' : 'id';
  const { data, error } = await supabase.from(table).select(select).eq('id', id).eq('organization_id', orgId).maybeSingle();
  if (error) throw error;
  if (!data) throw new RelatedNotFoundError();
  const row = data as unknown as { id: string; customer_id?: string | null };
  return { customer_id: row.customer_id ?? null };
}

/** Autor y organización se comprueban nuevamente dentro de la transacción. */
export async function createActivity(
  orgId: number,
  _userId: string,
  input: ActivityInput,
  supabase: SupabaseClient
): Promise<ActivityRow> {
  const { data, error } = await supabase.rpc('fn_crm_registrar_actividad', {
    p_org: orgId, p_payload: input,
  });
  if (error) {
    if (error.code === 'P0002') throw new RelatedNotFoundError();
    throw error;
  }
  if (!data || typeof data !== 'object' || !data.activity?.id) {
    throw new Error('La actividad no devolvió su historial');
  }
  if (data.duplicate === true) throw new DuplicateActivityError(data.activity as ActivityRow);
  return data.activity as ActivityRow;
}
