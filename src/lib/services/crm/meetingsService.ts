import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createActivity, RelatedNotFoundError } from '@/lib/services/crm/activityService';

/**
 * meetingsService — reuniones desde la ficha 360 (FASE-09 §4.2).
 *
 * createMeeting: INSERT calendar_events (status CHECK real: confirmed|tentative|cancelled)
 *   + activity 'meeting' (related_type/id, occurred_at = start_at, metadata.event_id).
 * updateMeeting: PATCH de campos + status API 'scheduled'|'done'|'canceled'
 *   → calendar_events.status confirmed|confirmed(+metadata.completed_at)|cancelled
 *   y activities.outcome done|canceled.
 *
 * Invitación ICS por email (send_invite): pendiente de F7 (`sendEmail` con
 * attachments). `buildIcs` queda listo; el envío se anota en el informe.
 */

export const meetingInputSchema = z.object({
  title: z.string().min(1).max(200),
  start_at: z.string().datetime({ offset: true }),
  end_at: z.string().datetime({ offset: true }),
  timezone: z.string().max(60).optional(),
  location: z.string().max(500).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  customer_id: z.string().uuid().optional().nullable(),
  opportunity_id: z.string().uuid().optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
  attendees: z.array(z.string().email()).max(20).optional(),
  send_invite: z.boolean().optional(),
  client_key: z.string().max(120).optional(),
});
export type MeetingInput = z.infer<typeof meetingInputSchema>;

export const meetingPatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  start_at: z.string().datetime({ offset: true }).optional(),
  end_at: z.string().datetime({ offset: true }).optional(),
  location: z.string().max(500).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  status: z.enum(['scheduled', 'done', 'canceled']).optional(),
});
export type MeetingPatch = z.infer<typeof meetingPatchSchema>;

export interface CalendarEventRow {
  id: string;
  organization_id: number;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  timezone: string | null;
  assigned_to: string | null;
  customer_id: string | null;
  event_type: string | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
}

export class MeetingNotFoundError extends Error {
  constructor() {
    super('Reunión no encontrada');
    this.name = 'MeetingNotFoundError';
  }
}

export async function createMeeting(
  orgId: number,
  userId: string,
  input: MeetingInput,
  supabase: SupabaseClient
): Promise<{ event: CalendarEventRow; activityId: string }> {
  if (Date.parse(input.end_at) <= Date.parse(input.start_at)) {
    throw new Error('end_at debe ser posterior a start_at');
  }
  if (!input.opportunity_id && !input.customer_id) {
    throw new Error('Se requiere opportunity_id o customer_id');
  }
  // F9-14: `assigned_to` debe ser miembro de la organización
  let assignedTo = userId;
  if (input.assigned_to && input.assigned_to !== userId) {
    const { data: member } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', orgId)
      .eq('user_id', input.assigned_to)
      .eq('is_active', true)
      .maybeSingle();
    if (!member) throw new RelatedNotFoundError();
    assignedTo = input.assigned_to;
  }
  const relatedType = input.opportunity_id ? 'opportunity' : 'customer';
  const relatedId = (input.opportunity_id ?? input.customer_id) as string;

  // Validar pertenencia y resolver customer_id de la oportunidad
  let customerId = input.customer_id ?? null;
  if (input.opportunity_id) {
    const { data: opp } = await supabase
      .from('opportunities')
      .select('id, customer_id')
      .eq('id', input.opportunity_id)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!opp) throw new RelatedNotFoundError();
    customerId = customerId ?? (opp as { customer_id: string | null }).customer_id ?? null;
  } else if (customerId) {
    const { data: cust } = await supabase.from('customers').select('id').eq('id', customerId).eq('organization_id', orgId).maybeSingle();
    if (!cust) throw new RelatedNotFoundError();
  }

  const { data: event, error } = await supabase
    .from('calendar_events')
    .insert({
      organization_id: orgId,
      title: input.title,
      description: input.description ?? null,
      location: input.location ?? null,
      start_at: input.start_at,
      end_at: input.end_at,
      all_day: false,
      timezone: input.timezone ?? 'America/Bogota',
      assigned_to: assignedTo,
      customer_id: customerId,
      event_type: 'meeting',
      status: 'confirmed',
      created_by: userId,
      metadata: {
        source: 'crm',
        opportunity_id: input.opportunity_id ?? null,
        attendees: input.attendees ?? [],
        send_invite: Boolean(input.send_invite),
        client_key: input.client_key ?? null,
      },
    })
    .select('*')
    .single();
  if (error || !event) throw new Error(`No se pudo crear la reunión: ${error?.message ?? 'sin datos'}`);
  const ev = event as CalendarEventRow;

  // F9-15: sin transacción en PostgREST; si la activity falla se compensa
  // borrando el `calendar_events` para no dejar un evento huérfano.
  let activity;
  try {
    activity = await createActivity(
    orgId,
    userId,
    {
      activity_type: 'meeting',
      related_type: relatedType,
      related_id: relatedId,
      notes: [input.title, input.location ? `Lugar: ${input.location}` : null, input.description ?? null].filter(Boolean).join('\n'),
      channel: 'meeting',
      outcome: 'scheduled',
      occurred_at: input.start_at,
      metadata: { event_id: ev.id, end_at: input.end_at, location: input.location ?? null, client_key: input.client_key ? `meeting:${input.client_key}` : undefined },
    },
    supabase
    );
  } catch (err) {
    // Compensación de F9-15: si el borrado del evento huérfano falla hay que
    // decirlo, no tragarlo — queda una reunión sin actividad en el calendario.
    const { error: delError } = await supabase.from('calendar_events').delete().eq('id', ev.id).eq('organization_id', orgId);
    if (delError) {
      console.error(
        `[meetingsService] la actividad de la reunión ${ev.id} falló y la compensación tampoco pudo borrar el evento: ${delError.message}. ` +
        'Queda un calendar_event huérfano.'
      );
    }
    throw err;
  }

  // Pasada de gemelos (ronda 3): este UPDATE ignoraba su resultado. Si falla, el
  // evento se queda sin `metadata.activity_id` y `updateMeeting` deja de
  // sincronizar la actividad, en silencio.
  const { error: linkError } = await supabase
    .from('calendar_events')
    .update({ metadata: { ...(ev.metadata ?? {}), activity_id: activity.id } })
    .eq('id', ev.id)
    .eq('organization_id', orgId);
  if (linkError) {
    console.error(`[meetingsService] no se pudo enlazar la actividad ${activity.id} con el evento ${ev.id}: ${linkError.message}`);
  }

  return { event: { ...ev, metadata: { ...(ev.metadata ?? {}), activity_id: activity.id } }, activityId: activity.id };
}

