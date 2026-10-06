/**
 * GET /api/crm/campaigns/unified?channel=all|voice|messages&q=&page= —
 * campañas de mensajes y de voz en un solo listado (RPC
 * `crm_campaigns_unificadas`). La organización sale de la sesión; una ajena en
 * la query → 403 (`readOrgBody`). Permiso `crm.opportunities.view`.
 * Respuesta: `{ success, data: { rows, total, porCanal, canManage } }`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CrmHttpError, respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { campanasUnificadasQuery, listarCampanasUnificadas } from '@/lib/services/crm/campaignsUnificadasService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const query = Object.fromEntries(new URL(request.url).searchParams);
    readOrgBody(ctx, query, { request });
    const parsed = campanasUnificadasQuery.safeParse(query);
    if (!parsed.success) throw new CrmHttpError(400, 'filtros_invalidos', 'Filtros inválidos');
    const data = await listarCampanasUnificadas(ctx, parsed.data);
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/campaigns/unified');
  }
}
