/**
 * GET /api/pos/cajas/[id]/resumen — todo lo que pinta el detalle de una caja,
 * «Mi caja» y el diálogo de cierre, en una respuesta: sesión, esperado
 * (`pos_caja_esperado`), movimientos, arqueos, ventas del turno y permisos.
 * `[id]` es el número de la caja o su uuid (la URL del detalle usa el uuid).
 *
 * - La organización sale de la sesión (`withOrg`); la lectura va con el
 *   cliente de la sesión, así que la RLS (pertenencia y sucursal) aplica.
 * - Cierre ciego (D8 de docs/implementacion/CAJAS-VENTAS-PLAN.md): si la
 *   organización lo usa y la persona no tiene `pos.cajas.ver_esperado`, la
 *   respuesta NO trae el esperado, el desglose, el final contado ni las
 *   diferencias (no basta con ocultarlos en la pantalla).
 * - `?ventas=0` omite las ventas del turno (el diálogo de cierre no las pinta).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { ErrorResumenCaja, resumenCaja } from '@/lib/pos/cajas/resumenServidor';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req, routeParams) => {
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  const conVentas = new URL(req.url).searchParams.get('ventas') !== '0';
  try {
    const resumen = await resumenCaja(ctx, id, { ventas: conVentas });
    return NextResponse.json(resumen, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    if (err instanceof ErrorResumenCaja) {
      if (err.status >= 500) {
        console.error('[pos/cajas/resumen] lectura', { id, organizationId: ctx.organizationId, message: err.message });
      }
      return NextResponse.json({ error: err.status >= 500 ? 'No se pudo leer la caja' : err.message, codigo: err.codigo }, { status: err.status });
    }
    throw err;
  }
});
