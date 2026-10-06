/**
 * POST /api/crm/forecast/adjustments — ajuste con motivo del compromiso de un
 * vendedor (Figma CRM 1434:1185) o reversión del último. Permisos
 * `crm.forecast.adjust` + `crm.forecast.view_all`, validados en el servidor
 * antes de la RPC de servicio (`forecastService.ajustarPronostico`). La
 * organización sale de la sesión; una ajena en el body → 403.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { ajustarPronostico } from '@/lib/services/crm/forecastService';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const data = await ajustarPronostico(ctx, sinClavesDeOrganizacion((await readOrgBody(ctx, request)) as Record<string, unknown>));
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return respuestaErrorCrm(error, 'POST /api/crm/forecast/adjustments');
  }
}
