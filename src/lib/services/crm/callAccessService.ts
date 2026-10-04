import { OrgContextError } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
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

export interface ReferenciasLlamada {
  customer_id?: string | null;
  opportunity_id?: string | null;
}

/** Comprueba también que la sucursal pertenece al tenant antes de resolver acceso. */
async function exigirSucursalReferencia(ctx: CrmSesion, branchId: number | null | undefined): Promise<void> {
  if (branchId == null) return;
  const branch = await ctx.supabase.from('branches').select('id')
    .eq('id', branchId).eq('organization_id', ctx.organizationId).maybeSingle();
  if (branch.error) throw branch.error;
  if (!branch.data) throw new CrmHttpError(403, 'sucursal_sin_permiso', 'Sucursal no permitida');
  const access = await ctx.supabase.rpc('app_branch_access', { p_branch_id: branchId });
  if (access.error) throw access.error;
  if (access.data !== true) throw new CrmHttpError(403, 'sucursal_sin_permiso', 'Sucursal no permitida');
}

/**
 * Las escrituras con servicio necesitan comprobar ambas fichas con la sesión.
 * Solo una creación puede completar el cliente a partir de su oportunidad;
 * una llamada existente debe conservar referencias ya coherentes.
 */
export async function exigirAlcanceReferenciasLlamada(
  ctx: CrmSesion,
  references: ReferenciasLlamada,
  options: { completarClienteDesdeOportunidad?: boolean } = {},
): Promise<{ customer_id: string | null; opportunity_id: string | null }> {
  let customerId = references.customer_id ?? null;
  const opportunityId = references.opportunity_id ?? null;
  if (customerId) exigirUuid(customerId, 'Cliente');
  if (opportunityId) {
    exigirUuid(opportunityId, 'Oportunidad');
    const opportunity = await ctx.supabase.from('opportunities').select('id, customer_id, branch_id')
      .eq('id', opportunityId).eq('organization_id', ctx.organizationId).maybeSingle();
    if (opportunity.error) throw opportunity.error;
    if (!opportunity.data) throw new CrmHttpError(404, 'oportunidad_no_encontrada', 'Oportunidad no encontrada');
    await exigirSucursalReferencia(ctx, opportunity.data.branch_id);
    const canonicalCustomer = opportunity.data.customer_id ?? null;
    if (customerId !== canonicalCustomer && !(options.completarClienteDesdeOportunidad && customerId === null)) {
      throw new CrmHttpError(400, 'entidad_de_llamada_incoherente', 'El cliente no corresponde a la oportunidad');
    }
    customerId = canonicalCustomer;
  }
  if (customerId) {
    exigirUuid(customerId, 'Cliente');
    const customer = await ctx.supabase.from('customers').select('id, branch_id')
      .eq('id', customerId).eq('organization_id', ctx.organizationId).maybeSingle();
    if (customer.error) throw customer.error;
    if (!customer.data) throw new CrmHttpError(404, 'cliente_no_encontrado', 'Cliente no encontrado');
    await exigirSucursalReferencia(ctx, customer.data.branch_id);
  }
  return { customer_id: customerId, opportunity_id: opportunityId };
}

/**
 * `edit_any` autoriza gestionar una llamada concreta aunque no permita listarla.
 * Esa lectura interna usa servicio sólo después de comprobar el permiso y
 * siempre valida las fichas con la sesión antes de devolver el snapshot.
 */
export async function cargarLlamadaParaGestion<T extends LlamadaConAutor & ReferenciasLlamada>(
  ctx: CrmSesion,
  id: string,
): Promise<{ call: T; canEditAny: boolean; serviceClient?: ReturnType<typeof getServiceClient> }> {
  exigirUuid(id, 'Llamada');
  const canEditAny = await tienePermisoCrm(ctx, CRM_PERMISOS.actividadesEditarCualquiera);
  const serviceClient = canEditAny ? getServiceClient() : undefined;
  const readClient = serviceClient ?? ctx.supabase;
  const result = await readClient.from('calls').select('*')
    .eq('id', id).eq('organization_id', ctx.organizationId).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new CrmHttpError(404, 'llamada_no_encontrada', 'Llamada no encontrada');
  const call = result.data as T;
  if (call.user_id !== ctx.userId && !canEditAny) {
    throw new OrgContextError('No tienes permiso para esta acción', 403, 'CRM_FORBIDDEN');
  }
  await exigirAlcanceReferenciasLlamada(ctx, call);
  return { call, canEditAny, serviceClient };
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
