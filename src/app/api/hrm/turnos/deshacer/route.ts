/**
 * POST /api/hrm/turnos/deshacer — { desde, hasta }: «Deshacer» del aviso
 * «Semana publicada». Vuelve a borrador lo que la persona publicó hace menos de
 * 10 minutos y anula las novedades de tope que creó esa publicación.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { deshacerPublicacion } from '@/lib/services/hrm/turnosService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<{ desde?: unknown; hasta?: unknown }>(ctx, req, { route: 'hrm/turnos/deshacer' });
    return NextResponse.json(await deshacerPublicacion(ctx, { desde: body?.desde, hasta: body?.hasta }), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'turnos:deshacer');
  }
});
