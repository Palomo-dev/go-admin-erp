/**
 * GET /api/reportes/opciones-ventas — opciones de los filtros «Persona» y
 * «Método de pago» de los reportes de ventas: miembros activos con su rol y
 * métodos de pago activos de la organización de la SESIÓN.
 *
 * Basta con ser miembro activo (`withOrg`): son los mismos nombres que ya
 * muestran los reportes de ventas a quien los abre. Solo alimenta los
 * selectores; la RPC del reporte vuelve a exigir pertenencia y alcance.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { SIN_CACHE } from '@/lib/services/compras/rutas.server';
import { listarOpcionesVentas } from '@/lib/services/reportes/opcionesVentas.server';
import { respuestaErrorReportes } from '@/lib/services/reportes/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'GET /api/reportes/opciones-ventas';

export const GET = withOrg(async (ctx) => {
  try {
    const resultado = await listarOpcionesVentas(ctx);
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorReportes(RUTA, err);
  }
});
