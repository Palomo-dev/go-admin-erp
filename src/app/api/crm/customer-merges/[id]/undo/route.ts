import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, requireOrgAdmin } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import {
  CRM_PERMISOS,
  exigirPermisoCrm,
  exigirUuid,
  respuestaErrorCrm,
} from '@/lib/services/crm/crmRouteSupport';
import { deshacerFusion } from '@/lib/services/crm/customerMergeService';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getServerOrgContext(request);
    await exigirPermisoCrm(
      ctx,
      [CRM_PERMISOS.clientesFusionar],
      'POST /api/crm/customer-merges/[id]/undo',
    );
    requireOrgAdmin(ctx);
    await readOrgBody(ctx, request);
    const id = exigirUuid((await params).id);
    const data = await deshacerFusion(ctx, id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return respuestaErrorCrm(error, 'POST /api/crm/customer-merges/[id]/undo');
  }
}
