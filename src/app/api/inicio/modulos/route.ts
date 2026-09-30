/**
 * GET /api/inicio/modulos?periodo=…&sucursal= — filas de «Módulos» del inicio
 * con su resumen (Figma `FilaModulo` 445:195568 y «Inicio — Dashboard por
 * módulo» 642:25956, aprobados por el dueño el 2026-09-30).
 *
 * - Organización de la sesión (`withOrg`), panel completo o 403.
 * - Solo módulos que el menú le muestra a la persona (`filtrarNavegacion` en
 *   el servidor) y que la base resume para ella (activos + permiso de
 *   lectura). Nunca una lista cableada.
 * - Orden y ocultos de `user_dashboard_preferences`; los ocultos no se
 *   consultan.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { leerPreferencias, modulosDelInicio, rangoDelPeriodo } from '@/lib/dashboard/inicio.server';
import { manejarError, pedidoPanel, SIN_CACHE } from '@/lib/dashboard/rutasInicio.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  const p = await pedidoPanel(ctx, req);
  if (p instanceof NextResponse) return p;
  try {
    const [rango, prefs] = await Promise.all([rangoDelPeriodo(ctx, p.pedido, p.sucursal), leerPreferencias(ctx)]);
    const datos = await modulosDelInicio(ctx, rango, p.sucursal, prefs);
    return NextResponse.json(datos, { headers: SIN_CACHE });
  } catch (err) {
    return manejarError('modulos', ctx, err);
  }
});
