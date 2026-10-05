import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { CRM_PERMISOS, exigirPermisoCrm, respuestaErrorCrm, CrmHttpError } from '@/lib/services/crm/crmRouteSupport';
import { readHealthCustomer } from '@/lib/services/crm/healthReadService';
import { getServiceClient } from '@/lib/supabase/server-service';
import { exigirClienteMedible } from '@/lib/services/crm/healthMutationService';
import { readOrgBody } from '@/lib/security/organizationBody';
import {
  calculateHealthScore,
} from '@/lib/services/crm/healthScoreServer';

/**
 * GET /api/crm/health/[customerId] — Obtiene el health score actual de un cliente.
 * Query: ?limit=30 (1–200) — mediciones recientes, con error de historial aislado.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const query = new URL(request.url).searchParams;
    readOrgBody(ctx, query, { request });
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.clientesVer], 'GET /api/crm/health/customer');
    const { customerId } = await params;
    const limit = Number(query.get('limit') ?? 30);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new CrmHttpError(400, 'datos_invalidos', 'Límite inválido');
    return NextResponse.json({ success: true, data: await readHealthCustomer(ctx, customerId, limit) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return respuestaErrorCrm(error, 'GET /api/crm/health/customer'); }
}

/** Alias histórico de «Medir ahora», con las mismas barreras y escritura atómica. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    await readOrgBody(ctx, request);
    const { customerId } = await params;
    await exigirClienteMedible(ctx, customerId);
    const data = await calculateHealthScore(ctx.organizationId, customerId, ctx.supabase, { writer: getServiceClient() });
    if (!data) throw new CrmHttpError(404, 'cliente_no_encontrado', 'La salud se mide sólo para clientes de tu organización');
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return respuestaErrorCrm(error, 'POST /api/crm/health/customer'); }
}
