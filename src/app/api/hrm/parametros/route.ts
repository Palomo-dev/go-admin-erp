/**
 * GET /api/hrm/parametros?code=jornada_max_semanal&fecha=2026-07-15
 *     → detalle (valor, origen, estado, verificación y fuente)
 * GET /api/hrm/parametros?code=…&desde=2026-07-01&hasta=2026-07-31
 *     → tramos del período (un período puede necesitar dos valores)
 *
 * ADR-001 §4. La organización sale de la sesión; la base toma primero su valor
 * propio y luego el de la plataforma.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { detalleParametro, tramosParametro } from '@/lib/services/hrm/parametrosService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  try {
    const q = new URL(req.url).searchParams;
    const code = q.get('code') ?? '';
    const desde = q.get('desde');
    const hasta = q.get('hasta');
    if (desde || hasta) {
      return NextResponse.json({ tramos: await tramosParametro(ctx, code, desde ?? '', hasta ?? '') }, { headers: SIN_CACHE });
    }
    return NextResponse.json({ detalle: await detalleParametro(ctx, code, q.get('fecha') ?? '') }, { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'parametros');
  }
});
