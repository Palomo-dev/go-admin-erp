import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CRM_PERMISOS, CrmHttpError, exigirPermisoCrm, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { getPipelineTemplateById } from '@/lib/services/crm/pipelineTemplates';
import { crearPipeline, datosDePipeline, pipelineAltaSchema } from '@/lib/services/crm/pipelineWriteService';

/**
 * /api/crm/pipelines — CRM ola 1 (plan §4.3, M6).
 *
 * GET  pipelines de la organización con sus etapas (`crm.opportunities.view`).
 * POST «Nuevo pipeline» desde plantilla y/o con etapas propias
 *      (`crm.pipelines.manage`), en una transacción con
 *      `crm_create_pipeline_with_stages`.
 *      Body: { template?: 'sales'|'onboarding'|'renewal', name?, pipeline_type?,
 *              is_default?, goal_amount?, goal_period?, goal_currency?, stages?: [...] }
 *      201 { pipeline, stages } · 400 validación (sin etapa ganadora, perdedora,
 *      probabilidades desordenadas…) · 403 · 404 plantilla · 409 nombre repetido.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesVer], 'GET /api/crm/pipelines');
    const { data, error } = await ctx.supabase
      .from('pipelines')
      .select('id, name, pipeline_type, is_default, goal_amount, goal_period, goal_currency, created_at, stages(id, name, position, probability, color, sla_days, is_won, is_lost)')
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/pipelines');
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: Record<string, unknown> = await readOrgBody(ctx, request);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.pipelinesGestionar], 'POST /api/crm/pipelines');
    const parsed = pipelineAltaSchema.safeParse(sinClavesDeOrganizacion(body));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const plantilla = parsed.data.template ? getPipelineTemplateById(parsed.data.template) : null;
    if (parsed.data.template && !plantilla) throw new CrmHttpError(404, 'plantilla_no_encontrada', 'Plantilla no encontrada');
    const datos = datosDePipeline(parsed.data, plantilla);
    if (!datos) throw new CrmHttpError(400, 'sin_etapas', 'El pipeline necesita nombre y etapas (o una plantilla que las traiga)');
    const data = await crearPipeline(ctx, datos);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return respuestaErrorCrm(error, 'POST /api/crm/pipelines');
  }
}
