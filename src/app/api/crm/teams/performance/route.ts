/**
 * GET /api/crm/teams/performance?team_id=&mes=YYYY-MM — Desempeño del equipo
 * (Figma CRM 1412:838392) y «Mi desempeño» en móvil (1413:1051). Ganado,
 * cuota, llamadas, reuniones, conversión lead → ganada y ciclo medio por
 * vendedor, en el mes de la zona de la organización. Admin y supervisores ven
 * a todos; un vendedor, su fila y el promedio (resuelto en el servidor).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { exigirUuid, respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { getVistaDesempeno } from '@/lib/services/crm/equipoComercialService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, {}, { request });
    const sp = request.nextUrl.searchParams;
    const teamId = sp.get('team_id');
    const data = await getVistaDesempeno(ctx, { teamId: teamId ? exigirUuid(teamId, 'team_id') : null, mes: sp.get('mes') });
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/teams/performance');
  }
}
