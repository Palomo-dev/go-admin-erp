import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { snapshotCustomerHealth } from '@/lib/services/crm/healthScoreServer';
import { exigirClienteMedible } from '@/lib/services/crm/healthMutationService';
import { CrmHttpError, respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';

/** Lecturas de sesión y permisos preceden la RPC privilegiada que guarda ambas cifras. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    await readOrgBody(ctx, request);
    const { customerId } = await params;
    await exigirClienteMedible(ctx, customerId);
    const data = await snapshotCustomerHealth(ctx.organizationId, customerId, ctx.supabase, new Date(), { writer: getServiceClient() });
    if (!data) throw new CrmHttpError(404, 'cliente_no_encontrado', 'La salud se mide sólo para clientes de tu organización');
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return respuestaErrorCrm(error, 'POST /api/crm/health/customer/snapshot'); }
}
