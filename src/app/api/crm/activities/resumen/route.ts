import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { kpisActividadesOrg, leerFiltrosFeed } from '@/lib/services/crm/actividadesOrgService';

/**
 * GET /api/crm/activities/resumen — los 7 KPI de la pantalla Actividades
 * (CRM ola 3A, Figma 769:12376): total, llamadas, correos, WhatsApp,
 * reuniones, notas y tareas abiertas, con el rango (ISO, calculado en la zona
 * de la organización), responsable y entidad de la pantalla. El tipo no filtra
 * los KPI (son el desglose por tipo).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const data = await kpisActividadesOrg(ctx, leerFiltrosFeed(request.nextUrl.searchParams));
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/activities/resumen');
  }
}
