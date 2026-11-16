/**
 * POST /api/hrm/turnos/copiar — { origen, destino, dias?, sede? }
 *
 * «Copiar semana anterior» y «Copiar a la semana siguiente»: copia los turnos
 * como borrador sin pisar lo que ya existe; lo omitido vuelve con su motivo.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { copiarSemana } from '@/lib/services/hrm/turnosService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<{ origen?: unknown; destino?: unknown; dias?: unknown; sede?: unknown }>(ctx, req, { route: 'hrm/turnos/copiar' });
    return NextResponse.json(await copiarSemana(ctx, { origen: body?.origen, destino: body?.destino, dias: body?.dias, sede: body?.sede }), {
      headers: SIN_CACHE,
    });
  } catch (err) {
    return responderError(err, 'turnos:copiar');
  }
});
