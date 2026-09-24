/**
 * POST /api/facturas-compra/[id]/confirmar — borrador → confirmada
 * (`fn_factura_compra_confirmar`): el devengo lo registra el disparador, la CxP
 * nace por el neto a pagar (D2, D4), y si se pide la mercancía entra por kardex
 * con su costo (F1.3) y se crea el borrador del documento soporte.
 *
 * Body `{ recepcionar?: boolean = true, generar_ds?: boolean = false }`.
 * Permisos: `finance.create`, y además `inventory.create` si recepciona.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { confirmarFacturaSchema } from '@/lib/services/compras/contrato';
import { confirmarFacturaCompra } from '@/lib/services/compras/facturasCompra.server';
import { SIN_CACHE, exigirDeLaOrg, exigirPermisos, idDeRuta, leerCuerpo, respuestaError } from '@/lib/services/compras/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'POST /api/facturas-compra/[id]/confirmar';

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    const cuerpo = await leerCuerpo(ctx, req, confirmarFacturaSchema, RUTA);
    const id = await idDeRuta(routeParams);
    await exigirPermisos(ctx, cuerpo.recepcionar ? ['finance.create', 'inventory.create'] : ['finance.create'], RUTA);
    await exigirDeLaOrg(ctx, 'invoice_purchase', id);
    const resultado = await confirmarFacturaCompra(ctx, id, cuerpo.recepcionar, cuerpo.generar_ds);
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
