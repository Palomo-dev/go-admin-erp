import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { CRM_PERMISOS, exigirPermisoCrm, exigirUuid, respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { contextoEventoLead } from '@/lib/services/crm/leadEventoService';

/**
 * GET /api/crm/leads/[id]/evento — lo que la hoja de detalle rápido del lead no
 * trae en la fila (Figma «CRM · Lead de evento privado del sitio» 1951:941568):
 *   sede           nombre de la sede de la última solicitud de evento privado
 *   inasistencias  reservas de restaurante del cliente con status = no_show
 *
 * La organización sale de la sesión; la sede, de la metadata del cliente leída
 * en el servidor. `crm.leads.view`. 200 · 400 · 403 · 404.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const id = exigirUuid((await params).id);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.leadsVer], 'GET /api/crm/leads/[id]/evento');
    const data = await contextoEventoLead(ctx, id);
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/leads/[id]/evento');
  }
}
