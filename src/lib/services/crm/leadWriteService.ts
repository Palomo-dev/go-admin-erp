/**
 * CRM ola 1 — acciones sobre leads-cliente (D2): calificar, descartar y asignar
 * responsable en lote (plan §4.1 y paso 1.5).
 *
 * - Calificar crea la OPORTUNIDAD con `crm_create_opportunity` y `origen='lead'`
 *   (la misma RPC que el formulario: regla dura 7). La RPC exige
 *   `crm.opportunities.create`, reactiva el lead si estaba descartado, enlaza el
 *   referido convertido y los triggers suben el cliente a 'opportunity'. Lo que
 *   el cuerpo no trae se prellena con `metadata.lead` y el responsable del
 *   cliente.
 * - Descartar no toca `lifecycle_stage` (su CHECK no tiene «descartado»):
 *   escribe `lead_discarded_at/_reason/_by`.
 * - Asignar escribe `customers.owner_id` (miembro activo de la organización).
 */

import { CRM_PERMISOS, CrmHttpError, tienePermisoCrm, type CrmSesion } from './crmRouteSupport';
import { crearOportunidad, type OportunidadAlta } from './opportunityWriteService';

interface LeadFicha {
  id: string;
  full_name: string | null;
  lifecycle_stage: string | null;
  owner_id: string | null;
  lead_discarded_at: string | null;
  metadata: Record<string, unknown> | null;
}

async function leerLead(ctx: CrmSesion, customerId: string): Promise<LeadFicha> {
  const { data, error } = await ctx.supabase
    .from('customers')
    .select('id, full_name, lifecycle_stage, owner_id, lead_discarded_at, metadata')
    .eq('id', customerId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new CrmHttpError(404, 'lead_no_encontrado', 'Lead no encontrado');
  return data as LeadFicha;
}

/** Prellenado de «Calificar» desde `metadata.lead` (solo lo que el cuerpo no trae). */
export function prellenadoDesdeLead(ficha: LeadFicha, cuerpo: OportunidadAlta): OportunidadAlta {
  const lead = (ficha.metadata?.lead && typeof ficha.metadata.lead === 'object' ? ficha.metadata.lead : {}) as Record<string, unknown>;
  const valor = (lead.valor_estimado && typeof lead.valor_estimado === 'object' ? lead.valor_estimado : {}) as Record<string, unknown>;
  const out: OportunidadAlta = { ...cuerpo };
  if (out.amount === undefined && typeof valor.monto === 'number') out.amount = valor.monto;
  if (out.currency === undefined && typeof valor.moneda === 'string') out.currency = valor.moneda;
  if (out.deal_type === undefined && typeof lead.deal_type === 'string') out.deal_type = lead.deal_type as OportunidadAlta['deal_type'];
  if (out.temperature === undefined && typeof lead.temperatura === 'string') out.temperature = lead.temperatura as OportunidadAlta['temperature'];
  if (out.salesperson_id === undefined && ficha.owner_id) out.salesperson_id = ficha.owner_id;
  return out;
}

/** «Calificar»: crea la oportunidad del lead (record_type 'deal', origen 'lead'). */
export async function calificarLead(ctx: CrmSesion, customerId: string, cuerpo: OportunidadAlta): Promise<Record<string, unknown>> {
  const ficha = await leerLead(ctx, customerId);
  const datos = prellenadoDesdeLead(ficha, { ...cuerpo, customer_id: customerId, origen: 'lead' });
  return crearOportunidad(ctx, datos);
}

/**
 * Puede tocar el lead: `crm.leads.assign` (cualquiera) o `crm.leads.edit` si es
 * suyo o no tiene responsable.
 */
async function exigirEdicionLead(ctx: CrmSesion, ficha: LeadFicha, etiqueta: string): Promise<void> {
  if (await tienePermisoCrm(ctx, CRM_PERMISOS.leadsAsignar)) return;
  if ((await tienePermisoCrm(ctx, CRM_PERMISOS.leadsEditar)) && (ficha.owner_id === null || ficha.owner_id === ctx.userId)) return;
  console.warn('[crm] %s sin permiso sobre el lead (org %s, rol %s)', etiqueta, ctx.organizationId, ctx.roleId);
  throw new CrmHttpError(403, 'CRM_FORBIDDEN', 'No tienes permiso para modificar este lead');
}

export async function descartarLead(ctx: CrmSesion, customerId: string, motivo: string | null, descartar: boolean, etiqueta: string): Promise<Record<string, unknown>> {
  const ficha = await leerLead(ctx, customerId);
  await exigirEdicionLead(ctx, ficha, etiqueta);
  if (descartar && ficha.lifecycle_stage !== 'lead') {
    throw new CrmHttpError(409, 'no_es_lead', 'Solo se descarta un cliente en etapa lead');
  }
  const cambios = descartar
    ? { lead_discarded_at: new Date().toISOString(), lead_discard_reason: motivo, lead_discarded_by: ctx.userId }
    : { lead_discarded_at: null, lead_discard_reason: null, lead_discarded_by: null };
  const { data, error } = await ctx.supabase
    .from('customers')
    .update(cambios)
    .eq('id', customerId)
    .eq('organization_id', ctx.organizationId)
    .select('id, lifecycle_stage, owner_id, lead_discarded_at, lead_discard_reason, lead_discarded_by')
    .single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

/** Asigna (o quita, con `null`) el responsable de varios clientes de la organización. */
export async function asignarResponsable(ctx: CrmSesion, customerIds: readonly string[], ownerId: string | null): Promise<{ actualizados: number; ids: string[] }> {
  if (ownerId) {
    const { data: miembro, error } = await ctx.supabase
      .from('organization_members')
      .select('user_id')
      .eq('user_id', ownerId)
      .eq('organization_id', ctx.organizationId)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw error;
    if (!miembro) throw new CrmHttpError(400, 'responsable_no_miembro', 'El responsable no es miembro activo de la organización');
  }
  const { data, error } = await ctx.supabase
    .from('customers')
    .update({ owner_id: ownerId })
    .eq('organization_id', ctx.organizationId)
    .in('id', customerIds as string[])
    .select('id');
  if (error) throw error;
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  return { actualizados: ids.length, ids };
}
