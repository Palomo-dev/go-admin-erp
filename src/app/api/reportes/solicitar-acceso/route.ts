/**
 * POST /api/reportes/solicitar-acceso — el gerente de una sede pide acceso a
 * más sucursales: se avisa a los administradores de la organización de la
 * sesión (`solicitudAcceso.server.ts`). Cualquier miembro activo puede pedirlo.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { SIN_CACHE, leerCuerpo } from '@/lib/services/compras/rutas.server';
import { solicitarAccesoReportes } from '@/lib/services/reportes/solicitudAcceso.server';
import { respuestaErrorReportes } from '@/lib/services/reportes/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'POST /api/reportes/solicitar-acceso';

const solicitudSchema = z.object({
  reportId: z.string().regex(/^[\w-]{1,80}$/).nullish(),
  sucursalId: z.number().int().positive().nullish(),
});

export const POST = withOrg(async (ctx, req) => {
  try {
    const datos = await leerCuerpo(ctx, req, solicitudSchema, RUTA);
    const resultado = await solicitarAccesoReportes(ctx, { reportId: datos.reportId ?? null, sucursalId: datos.sucursalId ?? null });
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorReportes(RUTA, err);
  }
});
