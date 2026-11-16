/**
 * Ausencias de RR. HH. (ADR-002 §5 y §6).
 *
 * GET  ?desde&hasta → calendario que puede ver el actor. Las incapacidades del
 *      equipo salen como «ausencia justificada» (jefe) o «incapacidad» (RR. HH. sin salud):
 *      nunca el diagnóstico (decisión 2).
 * GET  ?seccion=vacaciones|incapacidades|permisos|todas&desde&hasta[&propias=1] → filas de la
 *      pestaña de Ausencias (Figma 20.13 y 20.14) con aprobación, saldo, cruces y tramos; festivos,
 *      tipos y permisos del actor. 403 si no es RR. HH. ni jefe (salvo `propias`).
 * POST { tipo | tipo_id, desde, hasta, vinculo_id?, medio_dia_*, motivo?, salud?, documento_id?, prorroga_de? }
 *      → solicita (o, para RR. HH., registra) la ausencia; pasa por el motor de aprobaciones.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { ausenciasDelEquipo, listar, solicitar } from '@/lib/services/hrm/ausenciasService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  try {
    const q = new URL(req.url).searchParams;
    const seccion = q.get('seccion');
    if (seccion) {
      return NextResponse.json(
        await listar(ctx, { seccion, desde: q.get('desde') ?? '', hasta: q.get('hasta') ?? '', propias: q.get('propias') === '1' }),
        { headers: SIN_CACHE }
      );
    }
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
