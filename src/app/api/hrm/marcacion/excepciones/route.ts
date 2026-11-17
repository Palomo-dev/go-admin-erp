/**
 * Excepción temporal de métodos (Figma 20.27.11, D14).
 * GET ?vinculo= → vigentes y de los últimos 30 días (`hr.attendance.view`).
 * POST { vinculo_id, metodo, desde, hasta, motivo } → nace pendiente y la aprueba
 *   RR. HH. por el motor de aprobaciones (`hr.attendance.manage`; nunca para uno mismo).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { todayInTz } from '@/lib/utils/dateCore';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { excepciones, solicitarExcepcion } from '@/lib/services/hrm/marcacionGestionService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  try {
    const vinculo = new URL(req.url).searchParams.get('vinculo');
    return NextResponse.json(await excepciones(ctx, vinculo || null), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'marcacion:excepciones');
  }
});

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<unknown>(ctx, req, { route: 'hrm/marcacion/excepciones' });
    const hoy = todayInTz(await getOrganizationTimezone(ctx.organizationId, ctx.supabase));
    return NextResponse.json(await solicitarExcepcion(ctx, body, hoy), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'marcacion:excepcion-solicitar');
  }
});
