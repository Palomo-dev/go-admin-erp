/**
 * POST /api/hrm/marcacion/manual — { vinculo_id, tipo, hora (ISO con zona), motivo }
 *
 * Marcación con hora elegida (corrección). Solo `hr.attendance.manage`, con motivo;
 * lo comprueba `fn_hr_marcacion_manual` en la base (ADR-002 §2).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { marcacionManual } from '@/lib/services/hrm/marcacionService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<{ vinculo_id?: unknown; tipo?: unknown; hora?: unknown; motivo?: unknown }>(ctx, req, {
      route: 'hrm/marcacion/manual',
    });
    return NextResponse.json(
      await marcacionManual(ctx, { vinculoId: body?.vinculo_id, tipo: body?.tipo, hora: body?.hora, motivo: body?.motivo }),
      { headers: SIN_CACHE }
    );
  } catch (err) {
    return responderError(err, 'marcacion:manual');
  }
});
