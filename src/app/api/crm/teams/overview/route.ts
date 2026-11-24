/**
 * GET /api/crm/teams/overview — Equipos y miembros (Figma CRM 1411:837770):
 * equipos activos con todos sus miembros (también los inactivos, que dejan de
 * recibir leads), rol, territorio, cuota y avance del mes (oportunidades
 * ganadas con `closed_at` en el mes de la organización). Permiso
 * `crm.opportunities.view`; `puedeGestionar` lo resuelve el servidor.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { getVistaEquipos } from '@/lib/services/crm/equipoComercialService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, {}, { request });
    const data = await getVistaEquipos(ctx);
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/teams/overview');
  }
}
