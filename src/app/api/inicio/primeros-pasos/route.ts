/**
 * GET /api/inicio/primeros-pasos — «Primeros pasos» y «Todavía no hay
 * movimientos» del inicio (Figma 445:137617 y 448:205616, organización
 * nueva): los siete pasos con su estado, si la organización tuvo alguna vez
 * movimientos y a qué páginas del menú de la persona llevan las acciones.
 *
 * Organización de la sesión (`withOrg`) y panel completo, como el resto de
 * cifras del inicio; conteos con el cliente de la sesión (RLS).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { veePanelCompleto } from '@/lib/dashboard/accesoPanel';
import { primerosPasos } from '@/lib/dashboard/inicio.server';
import { manejarError, respuestaError, SIN_CACHE } from '@/lib/dashboard/rutasInicio.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  if (!veePanelCompleto({ roleId: ctx.roleId, isSuperAdmin: ctx.isSuperAdmin })) {
    return respuestaError(403, 'sin_permiso', 'Sin permiso para ver el resumen del inicio');
  }
  try {
    return NextResponse.json(await primerosPasos(ctx), { headers: SIN_CACHE });
  } catch (err) {
    return manejarError('primeros-pasos', ctx, err);
  }
});
