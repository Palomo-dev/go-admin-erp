/**
 * POST /api/hrm/turnos/rotaciones/[id]/aplicar — { desde, hasta, vinculos, desfase? }
 *
 * Genera BORRADORES desde la rotación, sin pisar lo que ya existe; lo que no se
 * pudo crear vuelve en `omitidos` con su motivo (ADR-002 §2).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { aplicarRotacion } from '@/lib/services/hrm/turnosService.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    const id = await parametroDeRuta(routeParams, 'id');
    const body = await readOrgBody<{ desde?: unknown; hasta?: unknown; vinculos?: unknown; desfase?: unknown }>(ctx, req, {
      route: 'hrm/turnos/rotaciones/aplicar',
    });
    return NextResponse.json(
      await aplicarRotacion(ctx, id, { desde: body?.desde, hasta: body?.hasta, vinculos: body?.vinculos, desfase: body?.desfase }),
      { headers: SIN_CACHE }
    );
  } catch (err) {
    return responderError(err, 'turnos:rotacion');
  }
});
