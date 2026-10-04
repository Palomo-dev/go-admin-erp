import { NextRequest, NextResponse } from 'next/server';
import { exigirAccesoLlamada } from '@/lib/services/crm/callAccessService';
import { respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getAnalysis } from '@/lib/services/crm/callAnalysisService';
import { getCallTagsForCall } from '@/lib/services/crm/callTagService';

/**
 * GET /api/crm/calls/[id]/analysis — Último análisis + etiquetas de la llamada +
 * objeciones del catálogo hidratadas + etapa sugerida hidratada + política.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const { id } = await params;
    readOrgBody(ctx, {}, { request });
    await exigirAccesoLlamada(ctx, id, 'lectura');
    const analysis = await getAnalysis(id, ctx.organizationId, ctx.supabase);
    if (!analysis) {
      const { data: job, error: jobError } = await ctx.supabase
        .from('outbound_jobs')
        .select('id, status, attempts, last_error')
        .eq('organization_id', ctx.organizationId)
        .eq('kind', 'analyze')
        .eq('payload->>call_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (jobError) throw jobError;
      return NextResponse.json({ success: false, error: 'Análisis no encontrado', data: { analysis: null, job: job ?? null } }, { status: 404 });
    }

    const objectionIds = analysis.raw_response?.objection_ids ?? [];
    const [tags, objectionsRes, stageRes] = await Promise.all([
      getCallTagsForCall(id, ctx.organizationId, ctx.supabase),
      objectionIds.length
        ? ctx.supabase.from('objections').select('id, title, category, recommended_response').eq('organization_id', ctx.organizationId).in('id', objectionIds)
        : Promise.resolve({ data: [] as unknown[], error: null }),
      analysis.suggested_stage_id
        ? ctx.supabase.from('stages').select('id, name').eq('id', analysis.suggested_stage_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (objectionsRes.error) throw objectionsRes.error;
    if (stageRes.error) throw stageRes.error;

    return NextResponse.json({
      success: true,
      data: {
        analysis,
        tags,
        objections: objectionsRes.data ?? [],
        suggested_stage: stageRes.data ?? null,
        policy: analysis.raw_response?.policy ?? 'suggest',
        applied_actions: analysis.raw_response?.applied_actions ?? [],
        temperature: analysis.raw_response?.temperature ?? null,
      },
    });
  } catch (error: unknown) {
    return respuestaErrorCrm(error, 'llamada_auxiliar');
  }
}
