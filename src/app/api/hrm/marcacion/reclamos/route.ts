/**
 * POST /api/hrm/marcacion/reclamos — { evento_id, que, motivo, hora? } (R2, Figma 20.31.6).
 * El empleado reclama una marca suya: nace un ajuste pendiente ligado a la marca; la
 * marca original no cambia y su foto queda retenida hasta cerrar el caso. Que la marca
 * sea del actor lo comprueba `fn_hr_ajuste_solicitar`.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { reclamarMarca } from '@/lib/services/hrm/marcacionGestionService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<unknown>(ctx, req, { route: 'hrm/marcacion/reclamos' });
    return NextResponse.json(await reclamarMarca(ctx, body), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'marcacion:reclamo');
  }
});
