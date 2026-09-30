/**
 * GET /api/reportes/destinatarios — miembros activos que pueden recibir un
 * envío programado, con su alcance de sucursal y si tienen `reports.export`.
 * El diálogo «Programar envío» los muestra así: «Solo Sucursal Norte».
 *
 * Permiso `reports.export`.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { SIN_CACHE, exigirPermisos } from '@/lib/services/compras/rutas.server';
import { listarDestinatarios } from '@/lib/services/reportes/programados/destinatarios.server';
import { respuestaErrorReportes } from '@/lib/services/reportes/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'GET /api/reportes/destinatarios';

export const GET = withOrg(async (ctx) => {
  try {
    await exigirPermisos(ctx, ['reports.export'], RUTA);
    const destinatarios = await listarDestinatarios(ctx);
    return NextResponse.json({ resultado: destinatarios }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorReportes(RUTA, err);
  }
});
