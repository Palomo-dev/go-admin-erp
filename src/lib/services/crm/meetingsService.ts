import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CrmHttpError } from './crmErrors';

/**
 * Una RPC guarda calendario e historial con la sesión del actor.
 * La ruta envía la invitación después de guardar, salvo send_invite=false.
 */
const instantSchema = z.string().datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value)));

export const meetingInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  start_at: instantSchema,
  end_at: instantSchema,
  timezone: z.string().max(60).optional(),
  location: z.string().max(500).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  customer_id: z.string().uuid().optional().nullable(),
  opportunity_id: z.string().uuid().optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
  attendees: z.array(z.string().email()).max(20).optional(),
  send_invite: z.boolean().optional(),
  client_key: z.string().min(1).max(120).optional(),
}).strict();
export type MeetingInput = z.infer<typeof meetingInputSchema>;

export const meetingPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  start_at: instantSchema.optional(),
  end_at: instantSchema.optional(),
  location: z.string().max(500).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  status: z.enum(['scheduled', 'done', 'canceled']).optional(),
}).strict().refine(value => Object.keys(value).length > 0, { message: 'Se requiere un cambio' });
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
  opportunity_id: string | null;
  event_type: string | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
}

interface MeetingRpcResult {
  event: CalendarEventRow;
  activity_id: string;
  reused: boolean;
}

async function guardarReunion(
  orgId: number,
  id: string | null,
  payload: MeetingInput | MeetingPatch,
  supabase: SupabaseClient,
): Promise<MeetingRpcResult> {
  const { data, error } = await supabase.rpc('fn_crm_guardar_reunion', {
    p_org: orgId, p_event_id: id, p_payload: payload,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object' || !data.event || !data.activity_id) {
    throw new Error('La reunión no devolvió su historial');
  }
  return data as MeetingRpcResult;
}

export async function createMeeting(
  orgId: number,
  _userId: string,
  input: MeetingInput,
  supabase: SupabaseClient,
): Promise<{ event: CalendarEventRow; activityId: string }> {
  // La RPC obtiene autor de auth.uid(); el argumento de sesión se conserva
  // por compatibilidad y nunca se transmite como identidad de confianza.
  if (Date.parse(input.end_at) <= Date.parse(input.start_at)) {
    throw new CrmHttpError(400, 'rango_invalido', 'end_at debe ser posterior a start_at');
  }
  if (!input.opportunity_id && !input.customer_id) {
    throw new CrmHttpError(400, 'entidad_requerida', 'Se requiere opportunity_id o customer_id');
  }
  const result = await guardarReunion(orgId, null, input, supabase);
  return { event: result.event, activityId: result.activity_id };
}

export async function updateMeeting(
  orgId: number,
  id: string,
  patch: MeetingPatch,
  supabase: SupabaseClient,
): Promise<CalendarEventRow> {
  return (await guardarReunion(orgId, id, patch, supabase)).event;
}

export { buildIcs, foldIcsLine } from './meetingsIcs';
