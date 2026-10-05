import { NextResponse } from 'next/server';
import { withWhatsAppRoute } from '@/lib/services/crm/whatsapp/http';
import { parseWith, searchParamsToObject, zContactsQuery } from '@/lib/services/crm/whatsapp/schemas';
import { contactsToCsv, exportCampaignContacts, listCampaignContacts } from '@/lib/services/crm/whatsapp/campaignService';
import { readOrgBody } from '@/lib/security/organizationBody';
import { exigirPermisoCrm, CRM_PERMISOS } from '@/lib/services/crm/crmRouteSupport';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';

/** GET /api/crm/campaigns/[id]/contacts?state=&q=&page=&pageSize=&export=csv → { data, total } | CSV */
export const GET = withWhatsAppRoute(async (ctx, req, params) => {
  readOrgBody(ctx, {}, { request: req });
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesVer], 'Consultar contactos de campañas');
  const q = parseWith(zContactsQuery, searchParamsToObject(new URL(req.url).searchParams), 'query');
  if (q.export === 'csv') {
    const r = await exportCampaignContacts(ctx.organizationId, params.id, q, ctx.supabase);
    const timezone = await getOrganizationTimezone(ctx.organizationId, ctx.supabase);
    return new NextResponse(contactsToCsv(r.data, timezone), { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="campana-${params.id}.csv"` } });
  }
  const r = await listCampaignContacts(ctx.organizationId, params.id, q, ctx.supabase);
  return NextResponse.json(r);
});
