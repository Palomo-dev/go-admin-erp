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
 * - Calificar en lote repite «Calificar» lead por lead (`calificarLeadsEnLote`).
 */

import { CRM_PERMISOS, CrmHttpError, clasificarErrorCrm, mensajeCrudo, tienePermisoCrm, type CrmSesion } from './crmRouteSupport';
import { MAX_LOTE_CALIFICAR, nombreDesdePatron } from './calificarLoteLogica';
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
  return calificarFicha(ctx, await leerLead(ctx, customerId), cuerpo);
}

/** Núcleo de «Calificar» sobre una ficha ya leída de la organización de la sesión. */
function calificarFicha(ctx: CrmSesion, ficha: LeadFicha, cuerpo: OportunidadAlta): Promise<Record<string, unknown>> {
  const datos = prellenadoDesdeLead(ficha, { ...cuerpo, customer_id: ficha.id, origen: 'lead' });
  return crearOportunidad(ctx, datos);
}

export interface ResultadoCalificarLote {
  creadas: Array<{ customer_id: string; opportunity_id: string | null; nombre: string }>;
  /** `nombre` es el del lead (null si no es de la organización: no se revela). */
  fallidas: Array<{ customer_id: string; nombre: string | null; codigo: string; mensaje: string }>;
}

/**
 * Fallos que se repetirían idénticos en todos los leads (permiso, embudo,
 * etapa o responsable de la plantilla): al primero se deja de llamar a la base
 * y el resto del lote se informa con el mismo código.
 */
const FALLOS_DE_LOTE = new Set(['sin_embudo_ventas', 'pipeline_sin_etapas', 'pipeline_no_encontrado', 'etapa_no_encontrada', 'etapa_terminal', 'responsable_no_miembro']);

function falloDeLead(error: unknown): { codigo: string; mensaje: string; deLote: boolean } {
  const c = clasificarErrorCrm(error);
  if (!c) {
    console.error('[crm] calificar en lote: error inesperado:', mensajeCrudo(error));
    return { codigo: 'error_interno', mensaje: 'Error interno', deLote: false };
  }
  if (c.code === 'lead_no_encontrado' || c.code === 'cliente_no_encontrado') return { codigo: 'no_encontrado', mensaje: 'Lead no encontrado', deLote: false };
  if (c.status === 403) return { codigo: 'sin_permiso', mensaje: 'No tienes permiso para esta acción', deLote: true };
  return { codigo: c.code, mensaje: c.error, deLote: FALLOS_DE_LOTE.has(c.code) };
}

/**
 * «Calificar en lote»: una oportunidad por lead con la misma plantilla y el
 * nombre `patronNombre` con `{cliente}` reemplazado por el nombre de cada lead.
 * Cada alta es la de `calificarLead` (misma RPC atómica y el mismo prellenado:
 * lo que la plantilla no trae —p. ej. `salesperson_id`— sale de cada lead).
 *
 * Secuencial (no en paralelo) para no martillar la base; hasta 100 ids sin
 * repetir. Un lead que falla no detiene a los demás. Un id de otra
 * organización se informa como `no_encontrado` y un cliente que ya no está en
 * etapa lead (p. ej. calificado entre tanto) como `no_es_lead`.
 */
export async function calificarLeadsEnLote(
  ctx: CrmSesion,
  customerIds: readonly string[],
  plantilla: Omit<OportunidadAlta, 'name'>,
  patronNombre: string,
): Promise<ResultadoCalificarLote> {
  const ids = Array.from(new Set(customerIds));
  if (ids.length === 0 || ids.length > MAX_LOTE_CALIFICAR) {
    throw new CrmHttpError(400, 'lote_invalido', `Entre 1 y ${MAX_LOTE_CALIFICAR} leads por lote`);
  }
  const { data, error } = await ctx.supabase
    .from('customers')
    .select('id, full_name, lifecycle_stage, owner_id, lead_discarded_at, metadata')
    .eq('organization_id', ctx.organizationId)
    .in('id', ids);
  if (error) throw error;
  const fichas = new Map(((data ?? []) as LeadFicha[]).map((f) => [f.id, f]));

  const resultado: ResultadoCalificarLote = { creadas: [], fallidas: [] };
  let falloComun: { codigo: string; mensaje: string } | null = null;
  for (const id of ids) {
    const ficha = fichas.get(id);
    if (!ficha) {
      resultado.fallidas.push({ customer_id: id, nombre: null, codigo: 'no_encontrado', mensaje: 'Lead no encontrado' });
      continue;
    }
    const nombreLead = ficha.full_name?.trim() || null;
    if (falloComun) {
      resultado.fallidas.push({ customer_id: id, nombre: nombreLead, ...falloComun });
      continue;
    }
    if (ficha.lifecycle_stage !== 'lead') {
      resultado.fallidas.push({ customer_id: id, nombre: nombreLead, codigo: 'no_es_lead', mensaje: 'El cliente ya no está en etapa lead' });
      continue;
    }
    const nombre = nombreDesdePatron(patronNombre, ficha.full_name);
    try {
      const opp = await calificarFicha(ctx, ficha, { ...plantilla, name: nombre });
      const oppId = typeof opp?.id === 'string' ? opp.id : typeof opp?.opportunity_id === 'string' ? opp.opportunity_id : null;
      resultado.creadas.push({ customer_id: id, opportunity_id: oppId, nombre });
    } catch (e) {
      const { deLote, ...fallo } = falloDeLead(e);
      resultado.fallidas.push({ customer_id: id, nombre: nombreLead, ...fallo });
      if (deLote) falloComun = fallo;
    }
  }
  return resultado;
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
