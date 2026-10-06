/**
 * POST /api/crm/customer-merges/[id]/undo — deshace una fusión dentro de 30
 * días (`crm_unmerge_customer`: solo administrador, y solo si ninguna fusión
 * posterior depende de ella). La organización sale de la sesión.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { deshacerFusion } from '@/lib/services/crm/customerMergeService';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    await readOrgBody(ctx, request);
    const data = await deshacerFusion(ctx, (await params).id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return respuestaErrorCrm(error, 'POST /api/crm/customer-merges/[id]/undo');
  }
}