export async function updateMeeting(
  orgId: number,
  id: string,
  patch: MeetingPatch,
  supabase: SupabaseClient
): Promise<CalendarEventRow> {
  const { data: existing } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!existing) throw new MeetingNotFoundError();
  const ev = existing as CalendarEventRow;

  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.start_at !== undefined) update.start_at = patch.start_at;
  if (patch.end_at !== undefined) update.end_at = patch.end_at;
  if (patch.location !== undefined) update.location = patch.location;
  if (patch.description !== undefined) update.description = patch.description;
  const md = { ...(ev.metadata ?? {}) } as Record<string, unknown>;
  if (patch.status === 'canceled') {
    update.status = 'cancelled';
    md.completed_at = null;
  } else if (patch.status === 'done') {
    update.status = 'confirmed';
    md.completed_at = new Date().toISOString();
  } else if (patch.status === 'scheduled') {
    update.status = 'confirmed';
    md.completed_at = null;
  }
  update.metadata = md;

  const { data: updated, error } = await supabase
    .from('calendar_events')
    .update(update)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('*')
    .single();
  if (error || !updated) throw new Error(`No se pudo actualizar la reunión: ${error?.message ?? 'sin datos'}`);

  const activityId = md.activity_id as string | undefined;
  if (activityId) {
    const actUpdate: Record<string, unknown> = {};
    if (patch.status === 'done') actUpdate.outcome = 'done';
    if (patch.status === 'canceled') actUpdate.outcome = 'canceled';
    if (patch.status === 'scheduled') actUpdate.outcome = 'scheduled';
    if (patch.start_at) actUpdate.occurred_at = patch.start_at;
    if (patch.title) actUpdate.notes = patch.title;
    if (Object.keys(actUpdate).length) {
      // Mismo criterio: el resultado no se ignora. Si falla, la reunión queda
      // actualizada y su entrada del timeline no, y hay que poder verlo.
      const { error: actError } = await supabase.from('activities').update(actUpdate).eq('id', activityId).eq('organization_id', orgId);
      if (actError) {
        console.error(`[meetingsService] la reunión ${id} se actualizó pero su actividad ${activityId} no: ${actError.message}`);
      }
    }
  }
  return updated as CalendarEventRow;
}

export { buildIcs, foldIcsLine } from './meetingsIcs';
