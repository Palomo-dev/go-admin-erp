import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { CRM_PERMISOS, exigirPermisoCrm } from '@/lib/services/crm/crmRouteSupport';

/**
 * GET /api/crm/leads/heredados — oportunidades `record_type='lead'` HEREDADAS.
 *
 * CRM ola 1 (D2): era `GET /api/crm/leads`. Los leads nuevos son clientes
 * (`GET /api/crm/leads`); esta ruta se conserva, con otro nombre, mientras la
 * pantalla actual de Leads la use para convertir las oportunidades 'lead' que
 * ya existen. Se borra con la ola 3A. `crm.leads.view`.
 * Query params opcionales: salesperson_id, stage_id, status, search
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.leadsVer], 'GET /api/crm/leads/heredados');
    const { searchParams } = new URL(request.url);

    let query = ctx.supabase
      .from('opportunities')
      .select(`
        id,
        name,
        customer_id,
        salesperson_id,
        stage_id,
        pipeline_id,
        amount,
        currency,
        expected_close_date,
        status,
        source,
        temperature,
        score_total,
        icp_band,
        next_contact_at,
        last_contact_at,
        created_at,
        updated_at
      `)
      .eq('organization_id', ctx.organizationId)
      .eq('record_type', 'lead');

    // Filtros opcionales
    const salespersonId = searchParams.get('salesperson_id');
    if (salespersonId) {
      query = query.eq('salesperson_id', salespersonId);
    }

    const stageId = searchParams.get('stage_id');
    if (stageId) {
      query = query.eq('stage_id', stageId);
    }

    const status = searchParams.get('status');
    if (status) {
      query = query.eq('status', status);
    }

    const search = searchParams.get('search');
    if (search) {
      query = query.ilike('name', `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    }

    // Ordenamiento: más recientes primero
    query = query.order('created_at', { ascending: false });

    const { data: leads, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, data: leads }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Leads] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
