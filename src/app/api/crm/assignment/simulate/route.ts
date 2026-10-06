/**
 * POST /api/crm/assignment/simulate — «¿a quién le llegaría este lead?» sin
 * asignar nada (Figma CRM 1412:837868). Body: `{ strategy?, team_id?,
 * customer_id }` o `{ ..., customer: { city, company_size, … }, opportunity? }`.
 * Usa `assignLead` sin oportunidad (no escribe). Permiso `crm.leads.assign`;
 * la organización sale de la sesión (una ajena en el body → 403).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { simularAsignacion } from '@/lib/services/crm/territoryCountsService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const data = await simularAsignacion(ctx, sinClavesDeOrganizacion((await readOrgBody(ctx, request)) as Record<string, unknown>));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return respuestaErrorCrm(error, 'POST /api/crm/assignment/simulate');
  }
}
