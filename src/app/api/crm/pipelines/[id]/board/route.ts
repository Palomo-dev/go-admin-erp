import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { CRM_PERMISOS, CrmHttpError, exigirPermisoCrm, exigirUuid, respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { filtrosDesdeQuery, monedaBaseDe, periodoDesdeQuery, resumenOportunidades } from '@/lib/services/crm/oportunidadesLecturaService';

/**
 * GET /api/crm/pipelines/[id]/board — cabecera del tablero kanban (CRM ola
 * 3B, plan §4.2 y paso 1.4; Figma 768:454428).
 *
 * Devuelve el pipeline de la organización (404 si es de otra), sus etapas
 * por `position` y el resumen filtrado: cantidad y montos por moneda de cada
 * columna, KPI (valor abierto, ponderado, abiertas, cierran en el periodo,
 * ganadas/perdidas a 90 días) y las tasas. **No trae tarjetas**: cada columna
 * pide las suyas paginadas a `GET /api/crm/opportunities?stage_id=…` (lazy
 * por columna; organizaciones grandes).
 *
 * Query: los filtros de la lista (salvo `pipeline_id`, que es el de la ruta) +
 * `period_from`, `period_to`, `since`, `today`.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const id = exigirUuid((await params).id);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesVer], 'GET /api/crm/pipelines/[id]/board');
    const { data: pipeline, error } = await ctx.supabase
      .from('pipelines')
      .select('id, name, pipeline_type, is_default, goal_amount, goal_period, goal_currency')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!pipeline) throw new CrmHttpError(404, 'pipeline_no_encontrado', 'Pipeline no encontrado');
    const { data: etapas, error: errorEtapas } = await ctx.supabase
      .from('stages')
      .select('id, name, position, probability, color, sla_days, is_won, is_lost, exit_criteria')
      .eq('pipeline_id', id)
      .order('position', { ascending: true });
    if (errorEtapas) throw errorEtapas;
    const sp = new URL(request.url).searchParams;
    const base = await monedaBaseDe(ctx);
    const resumen = await resumenOportunidades(ctx, { ...filtrosDesdeQuery(sp), pipeline_id: id, stage_id: undefined, status: undefined }, { ...periodoDesdeQuery(sp), base });
    return NextResponse.json({ success: true, data: { pipeline, etapas: etapas ?? [], resumen } }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/pipelines/[id]/board');
  }
}
