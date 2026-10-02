import { OrgContextError } from '@/lib/utils/orgContext';
import {
  CRM_PERMISOS,
  CrmHttpError,
  exigirUuid,
  tienePermisoCrm,
  type CrmSesion,
} from './crmRouteSupport';

export interface LlamadaConAutor {
  id: string;
  user_id: string | null;
}

/** `view_all` permite leer; editar otras llamadas exige `activities.edit_any`. */
export async function puedeGestionarLlamada(ctx: CrmSesion, call: LlamadaConAutor): Promise<boolean> {
  return call.user_id === ctx.userId || tienePermisoCrm(ctx, CRM_PERMISOS.actividadesEditarCualquiera);
}

/** Revalida autoría cuando una ruta vuelve a cargar la llamada antes de mutar. */
export async function exigirAccesoALlamadaCargada(
  ctx: CrmSesion,
  call: LlamadaConAutor,
  acceso: 'lectura' | 'gestion',
): Promise<void> {
  const permitido = acceso === 'gestion'
    ? await puedeGestionarLlamada(ctx, call)
    : call.user_id === ctx.userId || await tienePermisoCrm(ctx, CRM_PERMISOS.llamadasVerTodas);
  if (!permitido) {
    console.warn('[crm] acceso a llamada denegado (org %s, acceso %s)', ctx.organizationId, acceso);
    throw new OrgContextError('No tienes permiso para esta acción', 403, 'CRM_FORBIDDEN');
  }
}

/** Acceso común a las rutas auxiliares, con organización y permisos de la sesión. */
export async function exigirAccesoLlamada(
  ctx: CrmSesion,
  id: string,
  acceso: 'lectura' | 'gestion',
): Promise<LlamadaConAutor> {
  exigirUuid(id, 'Llamada');
  const { data, error } = await ctx.supabase
    .from('calls')
    .select('id, user_id')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new CrmHttpError(404, 'llamada_no_encontrada', 'Llamada no encontrada');
  const call = data as LlamadaConAutor;
  await exigirAccesoALlamadaCargada(ctx, call, acceso);
  return call;
}
