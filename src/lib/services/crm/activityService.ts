import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACTIVITY_TYPES } from '@/lib/crm/enums';

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
 * - Para tipos de contacto actualiza `opportunities.last_contact_at/contact_channel`.
 */

export const activityInputSchema = z.object({
  activity_type: z.enum(ACTIVITY_TYPES),
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
  metadata: z.record(z.unknown()).optional(),
  call_id: z.string().uuid().optional().nullable(),
  email_message_id: z.string().uuid().optional().nullable(),
  message_id: z.string().uuid().optional().nullable(),
  conversation_id: z.string().uuid().optional().nullable(),
});

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

const CONTACT_TYPES = new Set(['call', 'email', 'whatsapp', 'sms', 'meeting', 'visit', 'ai_call']);

export async function assertRelatedBelongsToOrg(
  orgId: number,
  type: 'opportunity' | 'customer',
  id: string,
  supabase: SupabaseClient
): Promise<{ customer_id: string | null }> {
  const table = type === 'opportunity' ? 'opportunities' : 'customers';
  const select = type === 'opportunity' ? 'id, customer_id' : 'id';
  const { data } = await supabase.from(table).select(select).eq('id', id).eq('organization_id', orgId).maybeSingle();
  if (!data) throw new RelatedNotFoundError();
  const row = data as unknown as { id: string; customer_id?: string | null };
  return { customer_id: row.customer_id ?? null };
}

/**
 * F9-16: `call_id` / `email_message_id` / `message_id` deben ser de la misma
 * organización. Solo había FK: se podía enlazar una activity a una llamada
 * ajena, lo que corrompe el de-duplicado del timeline y los informes.
 */
async function assertRefsBelongToOrg(orgId: number, input: ActivityInput, supabase: SupabaseClient): Promise<void> {
  const refs: Array<[string, string | null | undefined]> = [
    ['calls', input.call_id],
    ['email_messages', input.email_message_id],
    ['messages', input.message_id],
    ['conversations', input.conversation_id],
  ];
  for (const [table, id] of refs) {
    if (!id) continue;
    const { data } = await supabase.from(table).select('id').eq('id', id).eq('organization_id', orgId).maybeSingle();
    if (!data) throw new RelatedNotFoundError();
  }
}

export async function createActivity(
  orgId: number,
  userId: string,
  input: ActivityInput,
  supabase: SupabaseClient
): Promise<ActivityRow> {
  await assertRelatedBelongsToOrg(orgId, input.related_type, input.related_id, supabase);
  await assertRefsBelongToOrg(orgId, input, supabase);

  // Idempotencia por client_key
  const clientKey = input.metadata?.client_key;
  if (typeof clientKey === 'string' && clientKey) {
    const { data: existing } = await supabase
      .from('activities')
      .select('*')
      .eq('organization_id', orgId)
      .eq('related_id', input.related_id)
      .contains('metadata', { client_key: clientKey })
      .limit(1)
      .maybeSingle();
    if (existing) return existing as ActivityRow;
  }

  // Una sola actividad por llamada
  if (input.call_id) {
    const { data: dup } = await supabase
      .from('activities')
      .select('*')
      .eq('organization_id', orgId)
      .eq('call_id', input.call_id)
      .limit(1)
      .maybeSingle();
    if (dup) throw new DuplicateActivityError(dup as ActivityRow);
  }

  const occurredAt = input.occurred_at ?? new Date().toISOString();
  const { data, error } = await supabase
    .from('activities')
    .insert({
      organization_id: orgId,
      user_id: userId,
      activity_type: input.activity_type,
      related_type: input.related_type,
      related_id: input.related_id,
      notes: input.notes ?? null,
      channel: input.channel ?? null,
      outcome: input.outcome ?? null,
      duration_seconds: input.duration_seconds ?? null,
      occurred_at: occurredAt,
      metadata: { source: 'quick_actions', ...(input.metadata ?? {}) },
      call_id: input.call_id ?? null,
      email_message_id: input.email_message_id ?? null,
      message_id: input.message_id ?? null,
      conversation_id: input.conversation_id ?? null,
    })
    .select('*')
    .single();

  if (error || !data) throw new Error(`No se pudo crear la actividad: ${error?.message ?? 'sin datos'}`);

  if (input.related_type === 'opportunity' && CONTACT_TYPES.has(input.activity_type)) {
    // Pasada de gemelos (ronda 3): el resultado de este UPDATE se ignoraba. La
    // actividad ya está creada, así que un fallo aquí no debe tumbar la
    // petición, pero desincroniza `last_contact_at` y tiene que quedar registro.
    const { error: touchError } = await supabase
      .from('opportunities')
      .update({
        last_contact_at: occurredAt,
        contact_channel: input.channel ?? input.activity_type,
        ...(input.outcome ? { contact_result: input.outcome } : {}),
      })
      .eq('id', input.related_id)
      .eq('organization_id', orgId);
    if (touchError) {
      console.error(`[activityService] no se pudo actualizar el último contacto de la oportunidad ${input.related_id}: ${touchError.message}`);
    }
  }

  return data as ActivityRow;
}
