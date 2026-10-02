import { pedirCrm, emitirCambioCrm } from '@/components/crm/acciones/apiCrm';
import type { CalendarEventRow, MeetingPatch } from '@/lib/services/crm/meetingsService';
import type { CalendarEvent } from './types';

/** La marca de gestión prevalece sobre el tipo editable del evento. */
export function esReunionCrm(event: { metadata?: CalendarEvent['metadata'] } | null | undefined): boolean {
  const metadata = event?.metadata;
  return !!metadata && (metadata.source === 'crm' || metadata.source === 'voice_agent' || !!metadata.activity_id);
}

export interface ReunionCalendario { event: CalendarEventRow; can_edit: boolean; outcome: 'scheduled' | 'done' | 'canceled' }

export function leerReunionCalendario(id: string, signal?: AbortSignal): Promise<{ data: ReunionCalendario; extra: Record<string, unknown> }> {
  return pedirCrm<ReunionCalendario>(`/api/crm/meetings/${id}`, { signal });
}

export async function cambiarReunionCalendario(id: string, patch: MeetingPatch): Promise<CalendarEventRow> {
  const { data } = await pedirCrm<CalendarEventRow>(`/api/crm/meetings/${id}`, { method: 'PATCH', cuerpo: patch });
  emitirCambioCrm({ entidad: data.opportunity_id ? 'opportunity' : 'customer', id: data.opportunity_id ?? data.customer_id, accion: 'meeting.updated' });
  return data;
}

/** Solo cambios admitidos; nunca sustituye la metadata ni los participantes. */
export function patchReunionCalendario(updates: Partial<CalendarEvent>): MeetingPatch {
  const patch: MeetingPatch = {};
  for (const key of ['title', 'description', 'location', 'start_at'] as const) {
    if (updates[key] !== undefined) Object.assign(patch, { [key]: updates[key] });
  }
  if (updates.end_at !== undefined) {
    if (!updates.end_at) throw new Error('La reunión requiere fecha de fin');
    patch.end_at = updates.end_at;
  }
  if (updates.status !== undefined) {
    if (updates.status === 'cancelled') patch.status = 'canceled';
    else if (updates.status === 'completed') patch.status = 'done';
    else if (updates.status === 'confirmed') patch.status = 'scheduled';
    else throw new Error('Estado no válido para una reunión CRM');
  }
  if (!Object.keys(patch).length) throw new Error('Se requiere un cambio');
  return patch;
}

/** La vista conserva confirmed en reuniones realizadas: la evidencia es completed_at. */
export function estadoReunionCalendario(event: Pick<CalendarEvent, 'status' | 'metadata'>): CalendarEvent['status'] {
  if (esReunionCrm(event) && event.status !== 'cancelled' && event.metadata?.completed_at) return 'completed';
  return event.status;
}
