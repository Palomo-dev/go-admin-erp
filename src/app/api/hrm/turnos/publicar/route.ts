/**
 * POST /api/hrm/turnos/publicar — { desde, hasta, vinculos?, aceptar_alertas? }
 *
 * Publica los borradores del rango. Con bloqueos no publica; con alertas pide
 * `aceptar_alertas: true` (ADR-002 §2). Solo `hr.attendance.manage`.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { publicar } from '@/lib/services/hrm/turnosService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<{ desde?: unknown; hasta?: unknown; vinculos?: unknown; aceptar_alertas?: unknown }>(ctx, req, {
      route: 'hrm/turnos/publicar',
    });
    return NextResponse.json(
      await publicar(ctx, { desde: body?.desde, hasta: body?.hasta, vinculos: body?.vinculos, aceptarAlertas: body?.aceptar_alertas }),
      { headers: SIN_CACHE }
    );
  } catch (err) {
    return responderError(err, 'turnos:publicar');
  }
});
