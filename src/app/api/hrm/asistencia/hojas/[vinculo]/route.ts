/**
 * GET /api/hrm/asistencia/hojas/[vinculo]?desde&hasta — hoja de tiempo de una persona
 * (Figma 20.10.5) con el desglose del motor por día, sus novedades y ajustes, y las
 * vigencias de los recargos de cada día (Figma 20.11.1 y 20.11.2).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { hoja } from '@/lib/services/hrm/asistenciaService.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req, routeParams) => {
  try {
    const vinculo = await parametroDeRuta(routeParams, 'vinculo');
    const q = new URL(req.url).searchParams;
    return NextResponse.json(await hoja(ctx, vinculo, q.get('desde') ?? '', q.get('hasta') ?? ''), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'asistencia:hoja');
  }
});
