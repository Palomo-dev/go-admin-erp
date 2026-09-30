/**
 * CRM ola 1 — editar y borrar actividades y notas (plan §4.9 y paso 1.7).
 *
 * Regla (D5): cada quien edita o borra LO SUYO (`user_id` = usuario de la
 * sesión); lo de otros exige `crm.activities.edit_any` (Admin y Manager). Las
 * actividades `system` son rastro de auditoría (etapa, alta, vínculo): no se
 * editan ni se borran. Todo se filtra por la organización de la sesión.
 *
 * La RLS de `activities` y `notes` sigue siendo de pertenencia (M8 no se
 * aplicó: hay escritores legítimos de actividades ajenas —fusión de
 * identidades, sincronización de llamadas y de correo— que una política de
 * autor rompería). La barrera de autoría es esta, en el servidor.
 */

import { z } from 'zod';
import { CRM_PERMISOS, CrmHttpError, tienePermisoCrm, type CrmSesion } from './crmRouteSupport';

export const actividadEdicionSchema = z
  .object({
    notes: z.string().max(20000).nullable().optional(),
    outcome: z.string().max(60).nullable().optional(),
    channel: z.string().max(40).nullable().optional(),
    duration_seconds: z.number().int().min(0).max(86400).nullable().optional(),
    occurred_at: z
      .string()
      .datetime({ offset: true })
      .refine((v) => Date.parse(v) <= Date.now() + 5 * 60_000, { message: 'occurred_at no puede estar en el futuro' })
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nada que actualizar');

export const notaEdicionSchema = z
  .object({ body: z.string().min(1).max(50000).optional(), is_pinned: z.boolean().optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nada que actualizar');

export type TablaAutoria = 'activities' | 'notes';

interface FilaAutoria {
  id: string;
  user_id: string | null;
  activity_type?: string | null;
}

/**
 * Lee la fila de la organización y comprueba que se pueda modificar. 404 si no
 * existe en la organización; 409 si es de sistema; 403 si es de otro autor y
 * falta `edit_any`.
 */
export async function exigirAutoria(ctx: CrmSesion, tabla: TablaAutoria, id: string, etiqueta: string): Promise<FilaAutoria> {
  const columnas = tabla === 'activities' ? 'id, user_id, activity_type' : 'id, user_id';
  const { data, error } = await ctx.supabase.from(tabla).select(columnas).eq('id', id).eq('organization_id', ctx.organizationId).maybeSingle();
  if (error) throw error;
  if (!data) throw new CrmHttpError(404, 'no_encontrada', tabla === 'activities' ? 'Actividad no encontrada' : 'Nota no encontrada');
  const fila = data as unknown as FilaAutoria;
  if (tabla === 'activities' && fila.activity_type === 'system') {
    throw new CrmHttpError(409, 'actividad_de_sistema', 'Las actividades del sistema no se editan ni se borran');
  }
  if (fila.user_id !== ctx.userId && !(await tienePermisoCrm(ctx, CRM_PERMISOS.actividadesEditarCualquiera))) {
    console.warn('[crm] %s sobre registro ajeno sin crm.activities.edit_any (org %s)', etiqueta, ctx.organizationId);
    throw new CrmHttpError(403, 'no_es_propia', 'Solo puedes modificar lo que registraste tú');
  }
  return fila;
}

export async function actualizarConAutoria(ctx: CrmSesion, tabla: TablaAutoria, id: string, cambios: Record<string, unknown>, etiqueta: string): Promise<Record<string, unknown>> {
  await exigirAutoria(ctx, tabla, id, etiqueta);
  const { data, error } = await ctx.supabase
    .from(tabla)
    .update({ ...cambios, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new CrmHttpError(404, 'no_encontrada', 'No encontrada');
  return data as Record<string, unknown>;
}

export async function borrarConAutoria(ctx: CrmSesion, tabla: TablaAutoria, id: string, etiqueta: string): Promise<{ id: string }> {
  await exigirAutoria(ctx, tabla, id, etiqueta);
  const { error } = await ctx.supabase.from(tabla).delete().eq('id', id).eq('organization_id', ctx.organizationId);
  if (error) throw error;
  return { id };
}
