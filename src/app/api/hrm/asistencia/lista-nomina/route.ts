/**
 * POST /api/hrm/asistencia/lista-nomina — { desde, hasta, vinculos? }
 *
 * Marca el período (o las hojas elegidas) «lista para nómina» (Figma 20.10.4,
 * 20.10.5 y 20.12.5): aplica los ajustes aprobados, reclasifica los días que lo
 * necesitan y devuelve los que no pudo con su motivo. Solo `hr.attendance.manage`.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { marcarPeriodoListo } from '@/lib/services/hrm/asistenciaService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { HrmError, esUuid } from '@/lib/services/hrm/tipos';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<{
      desde?: unknown;
      hasta?: unknown;
      vinculos?: unknown;
    }>(ctx, req, {
      route: 'hrm/asistencia/lista-nomina',
    });
    const vinculos = body?.vinculos === undefined || body?.vinculos === null ? null : body.vinculos;
    if (vinculos !== null && (!Array.isArray(vinculos) || vinculos.length > 500 || !vinculos.every(esUuid))) {
      throw new HrmError(400, 'vinculos_invalidos');
    }
    return NextResponse.json(await marcarPeriodoListo(ctx, String(body?.desde ?? ''), String(body?.hasta ?? ''), vinculos as string[] | null), {
      headers: SIN_CACHE,
    });
  } catch (err) {
    return responderError(err, 'asistencia:lista-nomina');
  }
});
