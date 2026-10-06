/**
 * GET /api/crm/customer-merges/duplicates — posibles duplicados por teléfono,
 * correo y documento (`crm_find_duplicates`), sin las parejas marcadas como
 * «no son el mismo». Permiso `crm.customers.view`; dice además si la sesión
 * puede fusionar.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { buscarDuplicados } from '@/lib/services/crm/customerMergeService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, {}, { request });
    const data = await buscarDuplicados(ctx);
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/customer-merges/duplicates');
  }
}
