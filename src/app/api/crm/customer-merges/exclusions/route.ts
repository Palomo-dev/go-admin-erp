/**
 * POST /api/crm/customer-merges/exclusions — «no son el mismo»: la pareja deja
 * de proponerse como duplicado (`crm_exclude_customer_pair`). Body `{ a, b }`.
 * Permiso `crm.customers.merge`; la organización sale de la sesión.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { excluirPareja } from '@/lib/services/crm/customerMergeService';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const data = await excluirPareja(ctx, sinClavesDeOrganizacion((await readOrgBody(ctx, request)) as Record<string, unknown>));
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return respuestaErrorCrm(error, 'POST /api/crm/customer-merges/exclusions');
  }
}
