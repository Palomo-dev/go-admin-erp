import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CRM_PERMISOS, exigirPermisoCrm, respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request); const query = new URL(request.url).searchParams;
    readOrgBody(ctx, query, { request }); await exigirPermisoCrm(ctx, [CRM_PERMISOS.campanasGestionar, CRM_PERMISOS.etapasGestionar], 'GET contexto editor agente');
    const [pipelines, products, settings] = await Promise.all([
      ctx.supabase.from('pipelines').select('id, name, stages(id, name, position, is_won, is_lost)').eq('organization_id', ctx.organizationId).order('name'),
      ctx.supabase.from('products').select('id, name, sku').eq('organization_id', ctx.organizationId).order('name').limit(300),
      ctx.supabase.from('comm_settings').select('data_policy_url').eq('organization_id', ctx.organizationId).maybeSingle(),
    ]);
    for (const result of [pipelines, products, settings]) if (result.error) throw result.error;
    if (!Array.isArray(pipelines.data) || !Array.isArray(products.data)) throw new Error('Respuesta de catálogo inválida');
    return NextResponse.json({ success: true, data: { pipelines: pipelines.data, products: products.data, data_policy_url: settings.data?.data_policy_url ?? null } }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return respuestaErrorCrm(error, 'GET contexto editor agente'); }
}
