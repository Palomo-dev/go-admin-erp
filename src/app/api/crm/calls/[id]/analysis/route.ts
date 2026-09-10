import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getAnalysis } from '@/lib/services/crm/callAnalysisService';
import { getCallTagsForCall } from '@/lib/services/crm/callTagService';

/**
 * GET /api/crm/calls/[id]/analysis — Último análisis + etiquetas de la llamada +
 * objeciones del catálogo hidratadas + etapa sugerida hidratada + política.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const analysis = await getAnalysis(id, ctx.organizationId, ctx.supabase);
    if (!analysis) {
      const { data: job } = await ctx.supabase
        .from('outbound_jobs')
        .select('id, status, attempts, last_error')
        .eq('organization_id', ctx.organizationId)
        .eq('kind', 'analyze')
        .eq('payload->>call_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return NextResponse.json({ success: false, error: 'Análisis no encontrado', data: { analysis: null, job: job ?? null } }, { status: 404 });
    }

    const objectionIds = analysis.raw_response?.objection_ids ?? [];
    const [tags, objectionsRes, stageRes] = await Promise.all([
      getCallTagsForCall(id, ctx.organizationId, ctx.supabase),
      objectionIds.length
        ? ctx.supabase.from('objections').select('id, title, category, recommended_response').eq('organization_id', ctx.organizationId).in('id', objectionIds)
        : Promise.resolve({ data: [] as unknown[] }),
      analysis.suggested_stage_id
        ? ctx.supabase.from('stages').select('id, name').eq('id', analysis.suggested_stage_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

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
    if (error instanceof OrgContextError) return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Calls Analysis] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
