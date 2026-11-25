/**
 * GET /api/crm/identities?q=&canal= — identidades por canal de los clientes
 * (`customer_channel_identities`), solo lectura. Permiso `crm.customers.view`;
 * la organización sale de la sesión.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { listarIdentidadesCanal } from '@/lib/services/crm/identidadesCanalService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, {}, { request });
    const sp = request.nextUrl.searchParams;
    const filtros = { q: sp.get('q') || undefined, canal: sp.get('canal') || undefined };
    const data = await listarIdentidadesCanal(ctx, filtros);
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/identities');
  }
}
