import { NextResponse } from 'next/server';
import { withWhatsAppRoute } from '@/lib/services/crm/whatsapp/http';
import { parseWith, searchParamsToObject, zContactsQuery } from '@/lib/services/crm/whatsapp/schemas';
import { contactsToCsv, listCampaignContacts } from '@/lib/services/crm/whatsapp/campaignService';

/** GET /api/crm/campaigns/[id]/contacts?state=&q=&page=&pageSize=&export=csv → { data, total } | CSV */
export const GET = withWhatsAppRoute(async (ctx, req, params) => {
  const q = parseWith(zContactsQuery, searchParamsToObject(new URL(req.url).searchParams), 'query');
  const isCsv = q.export === 'csv';
  const r = await listCampaignContacts(ctx.organizationId, params.id, {
    state: q.state,
    q: q.q,
    page: isCsv ? 1 : q.page ?? 1,
    pageSize: isCsv ? 500 : q.pageSize ?? 50,
  }, ctx.supabase);
  if (isCsv) {
    return new NextResponse(contactsToCsv(r.data), { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="campana-${params.id}.csv"` } });
  }
  return NextResponse.json(r);
});
