import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CRM_PERMISOS, exigirPermisoCrm, respuestaErrorCrm, tienePermisoCrm } from '@/lib/services/crm/crmRouteSupport';
import { leerFichaCliente } from '@/lib/services/crm/fichaClienteService';

export const dynamic = 'force-dynamic';

/** Ficha única, siempre de la organización activa; nunca service role. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    await readOrgBody(ctx, request, { route: 'GET /api/clientes/[id]' });
    const clientes = await tienePermisoCrm(ctx, CRM_PERMISOS.clientesVer);
    if (!clientes) await exigirPermisoCrm(ctx, [CRM_PERMISOS.leadsVer], 'GET /api/clientes/[id]');
    const { id } = await params;
    const data = await leerFichaCliente(ctx.supabase, ctx.organizationId, id, !clientes);
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/clientes/[id]');
  }
}
