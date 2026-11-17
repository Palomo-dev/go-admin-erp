/**
 * Marcación › Métodos por sede (Figma 20.27).
 * GET ?sede=  → métodos y reglas de la sede, puntos y conteos (`hr.attendance.view`).
 * PUT ?sede=  { metodos } → guarda celular, QR y etiqueta (`hr.attendance.manage`).
 * La base comprueba que la sede sea de la organización de la sesión.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { sedeDeQuery } from '@/lib/services/hrm/asistenciaService.server';
import { guardarMetodosSede, metodosSede } from '@/lib/services/hrm/marcacionGestionService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  try {
    const sede = sedeDeQuery(new URL(req.url).searchParams.get('sede'));
    return NextResponse.json(await metodosSede(ctx, sede), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'marcacion:metodos');
  }
});

export const PUT = withOrg(async (ctx, req) => {
  try {
    const sede = sedeDeQuery(new URL(req.url).searchParams.get('sede'));
    const body = await readOrgBody<{ metodos?: unknown }>(ctx, req, { route: 'hrm/marcacion/metodos' });
    return NextResponse.json(await guardarMetodosSede(ctx, sede, body?.metodos), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'marcacion:metodos-guardar');
  }
});
