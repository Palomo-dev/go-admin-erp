import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { CRM_PERMISOS, CrmHttpError, exigirPermisoCrm, respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';

/**
 * GET /api/crm/leads/resumen — KPI de la pantalla Leads (CRM ola 3A, Figma
 * 765:446571) y el aviso de leads sin colocar (`CaptureBanner`, 765:448463).
 *
 * Mismo universo que `GET /api/crm/leads` por defecto: clientes en etapa
 * lead, con origen, sin descartar y sin fusionar. Solo conteos (`head`), nunca
 * filas: hay ~35 000 leads.
 *
 * Query (instantes ISO que la interfaz calcula en la zona de la organización):
 *   mes_desde   inicio del mes en curso → «+N este mes» y «Calificados este mes»
 *   siete_desde hace 7 días → «Contactados (7 días)»
 * «Calificados» = oportunidades con `metadata.origen='lead'` (las crea
 * `crm_create_opportunity` al calificar). «Sin colocar» = leads del formulario
 * web cuando la organización no tiene pipeline de ventas (M1b sin RPC).
 * `crm.leads.view`. 200 · 400 · 403.
 */
const esIso = (v: string | null) => !!v && !Number.isNaN(Date.parse(v));

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.leadsVer], 'GET /api/crm/leads/resumen');
    const sp = request.nextUrl.searchParams;
    const mes = sp.get('mes_desde');
    const siete = sp.get('siete_desde');
    if (!esIso(mes) || !esIso(siete)) throw new CrmHttpError(400, 'parametro_invalido', 'mes_desde y siete_desde son instantes ISO');

    const leads = () =>
      ctx.supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', ctx.organizationId)
        .eq('lifecycle_stage', 'lead')
        .neq('status', 'merged')
        .not('lead_source', 'is', null)
        .is('lead_discarded_at', null);

    const [total, nuevos, sinResponsable, contactados, calificados, ventas] = await Promise.all([
      leads(),
      leads().gte('created_at', mes as string),
      leads().is('owner_id', null),
      leads().gte('last_contact_at', siete as string),
      ctx.supabase
        .from('opportunities')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', ctx.organizationId)
        .eq('metadata->>origen', 'lead')
        .gte('created_at', mes as string),
      ctx.supabase.from('pipelines').select('id').eq('organization_id', ctx.organizationId).eq('pipeline_type', 'sales').limit(1),
    ]);
    for (const r of [total, nuevos, sinResponsable, contactados, calificados, ventas]) if (r.error) throw r.error;

    const hayEmbudoVentas = (ventas.data ?? []).length > 0;
    const sinColocar = hayEmbudoVentas ? { count: 0, error: null } : await leads().eq('lead_source', 'web_form');
    if (sinColocar.error) throw sinColocar.error;

    return NextResponse.json(
      {
        success: true,
        data: {
          total: total.count ?? 0,
          nuevos_mes: nuevos.count ?? 0,
          sin_responsable: sinResponsable.count ?? 0,
          contactados_7d: contactados.count ?? 0,
          calificados_mes: calificados.count ?? 0,
          hay_embudo_ventas: hayEmbudoVentas,
          sin_colocar: sinColocar.count ?? 0,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/leads/resumen');
  }
}
