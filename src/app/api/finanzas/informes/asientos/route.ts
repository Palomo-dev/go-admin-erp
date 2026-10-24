import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { exigirLecturaInformes } from '@/lib/finanzas/informes/acceso.server';
import { leerFiltrosInforme } from '@/lib/finanzas/informes/filtros';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { cargarAsientosSeleccionablesInformes } from '@/lib/services/finanzas/informesFuente.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, request) => {
  const parametros = new URL(request.url).searchParams;
  readOrgBody(ctx, parametros);
  await exigirLecturaInformes(ctx);
  const lectura = leerFiltrosInforme(parametros);
  if (!lectura.datos) return NextResponse.json({ error: lectura.error }, { status: 400 });
  const timezone = await getOrganizationTimezone(ctx.organizationId, ctx.supabase);
  const asientos = await cargarAsientosSeleccionablesInformes(ctx.supabase, ctx.organizationId, lectura.datos, timezone);
  return NextResponse.json({ asientos }, { headers: { 'Cache-Control': 'private, no-store' } });
});
