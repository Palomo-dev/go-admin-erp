import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Servicio CRM - Gestión de demos/sesiones de demostración (Fase 10).
 *
 * Tabla: demo_sessions
 *   id, organization_id, opportunity_id, template_id, scheduled_at,
 *   duration_minutes, attendees (jsonb), video_provider, video_url,
 *   recording_url, status (scheduled|completed|canceled|no_show),
 *   checklist (jsonb), notes
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type DemoStatus = 'scheduled' | 'completed' | 'canceled' | 'no_show';

export interface DemoSession {
  id: string;
  organization_id: number;
  opportunity_id: string;
  template_id: string | null;
  scheduled_at: string;
  duration_minutes: number;
  attendees: Attendee[];
  video_provider: string | null;
  video_url: string | null;
  recording_url: string | null;
  status: DemoStatus;
  checklist: ChecklistItem[];
  notes: string | null;
  created_at: string;
}

export interface Attendee {
  name: string;
  email?: string;
  role?: string;
}

export interface ChecklistItem {
  label: string;
  done: boolean;
}

export interface CreateDemoInput {
  opportunity_id: string;
  template_id?: string | null;
  scheduled_at: string;
  duration_minutes: number;
  attendees: Attendee[];
  video_provider?: string | null;
  video_url?: string | null;
  recording_url?: string | null;
  checklist?: ChecklistItem[];
  notes?: string | null;
}

export interface UpdateDemoInput {
  scheduled_at?: string;
  duration_minutes?: number;
  attendees?: Attendee[];
  video_provider?: string | null;
  video_url?: string | null;
  recording_url?: string | null;
  status?: DemoStatus;
  checklist?: ChecklistItem[];
  notes?: string | null;
}

export interface DemoFilters {
  opportunity_id?: string;
  status?: DemoStatus;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

// ─── Funciones del servicio ──────────────────────────────────────────────────

/**
 * Lista demos de una organización con filtros opcionales.
 */
export async function getDemos(
  orgId: number,
  supabase: SupabaseClient,
  filters?: DemoFilters
): Promise<DemoSession[]> {
  let query = supabase
    .from('demo_sessions')
    .select('*')
    .eq('organization_id', orgId)
    .order('scheduled_at', { ascending: false });

  if (filters?.opportunity_id) {
    query = query.eq('opportunity_id', filters.opportunity_id);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.date_from) {
    query = query.gte('scheduled_at', filters.date_from);
  }
  if (filters?.date_to) {
    query = query.lte('scheduled_at', filters.date_to);
  }
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.warn('demoService.getDemos - error:', error.message);
    return [];
  }

  return (data || []) as DemoSession[];
}

/**
 * Crea una nueva sesión de demo.
 */
export async function createDemo(
  orgId: number,
  data: CreateDemoInput,
  supabase: SupabaseClient
): Promise<DemoSession | null> {
  const { data: result, error } = await supabase
    .from('demo_sessions')
    .insert({
      organization_id: orgId,
      opportunity_id: data.opportunity_id,
      template_id: data.template_id ?? null,
      scheduled_at: data.scheduled_at,
      duration_minutes: data.duration_minutes,
      attendees: data.attendees,
      video_provider: data.video_provider ?? null,
      video_url: data.video_url ?? null,
      recording_url: data.recording_url ?? null,
      status: 'scheduled',
      checklist: data.checklist ?? [],
      notes: data.notes ?? null,
    })
    .select('*')
    .single();

  if (error) {
    console.error('demoService.createDemo - error:', error.message);
    throw new Error(`Error creando demo: ${error.message}`);
  }

  return result as DemoSession;
}

/**
 * Actualiza una sesión de demo.
 */
export async function updateDemo(
  id: string,
  orgId: number,
  data: UpdateDemoInput,
  supabase: SupabaseClient
): Promise<DemoSession | null> {
  const updateData: Record<string, unknown> = {};

  if (data.scheduled_at !== undefined) updateData.scheduled_at = data.scheduled_at;
  if (data.duration_minutes !== undefined) updateData.duration_minutes = data.duration_minutes;
  if (data.attendees !== undefined) updateData.attendees = data.attendees;
  if (data.video_provider !== undefined) updateData.video_provider = data.video_provider;
  if (data.video_url !== undefined) updateData.video_url = data.video_url;
  if (data.recording_url !== undefined) updateData.recording_url = data.recording_url;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.checklist !== undefined) updateData.checklist = data.checklist;
  if (data.notes !== undefined) updateData.notes = data.notes;

  const { data: result, error } = await supabase
    .from('demo_sessions')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('demoService.updateDemo - error:', error.message);
    throw new Error(`Error actualizando demo: ${error.message}`);
  }

  return (result as DemoSession) || null;
}

/**
 * Obtiene una sesión de demo por ID.
 */
export async function getDemo(
  id: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<DemoSession | null> {
  const { data, error } = await supabase
    .from('demo_sessions')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error) {
    console.warn('demoService.getDemo - error:', error.message);
    return null;
  }

  return (data as DemoSession) || null;
}
