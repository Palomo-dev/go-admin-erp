import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TASK_PRIORITIES } from '@/lib/crm/enums';

/** El seguimiento y la tarea rápida comparten validación y RPC. */
export const seguimientoSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(5000).optional().nullable(),
  due_date: z.string().datetime({ offset: true }).optional().nullable(),
  priority: z.enum(TASK_PRIORITIES).optional(),
}).strict();

export const tareaRapidaSchema = seguimientoSchema.extend({
  related_to_type: z.enum(['opportunity', 'customer']),
  related_to_id: z.string().uuid(),
  assigned_to: z.string().uuid().optional().nullable(),
  client_key: z.string().min(1).max(120).optional(),
});

export async function crearTareaRapida(orgId: number, input: z.infer<typeof tareaRapidaSchema>, supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc('fn_crm_crear_tarea', { p_org: orgId, p_payload: input });
  if (error) throw error;
  if (!data || typeof data !== 'object' || !data.id) throw new Error('La tarea no devolvió su registro');
  return data as Record<string, unknown>;
}
