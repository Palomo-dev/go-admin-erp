/**
 * GET  /api/reportes/programados — envíos programados: los propios, o los de
 *      toda la organización para un administrador.
 * POST /api/reportes/programados — crea uno. El reporte y la sucursal se
 *      validan contra el plan y el alcance de quien programa; los correos
 *      externos quedan pendientes de aprobación salvo que programe un
 *      administrador.
 *
 * Permiso `reports.export`.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { SIN_CACHE, exigirPermisos, leerCuerpo } from '@/lib/services/compras/rutas.server';
import { programadoSchema } from '@/lib/services/reportes/contrato';
import { crearProgramado, listarProgramados } from '@/lib/services/reportes/programados/programados.server';
import { respuestaErrorReportes } from '@/lib/services/reportes/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  const RUTA = 'GET /api/reportes/programados';
  try {
    await exigirPermisos(ctx, ['reports.export'], RUTA);
    return NextResponse.json({ resultado: await listarProgramados(ctx) }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorReportes(RUTA, err);
  }
});

export const POST = withOrg(async (ctx, req) => {
  const RUTA = 'POST /api/reportes/programados';
  try {
    const datos = await leerCuerpo(ctx, req, programadoSchema, RUTA);
    await exigirPermisos(ctx, ['reports.export'], RUTA);
    const programado = await crearProgramado(ctx, datos);
    return NextResponse.json({ resultado: programado }, { status: 201, headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorReportes(RUTA, err);
  }
});
