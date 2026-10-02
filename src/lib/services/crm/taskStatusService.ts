import { z } from 'zod';
import { TASK_STATUSES } from '@/lib/crm/enums';
import { assertRelatedBelongsToOrg, RelatedNotFoundError } from './activityService';
import { CRM_PERMISOS, CrmHttpError, tienePermisoCrm, type CrmSesion } from './crmRouteSupport';

export const tareaEstadoSchema = z.object({ status: z.enum(TASK_STATUSES) }).strict();

/** Estado puntual del historial CRM; la fecha de cierre la pone el servidor. */
export async function cambiarEstadoTareaCrm(ctx: CrmSesion, id: string, status: z.infer<typeof tareaEstadoSchema>['status']) {
  const { data: actual, error: lectura } = await ctx.supabase.from('tasks')
    .select('id, created_by, assigned_to, status, completed_at, updated_at, related_to_type, related_to_id, customer_id')
    .eq('id', id).eq('organization_id', ctx.organizationId).maybeSingle();
  if (lectura) throw lectura;
  if (!actual) throw new CrmHttpError(404, 'tarea_no_encontrada', 'Tarea no encontrada');
  if (actual.created_by !== ctx.userId && actual.assigned_to !== ctx.userId
    && !(await tienePermisoCrm(ctx, CRM_PERMISOS.actividadesEditarCualquiera))) {
    throw new CrmHttpError(403, 'no_es_propia', 'Solo puedes modificar tus tareas');
  }
  const tipo = actual.related_to_type === 'cliente' ? 'customer' : actual.related_to_type;
  const relacionCrm = tipo === 'customer' || tipo === 'opportunity';
  if (relacionCrm ? !actual.related_to_id : !actual.customer_id) throw new CrmHttpError(409, 'tarea_fuera_crm', 'Esta tarea se modifica desde su módulo');
  try {
    if (relacionCrm) await assertRelatedBelongsToOrg(ctx.organizationId, tipo, actual.related_to_id, ctx.supabase);
    // El historial también muestra tareas enlazadas por customer_id, aunque
    // su referencia primaria pertenezca a otro módulo o sea nula.
    if (actual.customer_id && (tipo !== 'customer' || actual.customer_id !== actual.related_to_id)) {
      await assertRelatedBelongsToOrg(ctx.organizationId, 'customer', actual.customer_id, ctx.supabase);
    }
  } catch (error) {
    if (error instanceof RelatedNotFoundError) throw new CrmHttpError(404, 'entidad_no_encontrada', error.message);
    throw error;
  }
  if (actual.status === status) return { id: actual.id, status: actual.status, completed_at: actual.completed_at };
  const ahora = new Date().toISOString();
  let query = ctx.supabase.from('tasks').update({ status, completed_at: status === 'done' ? ahora : null, updated_at: ahora })
    .eq('id', id).eq('organization_id', ctx.organizationId).eq('status', actual.status);
  query = actual.related_to_type == null ? query.is('related_to_type', null) : query.eq('related_to_type', actual.related_to_type);
  query = actual.related_to_id == null ? query.is('related_to_id', null) : query.eq('related_to_id', actual.related_to_id);
  query = actual.customer_id == null ? query.is('customer_id', null) : query.eq('customer_id', actual.customer_id);
  query = actual.created_by == null ? query.is('created_by', null) : query.eq('created_by', actual.created_by);
  query = actual.assigned_to == null ? query.is('assigned_to', null) : query.eq('assigned_to', actual.assigned_to);
  query = actual.updated_at == null ? query.is('updated_at', null) : query.eq('updated_at', actual.updated_at);
  const { data, error } = await query.select('id, status, completed_at').maybeSingle();
  if (error) throw error;
  if (!data) throw new CrmHttpError(409, 'conflicto', 'La tarea cambió; vuelve a cargarla antes de guardar');
  return data;
}
