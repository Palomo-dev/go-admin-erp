/**
 * PATCH /api/crm/opportunities/[id]/forecast-category — categoría del
 * pronóstico de una oportunidad abierta (`commit`, `best_case`, `pipeline`,
 * `omitted`). Body: `{ category, expected_updated_at }` (bloqueo optimista).
 * RPC `crm_set_forecast_category` con la sesión: exige editar la oportunidad
 * (propia, o cualquiera con `crm.opportunities.edit_any`).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { exigirUuid, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { cambiarCategoriaPronostico } from '@/lib/services/crm/forecastService';

export const runtime = 'nodejs';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const body = sinClavesDeOrganizacion((await readOrgBody(ctx, request)) as Record<string, unknown>);
    const id = exigirUuid((await params).id, 'Oportunidad');
    const data = await cambiarCategoriaPronostico(ctx, id, body);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return respuestaErrorCrm(error, 'PATCH /api/crm/opportunities/[id]/forecast-category');
  }
}
