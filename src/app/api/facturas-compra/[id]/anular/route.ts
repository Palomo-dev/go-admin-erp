/**
 * POST /api/facturas-compra/[id]/anular — anula una factura de compra con
 * motivo (`fn_void_purchase_invoice`): bloquea si tiene pagos completados,
 * revierte solo el kardex de la factura, deja la CxP anulada y registra el
 * contra-asiento espejo (ningún asiento se edita ni se borra).
 *
 * Body `{ motivo }` (3–500 caracteres). Permiso `finance.void`.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { anularFacturaSchema } from '@/lib/services/compras/contrato';
import { anularFacturaCompra } from '@/lib/services/compras/facturasCompra.server';
import { SIN_CACHE, exigirDeLaOrg, exigirPermisos, idDeRuta, leerCuerpo, respuestaError } from '@/lib/services/compras/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'POST /api/facturas-compra/[id]/anular';

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    const { motivo } = await leerCuerpo(ctx, req, anularFacturaSchema, RUTA);
    const id = await idDeRuta(routeParams);
    await exigirPermisos(ctx, ['finance.void'], RUTA);
    await exigirDeLaOrg(ctx, 'invoice_purchase', id);
    await anularFacturaCompra(ctx, id, motivo);
    return NextResponse.json({ ok: true }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
