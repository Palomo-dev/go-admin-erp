/**
 * POST /api/crm/customer-merges — fusiona un cliente secundario en el
 * principal en UNA transacción (`crm_merge_customers`). Body:
 * `{ primary_id, secondary_id, choices: { campo: id_origen } }`. Permiso
 * `crm.customers.merge`; la organización sale de la sesión (una ajena → 403).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { fusionarClientes } from '@/lib/services/crm/customerMergeService';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const data = await fusionarClientes(ctx, sinClavesDeOrganizacion((await readOrgBody(ctx, request)) as Record<string, unknown>));
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return respuestaErrorCrm(error, 'POST /api/crm/customer-merges');
  }
}
