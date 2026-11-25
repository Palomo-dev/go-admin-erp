/**
 * POST /api/crm/assignment/simulate — «¿a quién le llegaría este lead?» sin
 * asignar nada (Figma CRM 1412:837868). Body: `{ strategy?, team_id?,
 * customer_id }` o `{ ..., customer: { city, company_size, … }, opportunity? }`.
 * Usa `assignLead` sin oportunidad (no escribe). Permiso `crm.leads.assign`;
 * la organización sale de la sesión (una ajena en el body → 403).
 *
 * Con `{ modo: 'ultimos_leads', strategy?, team_id? }`: «Así se habrían
 * repartido los últimos 50 leads» (`assignmentPreviewService`), tampoco escribe.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { simularAsignacion } from '@/lib/services/crm/territoryCountsService';
import { previsualizarUltimosLeads } from '@/lib/services/crm/assignmentPreviewService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const body = sinClavesDeOrganizacion((await readOrgBody(ctx, request)) as Record<string, unknown>);
    const data = body.modo === 'ultimos_leads' ? await previsualizarUltimosLeads(ctx, body) : await simularAsignacion(ctx, body);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return respuestaErrorCrm(error, 'POST /api/crm/assignment/simulate');
  }
}
