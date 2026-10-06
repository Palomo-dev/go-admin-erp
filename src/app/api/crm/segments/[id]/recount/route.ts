/**
 * POST /api/crm/segments/[id]/recount — recalcula `customer_count` de un
 * segmento con el MISMO conteo que el constructor (`crm_segment_preview`), en
 * el servidor. Antes el navegador contaba con PostgREST y escribía el número.
 * Permiso `crm.segments.manage`; organización de la sesión.
 * Respuesta: `{ success, data: { customer_count, last_run_at } }`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CRM_PERMISOS, CrmHttpError, exigirPermisoCrm, exigirUuid, respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { contarSegmento } from '@/lib/services/crm/segmentosConteoService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    await readOrgBody(ctx, request);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.segmentosGestionar], 'POST /api/crm/segments/[id]/recount');
    const id = exigirUuid((await params).id);
    const { data: seg, error } = await ctx.supabase
      .from('segments')
      .select('id, filter_json')
      .eq('organization_id', ctx.organizationId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!seg) throw new CrmHttpError(404, 'segmento_no_encontrado', 'Segmento no encontrado');
    const conteo = await contarSegmento(ctx.organizationId, ctx.supabase, (seg as { filter_json: unknown }).filter_json);
    const last_run_at = new Date().toISOString();
    const upd = await ctx.supabase
      .from('segments')
      .update({ customer_count: conteo.coinciden, last_run_at })
      .eq('organization_id', ctx.organizationId)
      .eq('id', id);
    if (upd.error) throw upd.error;
    return NextResponse.json({ success: true, data: { customer_count: conteo.coinciden, last_run_at } });
  } catch (error) {
    return respuestaErrorCrm(error, 'POST /api/crm/segments/[id]/recount');
  }
}
