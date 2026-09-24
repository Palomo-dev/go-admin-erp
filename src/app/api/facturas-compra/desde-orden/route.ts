/**
 * POST /api/facturas-compra/desde-orden — factura de compra de una orden de
 * compra recibida, con `po_id` y por la misma RPC que el formulario
 * (`fn_factura_compra_desde_oc` → `fn_fc_guardar_int` + `fn_fc_confirmar_int`,
 * regla 7). La mercancía ya entró con la recepción de la OC: no se vuelve a
 * meter al kardex. Idempotente: si la OC ya tiene factura, la devuelve.
 *
 * Permiso: `finance.create` o `inventory.create` (la recepción de la OC es de
 * inventario). Body `{ orden_uuid }`.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { desdeOrdenSchema } from '@/lib/services/compras/contrato';
import { facturaDesdeOrden } from '@/lib/services/compras/facturasCompra.server';
import { SIN_CACHE, exigirAlgunPermiso, leerCuerpo, respuestaError } from '@/lib/services/compras/rutas.server';
import { OrgContextError } from '@/lib/utils/orgContext';

export const dynamic = 'force-dynamic';
const RUTA = 'POST /api/facturas-compra/desde-orden';

export const POST = withOrg(async (ctx, req) => {
  try {
    const { orden_uuid } = await leerCuerpo(ctx, req, desdeOrdenSchema, RUTA);
    await exigirAlgunPermiso(ctx, ['finance.create', 'inventory.create'], RUTA);
    const { data } = await ctx.supabase
      .from('purchase_orders')
      .select('id')
      .eq('uuid', orden_uuid)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (!data) throw new OrgContextError('No encontrado', 404, 'no_encontrado');
    const resultado = await facturaDesdeOrden(ctx, orden_uuid);
    return NextResponse.json({ resultado }, { status: resultado.ya_existia ? 200 : 201, headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
