/**
 * POST /api/hrm/jornada/lista-nomina — { desde, hasta, vinculos? }
 *
 * Pasa a «lista para nómina» los días clasificados con la última versión de sus
 * marcaciones y sin novedades pendientes; devuelve los que no pudo con su motivo
 * (ADR-002 §4). Solo `hr.attendance.manage`.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { marcarListaParaNomina } from '@/lib/services/hrm/jornadaService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<{ desde?: unknown; hasta?: unknown; vinculos?: unknown }>(ctx, req, { route: 'hrm/jornada/lista-nomina' });
    return NextResponse.json(
      await marcarListaParaNomina(ctx, String(body?.desde ?? ''), String(body?.hasta ?? ''), Array.isArray(body?.vinculos) ? (body.vinculos as string[]) : null),
      { headers: SIN_CACHE }
    );
  } catch (err) {
    return responderError(err, 'jornada:lista-nomina');
  }
});
