/**
 * GET /api/hrm/ausencias/[id] — detalle de una ausencia (Figma 20.14 «Incapacidad · persona»).
 *
 * La base decide el nivel (decisión 2): completo, solo el tipo (RR. HH. sin permiso de salud) o
 * «ausencia justificada» (jefe). El diagnóstico no viaja aquí: va por `/salud`, que deja el registro.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { ver } from '@/lib/services/hrm/ausenciasService.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, _req, routeParams) => {
  try {
    const id = await parametroDeRuta(routeParams, 'id');
    return NextResponse.json(await ver(ctx, id), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'ausencias:ver');
  }
});
