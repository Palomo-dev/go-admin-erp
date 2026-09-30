import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CRM_PERMISOS, CrmHttpError, exigirPermisoCrm, exigirUuid, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { actualizarOportunidad, eliminarOportunidad, oportunidadEdicionSchema } from '@/lib/services/crm/opportunityWriteService';

/**
 * /api/crm/opportunities/[id] — CRM ola 1 (plan §4.6 y §4.7).
 *
 * GET    detalle con líneas (productos, conceptos y espacios), cliente, etapa,
 *        pipeline y `entro_etapa_en` (`crm.opportunities.view`; ola 3B).
 * PATCH  edición con `crm_update_opportunity`: propia con `edit`, cualquiera con
 *        `edit_any`; metadata y discovery_data se fusionan; líneas por
 *        diferencia; `expected_updated_at` opcional → 409 `conflicto`.
 *        Etapa, estado y cierre NO se editan aquí (400 `campo_no_editable`):
 *        van por `…/stage`, `…/win` y `…/lose`.
 * DELETE borrado con `crm_delete_opportunity` (`crm.opportunities.delete`):
 *        409 si está ganada o tiene factura, cotización, venta o comisión.
 */

type Params = { params: Promise<{ id: string }> };

const NO_EDITABLES = ['stage_id', 'status', 'pipeline_id', 'record_type', 'win_data', 'closed_at', 'loss_reason', 'loss_reason_value', 'created_by', 'origen'];

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext(request);
    const id = exigirUuid((await params).id);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesVer], 'GET /api/crm/opportunities/[id]');
    const { data, error } = await ctx.supabase
      .from('opportunities')
      .select(
        '*, opportunity_products(id, product_id, quantity, unit_price, total_price, producto:products(name, sku)), opportunity_custom_lines(id, concept, quantity, unit_price, total_price), opportunity_spaces(id, space_id, nights, unit_price, total_price, espacio:spaces(label)), cliente:customers(id, full_name, customer_type, doc_type, doc_number, email, phone, city, avatar_url, lifecycle_stage, created_at, do_not_call), etapa:stages(id, name, probability, color, position, is_won, is_lost), pipeline:pipelines(id, name, pipeline_type)',
      )
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new CrmHttpError(404, 'oportunidad_no_encontrada', 'Oportunidad no encontrada');
    const opp = data as Record<string, unknown>;
    // Ola 3B: desde cuándo está en la etapa (cabecera del drawer y del detalle).
    const { data: entrada } = await ctx.supabase
      .from('opportunity_stage_history')
      .select('changed_at')
      .eq('organization_id', ctx.organizationId)
      .eq('opportunity_id', id)
      .order('changed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const entroEtapaEn = (entrada as { changed_at?: string | null } | null)?.changed_at ?? (opp.created_at as string | null) ?? null;
    return NextResponse.json({ success: true, data: { ...opp, es_lead: opp.record_type === 'lead', entro_etapa_en: entroEtapaEn } });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/opportunities/[id]');
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext(request);
    const leido: Record<string, unknown> = await readOrgBody(ctx, request);
    const body = sinClavesDeOrganizacion(leido);
    const id = exigirUuid((await params).id);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesEditar, CRM_PERMISOS.oportunidadesEditarCualquiera], 'PATCH /api/crm/opportunities/[id]');
    const prohibidos = NO_EDITABLES.filter((k) => k in body);
    if (prohibidos.length > 0) throw new CrmHttpError(400, 'campo_no_editable', 'Etapa, estado y cierre se cambian con …/stage, …/win o …/lose', { campos: prohibidos });
    const parsed = oportunidadEdicionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const data = await actualizarOportunidad(ctx, id, parsed.data);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return respuestaErrorCrm(error, 'PATCH /api/crm/opportunities/[id]');
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext(request);
    await readOrgBody(ctx, request);
    const id = exigirUuid((await params).id);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesEliminar], 'DELETE /api/crm/opportunities/[id]');
    const data = await eliminarOportunidad(ctx, id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return respuestaErrorCrm(error, 'DELETE /api/crm/opportunities/[id]');
  }
}
