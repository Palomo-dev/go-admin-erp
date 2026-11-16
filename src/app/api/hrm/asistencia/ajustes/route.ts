/**
 * Ajuste manual de una marca, con motivo y aprobación (Figma 20.10.6, ADR-002 §2).
 *
 * GET  ?vinculo= → a quién le llega la aprobación (vista previa del diálogo).
 * POST { vinculo_id, fecha, tipo, hora, motivo, nota? } → nace pendiente; la marca
 *      se agrega con la hora pedida cuando se aprueba. Nada se corrige en silencio.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { aprobadorDeAjuste, solicitarAjuste } from '@/lib/services/hrm/asistenciaService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  try {
    const q = new URL(req.url).searchParams;
    return NextResponse.json(await aprobadorDeAjuste(ctx, q.get('vinculo') ?? ''), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'asistencia:ajuste-aprobador');
  }
});

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<unknown>(ctx, req, {
      route: 'hrm/asistencia/ajustes',
    });
    return NextResponse.json(await solicitarAjuste(ctx, body), {
      status: 201,
      headers: SIN_CACHE,
    });
  } catch (err) {
    return responderError(err, 'asistencia:ajuste');
  }
});
