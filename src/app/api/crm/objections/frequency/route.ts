/**
 * GET /api/crm/objections/frequency[?id=<objeción>] — frecuencia de cada
 * objeción en las llamadas de los últimos 90 días (y, con `id`, tendencia
 * semanal, llamadas y respuestas que funcionaron). RPC
 * `crm_objection_frequency`; la organización sale de la sesión (una ajena en la
 * query → 403) y la visibilidad de llamadas la decide la base.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { leerFrecuenciaObjeciones } from '@/lib/services/crm/objectionFrequencyService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, {}, { request });
    const id = new URL(request.url).searchParams.get('id');
    const data = await leerFrecuenciaObjeciones(ctx, id || null);
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/objections/frequency');
  }
}
