/**
 * POST /api/crm/segments/preview — conteo en vivo de un filtro de segmento
 * (Figma 1384:825677). Body: `{ filter_json }` (lista de reglas o
 * `{ grupos: [[regla]] }`). La organización sale de la sesión; una ajena en el
 * body → 403 (`readOrgBody`). Permiso `crm.customers.view` en la ruta y otra
 * vez dentro de la RPC.
 * Respuesta: `{ success, data: { base, coinciden, desglose, muestra, calculado_en } }`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CRM_PERMISOS, exigirPermisoCrm, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { contarSegmento } from '@/lib/services/crm/segmentosConteoService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const body = sinClavesDeOrganizacion((await readOrgBody(ctx, request)) as Record<string, unknown>);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.clientesVer], 'POST /api/crm/segments/preview');
    const data = await contarSegmento(ctx.organizationId, ctx.supabase, body.filter_json ?? []);
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return respuestaErrorCrm(error, 'POST /api/crm/segments/preview');
  }
}
