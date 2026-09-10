/**
 * callDispositionService — "qué pasa al colgar" (FASE-03 §4.2).
 *
 * PATCH /api/crm/calls/[id] → `applyDisposition`:
 *  - `calls.metadata.disposition_outcome | disposition_next_action | disposition_note`
 *    (+ `status='voicemail'` si el resultado es buzón y la llamada estaba completed)
 *  - `opportunities.last_contact_at / contact_channel='call' / contact_result / next_contact_at`
 *    (el valor real que escribe `callActivitySync.touchOpportunityAfterCall:184`)
 *  - `tasks` si `next_action.type === 'task'` (related_to_type 'opportunity'|'customer')
 *  - actividad de la llamada (`callActivitySync.upsertCallActivity`)
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { upsertCallActivity, touchOpportunityAfterCall, type CallForActivity } from './callActivitySync';

/** Mismo vocabulario que `activities.outcome` de F4 (`answered|no_answer|voicemail|busy…`) + extras de disposición. */
export const DISPOSITION_OUTCOMES = ['answered', 'no_answer', 'voicemail', 'busy', 'wrong_number', 'callback_requested'] as const;
export type DispositionOutcome = (typeof DISPOSITION_OUTCOMES)[number];

export const DISPOSITION_LABELS: Record<DispositionOutcome, string> = {
  answered: 'Contactado',
  no_answer: 'No contesta',
  voicemail: 'Buzón de voz',
  busy: 'Ocupado',
  wrong_number: 'Número inválido',
  callback_requested: 'Pidió que lo llamen después',
};

export const NEXT_ACTION_TYPES = ['none', 'task', 'meeting', 'email', 'whatsapp', 'call'] as const;

export const dispositionSchema = z.object({
  outcome: z.enum(DISPOSITION_OUTCOMES),
  next_action: z
    .object({
      type: z.enum(NEXT_ACTION_TYPES),
      due_at: z.string().datetime({ offset: true }).optional().nullable(),
      title: z.string().max(200).optional().nullable(),
    })
    .optional()
    .nullable(),
  note: z.string().max(20000).optional().nullable(),
});
export type Disposition = z.infer<typeof dispositionSchema>;

export const callPatchSchema = z.object({
  disposition: dispositionSchema.optional(),
  live_note: z.string().max(20000).optional().nullable(),
  /** Alias simples (compatibilidad): outcome/notes sin próxima acción. */
  outcome: z.enum(DISPOSITION_OUTCOMES).optional(),
  notes: z.string().max(20000).optional().nullable(),
});
export type CallPatchInput = z.infer<typeof callPatchSchema>;

export interface CallRowForDisposition extends CallForActivity {
  answered_at: string | null;
}

export async function applyDisposition(
  call: CallRowForDisposition,
  userId: string,
  d: Disposition,
  client: SupabaseClient
): Promise<{ call: CallRowForDisposition; taskId: string | null; activityId: string | null }> {
  const meta: Record<string, unknown> = {
    ...(call.metadata ?? {}),
    disposition_outcome: d.outcome,
    disposition_note: d.note ?? call.metadata?.disposition_note ?? null,
    disposition_next_action: d.next_action && d.next_action.type !== 'none' ? d.next_action : null,
    disposition_by: userId,
    disposition_at: new Date().toISOString(),
  };
  const patch: Record<string, unknown> = { metadata: meta };
  let status = call.status;
  if (d.outcome === 'voicemail' && (call.status === 'completed' || call.status === 'no_answer')) {
    status = 'voicemail';
    patch.status = status;
  }
  // Llamadas aún activas (colgó pero el webhook no llegó): no tocamos status.

  const { data, error } = await client
    .from('calls')
    .update(patch)
    .eq('id', call.id)
    .eq('organization_id', call.organization_id)
    .select('*')
    .single();
  if (error) throw new Error(`No se pudo guardar la disposición: ${error.message}`);
  const updated = data as CallRowForDisposition;

  let taskId: string | null = null;
  const next = d.next_action;
  if (next && next.type === 'task') {
    const relatedType = call.opportunity_id ? 'opportunity' : call.customer_id ? 'customer' : null;
    const relatedId = call.opportunity_id ?? call.customer_id ?? null;
    const { data: task, error: taskErr } = await client
      .from('tasks')
      .insert({
        organization_id: call.organization_id,
        title: next.title?.trim() || `Seguimiento de llamada (${d.outcome.replace('_', ' ')})`,
        description: d.note ?? null,
        due_date: next.due_at ?? null,
        assigned_to: userId,
        created_by: userId,
        priority: 'med',
        status: 'open',
        related_to_id: relatedId,
        related_to_type: relatedType,
        customer_id: call.customer_id,
        type: 'call',
      })
      .select('id')
      .single();
    if (taskErr) console.warn('[callDisposition] tasks insert:', taskErr.message);
    else taskId = (task as { id: string }).id;
  }

  const activityId = await upsertCallActivity(updated, client);
  await touchOpportunityAfterCall(updated, client);
  return { call: updated, taskId, activityId };
}
