/**
 * GET /api/crm/forecast?period=2026-Q4&user_id=&team_id=&page= — pronóstico
 * trimestral por categorías (Figma CRM 1431:19 / 1434:648). Sin `period`, el
 * trimestre de HOY en la zona de la organización. La organización sale de la
 * sesión (una ajena en la query → 403); ver a otro vendedor exige
 * `crm.forecast.view_all` (servicio y RPC).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CrmHttpError, respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { forecastQuerySchema, listarPronostico } from '@/lib/services/crm/forecastService';
import { trimestreDelDia } from '@/lib/services/crm/forecastLogica';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { todayInTz } from '@/lib/utils/dateDisplay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const query = Object.fromEntries([...new URL(request.url).searchParams].filter(([, v]) => v !== ''));
    readOrgBody(ctx, query, { request });
    const parsed = forecastQuerySchema.safeParse(query);
    if (!parsed.success) throw new CrmHttpError(400, 'filtros_invalidos', 'Filtros inválidos');
    const period = parsed.data.period ?? trimestreDelDia(todayInTz(await getOrganizationTimezone(ctx.organizationId, ctx.supabase)));
    const data = await listarPronostico(ctx, { ...parsed.data, period });
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/forecast');
  }
}
