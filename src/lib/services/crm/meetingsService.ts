import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CrmHttpError } from './crmErrors';
import type { CrmSesion } from './crmRouteSupport';

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

/** Lectura completa con RLS; el calendario unificado omite lugar y oportunidad. */
export async function getMeetingForCalendar(ctx: CrmSesion, id: string): Promise<{ event: CalendarEventRow; can_edit: boolean; outcome: 'scheduled' | 'done' | 'canceled' }> {
  const { data, error } = await ctx.supabase.from('calendar_events')
    .select('id,organization_id,title,description,location,start_at,end_at,timezone,assigned_to,customer_id,opportunity_id,event_type,status,metadata,created_by')
    .eq('organization_id', ctx.organizationId).eq('id', id).maybeSingle();
  if (error) throw error;
  const event = data as CalendarEventRow | null;
  if (!event || event.organization_id !== ctx.organizationId || event.event_type !== 'meeting' || !(event.metadata?.source === 'crm' || event.metadata?.source === 'voice_agent' || event.metadata?.activity_id)) {
    throw new CrmHttpError(404, 'no_encontrado', 'Reunión no encontrada');
  }
  if (!event.customer_id && !event.opportunity_id) throw new CrmHttpError(409, 'entidad_incoherente', 'La reunión no tiene una entidad relacionada');
  if (event.opportunity_id) {
    const { data: opportunity, error: opportunityError } = await ctx.supabase.from('opportunities').select('id,organization_id,customer_id')
      .eq('organization_id', ctx.organizationId).eq('id', event.opportunity_id).maybeSingle();
    if (opportunityError) throw opportunityError;
    if (!opportunity || opportunity.organization_id !== ctx.organizationId || opportunity.id !== event.opportunity_id
      || opportunity.customer_id !== event.customer_id) throw new CrmHttpError(409, 'entidad_incoherente', 'La relación comercial de la reunión requiere revisión');
  }
  if (event.customer_id) {
    const { data: customer, error: customerError } = await ctx.supabase.from('customers').select('id,organization_id')
      .eq('organization_id', ctx.organizationId).eq('id', event.customer_id).maybeSingle();
    if (customerError) throw customerError;
    if (!customer || customer.organization_id !== ctx.organizationId || customer.id !== event.customer_id)
      throw new CrmHttpError(409, 'entidad_incoherente', 'El cliente relacionado requiere revisión');
  }
  const { data: activities, error: activityError } = await ctx.supabase.from('activities')
    .select('id,activity_type,related_type,related_id,user_id,occurred_at,outcome,metadata')
    .eq('organization_id', ctx.organizationId).ilike('metadata->>event_id', event.id).limit(2);
  if (activityError) throw activityError;
  const activity = activities?.length === 1 ? activities[0] : null;
  if (!activity || activity.metadata?.event_id !== event.id || activity.activity_type !== 'meeting' || activity.related_type !== (event.opportunity_id ? 'opportunity' : 'customer')
    || activity.related_id !== (event.opportunity_id ?? event.customer_id) || activity.user_id !== event.created_by
    || Date.parse(activity.occurred_at) !== Date.parse(event.start_at)
    || (event.metadata?.activity_id && event.metadata.activity_id !== activity.id)
    || !['scheduled', 'done', 'canceled'].includes(activity.outcome)
    || event.status !== (activity.outcome === 'canceled' ? 'cancelled' : 'confirmed')) {
    throw new CrmHttpError(409, 'historial_incoherente', 'La reunión requiere reparar su historial antes de editarla');
  }
  // Mantener validaciones/ICS como módulos puros; la autorización se carga
  // únicamente en esta lectura de servidor, después de validar el historial.
  const { CRM_PERMISOS, tienePermisoCrm } = await import('./crmRouteSupport');
  const can_edit = event.created_by === ctx.userId || await tienePermisoCrm(ctx, CRM_PERMISOS.actividadesEditarCualquiera);
  return { event, can_edit, outcome: activity.outcome as 'scheduled' | 'done' | 'canceled' };
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
