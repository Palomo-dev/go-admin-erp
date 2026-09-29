/**
 * POST /api/facturas-compra/[id]/recepcionar — mete al inventario, por kardex y
 * UNA sola vez, la mercancía de una factura confirmada que aún no ha entrado
 * (`fn_factura_compra_recepcionar`). Reconoce las recepciones hechas por los
 * caminos viejos y las de la orden de compra. Devuelve las líneas procesadas
 * (costo y nuevo promedio) y las saltadas con su motivo. Body opcional
 * `{ lotes? }`: lote y vencimiento por línea (inventario B8); los seriales de
 * la factura se crean al recibir.
 *
 * Permisos: `finance.create` e `inventory.create`.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { recepcionarFacturaSchema } from '@/lib/services/compras/contrato';
import { recepcionarFacturaCompra } from '@/lib/services/compras/facturasCompra.server';
import { SIN_CACHE, exigirDeLaOrg, exigirPermisos, idDeRuta, leerCuerpo, respuestaError } from '@/lib/services/compras/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'POST /api/facturas-compra/[id]/recepcionar';

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    const cuerpo = await leerCuerpo(ctx, req, recepcionarFacturaSchema, RUTA);
    const id = await idDeRuta(routeParams);
    await exigirPermisos(ctx, ['finance.create', 'inventory.create'], RUTA);
    await exigirDeLaOrg(ctx, 'invoice_purchase', id);
    const resultado = await recepcionarFacturaCompra(ctx, id, cuerpo.lotes);
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
