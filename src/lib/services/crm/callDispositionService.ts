/**
 * callDispositionService — "qué pasa al colgar" (FASE-03 §4.2).
 *
 * PATCH /api/crm/calls/[id] → `applyDisposition`:
 *  - `calls.metadata.disposition_outcome | disposition_next_action | disposition_note`
 *    (+ `status='voicemail'` si el resultado es buzón y la llamada estaba completed)
 *  - `opportunities.last_contact_at / contact_channel='call' / contact_result / next_contact_at`
 *    mediante el trigger canónico de activities (fecha de inicio real)
 *  - `tasks` si `next_action.type === 'task'` (related_to_type 'opportunity'|'customer')
 *  - actividad de la llamada (`callActivitySync.upsertCallActivity`)
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { upsertCallActivity, type CallForActivity } from './callActivitySync';
import { isAtomicCallRpcEnabled, mutateCallFromSnapshot } from './callMutationService';

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
    .strict()
    .optional()
    .nullable(),
  note: z.string().max(20000).optional().nullable(),
  do_not_call: z.boolean().optional(),
}).strict().refine(
  (value) => !value.do_not_call || !value.next_action || value.next_action.type === 'none',
  { message: 'Una exclusión no puede programar un nuevo contacto', path: ['next_action'] },
);
export type Disposition = z.infer<typeof dispositionSchema>;

export const callPatchSchema = z.object({
  client_key: z.string().min(1).max(120).optional(),
  disposition: dispositionSchema.optional(),
  live_note: z.string().max(20000).optional().nullable(),
  /** Alias simples (compatibilidad): outcome/notes sin próxima acción. */
  outcome: z.enum(DISPOSITION_OUTCOMES).optional(),
  notes: z.string().max(20000).optional().nullable(),
}).strict().refine((v) => v.disposition !== undefined || v.live_note !== undefined || v.outcome !== undefined, 'Nada que actualizar');
export type CallPatchInput = z.infer<typeof callPatchSchema>;

export interface CallRowForDisposition extends CallForActivity {
  answered_at: string | null;
}

export async function applyDisposition(
  call: CallRowForDisposition,
  userId: string,
  d: Disposition,
  client: SupabaseClient,
  options: { liveNote?: string | null; assertOwner?: (fresh: CallRowForDisposition) => void | Promise<void>; sessionClient?: SupabaseClient; clientKey?: string } = {},
): Promise<{ call: CallRowForDisposition; taskId: string | null; activityId: string | null }> {
  if (d.do_not_call && !isAtomicCallRpcEnabled()) {
    throw new Error('La exclusión necesita el guardado atómico de llamadas');
  }
  if (isAtomicCallRpcEnabled()) {
    if (!options.sessionClient) throw new Error('La disposición necesita la sesión del usuario');
    const payload = { disposition: d, ...(options.liveNote !== undefined ? { live_note: options.liveNote } : {}) };
    const digest = options.clientKey ? null : await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
    const key = options.clientKey ?? `compat:${Array.from(new Uint8Array(digest as ArrayBuffer), (v) => v.toString(16).padStart(2, '0')).join('')}`;
    const { data, error } = await options.sessionClient.rpc('fn_crm_disponer_llamada', {
      p_org: call.organization_id, p_call: call.id, p_key: key, p_payload: payload,
    });
    if (error) throw error;
    const result = data as { call?: CallRowForDisposition; task_id?: string | null; activity_id?: string | null } | null;
    if (!result?.call || result.call.id !== call.id || result.call.organization_id !== call.organization_id) throw new Error('Respuesta inválida al guardar la disposición');
    if (d.do_not_call && result.call.metadata?.disposition_do_not_call !== true) throw new Error('La respuesta no confirma la exclusión del número');
    return { call: result.call, taskId: result.task_id ?? null, activityId: result.activity_id ?? null };
  }
  const updated = await mutateCallFromSnapshot(client, call, async (fresh) => {
    await options.assertOwner?.(fresh);
    const meta: Record<string, unknown> = {
      ...(fresh.metadata ?? {}),
      disposition_outcome: d.outcome,
      disposition_note: d.note !== undefined ? d.note : fresh.metadata?.disposition_note ?? null,
      disposition_next_action: d.next_action && d.next_action.type !== 'none' ? d.next_action : null,
      disposition_by: userId,
      disposition_at: new Date().toISOString(),
    };
    if (options.liveNote !== undefined) meta.live_note = options.liveNote;
    const patch: Record<string, unknown> = { metadata: meta };
    if (d.outcome === 'voicemail' && (fresh.status === 'completed' || fresh.status === 'no_answer')) patch.status = 'voicemail';
    return patch;
  });

  let taskId: string | null = null;
  const next = d.next_action;
  if (next && next.type === 'task') {
    const relatedType = updated.opportunity_id ? 'opportunity' : updated.customer_id ? 'customer' : null;
    const relatedId = updated.opportunity_id ?? updated.customer_id ?? null;
    const { data: task, error: taskErr } = await client
      .from('tasks')
      .insert({
        organization_id: updated.organization_id,
        title: next.title?.trim() || `Seguimiento de llamada (${d.outcome.replace('_', ' ')})`,
        description: d.note ?? null,
        due_date: next.due_at ?? null,
        assigned_to: userId,
        created_by: userId,
        priority: 'med',
        status: 'open',
        related_to_id: relatedId,
        related_to_type: relatedType,
        customer_id: updated.customer_id,
        type: 'call',
      })
      .select('id')
      .single();
    if (taskErr) throw taskErr;
    if (!task) throw new Error('No se pudo crear la tarea de seguimiento');
    taskId = (task as { id: string }).id;
  }

  const activityId = await upsertCallActivity(updated, client);
  return { call: updated, taskId, activityId };
}
