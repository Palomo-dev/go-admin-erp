import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { CRM_PERMISOS, CrmHttpError, exigirPermisoCrm, exigirUuid, respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';

/**
 * GET /api/crm/opportunities/[id]/stage-history — historial de etapas (CRM ola 1).
 *
 * `opportunity_stage_history` de la oportunidad, del más reciente al más
 * antiguo, con el nombre de las etapas. Desde 20260930160500 cada alta deja su
 * fila inicial (`from_stage_id` NULL), así que «días en etapa» =
 * ahora − `changed_at` de la primera fila. `crm.opportunities.view`.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const id = exigirUuid((await params).id);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesVer], 'GET /api/crm/opportunities/[id]/stage-history');
    const { data: opp, error: e1 } = await ctx.supabase
      .from('opportunities')
      .select('id, stage_id, created_at')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (e1) throw e1;
    if (!opp) throw new CrmHttpError(404, 'oportunidad_no_encontrada', 'Oportunidad no encontrada');
    const { data, error } = await ctx.supabase
      .from('opportunity_stage_history')
      .select('id, from_stage_id, to_stage_id, changed_by, changed_at')
      .eq('organization_id', ctx.organizationId)
      .eq('opportunity_id', id)
      .order('changed_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    type Fila = { id: string; from_stage_id: string | null; to_stage_id: string; changed_by: string | null; changed_at: string };
    const filas = (data ?? []) as Fila[];
    // `opportunity_stage_history` no tiene FK a `stages` (verificado por MCP):
    // los nombres se leen aparte, solo de etapas de pipelines de la organización.
    const ids = Array.from(new Set(filas.flatMap((f) => [f.from_stage_id, f.to_stage_id]).filter((v): v is string => Boolean(v))));
    const nombres = new Map<string, string>();
    if (ids.length > 0) {
      const { data: etapas, error: e2 } = await ctx.supabase
        .from('stages')
        .select('id, name, pipelines!inner(organization_id)')
        .in('id', ids)
        .eq('pipelines.organization_id', ctx.organizationId);
      if (e2) throw e2;
      for (const e of (etapas ?? []) as Array<{ id: string; name: string }>) nombres.set(e.id, e.name);
    }
    const o = opp as { stage_id: string; created_at: string };
    const entrada = filas.find((f) => f.to_stage_id === o.stage_id);
    return NextResponse.json({
      success: true,
      data: filas.map((f) => ({ ...f, from_stage_name: f.from_stage_id ? nombres.get(f.from_stage_id) ?? null : null, to_stage_name: nombres.get(f.to_stage_id) ?? null })),
      en_etapa_desde: entrada?.changed_at ?? o.created_at,
    });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/opportunities/[id]/stage-history');
  }
}
