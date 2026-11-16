/**
 * POST /api/hrm/turnos/validar — { desde, hasta, vinculos? }
 *
 * Bloqueos y alertas de la planeación antes de publicar (ADR-002 §2). Solo lee;
 * va por POST porque la lista de vínculos puede ser larga.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { validar } from '@/lib/services/hrm/turnosService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<{ desde?: unknown; hasta?: unknown; vinculos?: unknown }>(ctx, req, { route: 'hrm/turnos/validar' });
    return NextResponse.json(await validar(ctx, { desde: body?.desde, hasta: body?.hasta, vinculos: body?.vinculos }), {
      headers: SIN_CACHE,
    });
  } catch (err) {
    return responderError(err, 'turnos:validar');
  }
});
