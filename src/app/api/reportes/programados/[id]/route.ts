/**
 * PATCH  /api/reportes/programados/[id] — `{ accion }`: `pausar`, `reanudar`
 *        (reactiva a los destinatarios pausados; el cron los vuelve a
 *        validar), `aprobar` (correos externos; solo administrador) o
 *        `editar` (mismas validaciones que al crear).
 * DELETE /api/reportes/programados/[id] — lo elimina.
 *
 * Cada quien sobre los suyos; un administrador, sobre los de la
 * organización. De otra persona u organización → 404. Permiso `reports.export`.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { SIN_CACHE, exigirPermisos, idDeRuta, leerCuerpo } from '@/lib/services/compras/rutas.server';
import { accionProgramadoSchema } from '@/lib/services/reportes/contrato';
import { actualizarProgramado, eliminarProgramado } from '@/lib/services/reportes/programados/programados.server';
import { respuestaErrorReportes } from '@/lib/services/reportes/rutas.server';

export const dynamic = 'force-dynamic';

export const PATCH = withOrg(async (ctx, req, routeParams) => {
  const RUTA = 'PATCH /api/reportes/programados/[id]';
  try {
    const accion = await leerCuerpo(ctx, req, accionProgramadoSchema, RUTA);
    const id = await idDeRuta(routeParams);
    await exigirPermisos(ctx, ['reports.export'], RUTA);
    const programado = await actualizarProgramado(ctx, id, accion);
    return NextResponse.json({ resultado: programado }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorReportes(RUTA, err);
  }
});

export const DELETE = withOrg(async (ctx, _req, routeParams) => {
  const RUTA = 'DELETE /api/reportes/programados/[id]';
  try {
    const id = await idDeRuta(routeParams);
    await exigirPermisos(ctx, ['reports.export'], RUTA);
    await eliminarProgramado(ctx, id);
    return NextResponse.json({ resultado: { id } }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorReportes(RUTA, err);
  }
});
