/**
 * Ausencias de RR. HH. (ADR-002 §5 y §6).
 *
 * GET  ?desde&hasta → calendario que puede ver el actor. Las incapacidades del
 *      equipo salen como «Ausente por incapacidad»: nunca el tipo exacto ni el diagnóstico.
 * POST { tipo | tipo_id, desde, hasta, vinculo_id?, medio_dia_*, motivo?, salud?, documento_id?, prorroga_de? }
 *      → solicita (o, para RR. HH., registra) la ausencia; pasa por el motor de aprobaciones.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { ausenciasDelEquipo, solicitar } from '@/lib/services/hrm/ausenciasService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  try {
    const q = new URL(req.url).searchParams;
    return NextResponse.json({ ausencias: await ausenciasDelEquipo(ctx, q.get('desde') ?? '', q.get('hasta') ?? '') }, { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'ausencias:listar');
  }
});

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<unknown>(ctx, req, { route: 'hrm/ausencias' });
    return NextResponse.json(await solicitar(ctx, body), { status: 201, headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'ausencias:solicitar');
  }
});
