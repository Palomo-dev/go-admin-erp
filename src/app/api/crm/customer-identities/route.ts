import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import {
  CRM_PERMISOS,
  exigirPermisoCrm,
  respuestaErrorCrm,
  tienePermisoCrm,
} from '@/lib/services/crm/crmRouteSupport';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, {}, { request });
    await exigirPermisoCrm(
      ctx,
      [CRM_PERMISOS.clientesVer],
      'GET /api/crm/customer-identities',
    );
    const sp = new URL(request.url).searchParams;
    const page = Math.max(1, Number.parseInt(sp.get('page') ?? '1', 10) || 1);
    const { data, error, count } = await ctx.supabase
      .from('customer_channel_identities')
      .select(
        'id,identity_type,identity_value,verified,last_seen_at,customer:customers(id,full_name,email,phone),channel:channels(id,name,type)',
        { count: 'exact' },
      )
      .eq('organization_id', ctx.organizationId)
      .order('last_seen_at', { ascending: false })
      .order('id')
      .range((page - 1) * 25, page * 25 - 1);
    if (error) throw error;
    return NextResponse.json({
      success: true,
      data: data ?? [],
      total: count ?? 0,
      page,
      canEdit: await tienePermisoCrm(ctx, CRM_PERMISOS.clientesEditar),
    });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/customer-identities');
  }
}
