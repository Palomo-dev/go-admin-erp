/**
 * POST /api/facturas-compra — guarda un borrador de factura de compra (nuevo o
 * edición de un borrador) en UNA transacción: `fn_factura_compra_guardar`.
 *
 * - Organización de la sesión (`withOrg`); una ajena en el body o la query → 403.
 * - Permiso `finance.create` resuelto aquí; la RPC lo vuelve a comprobar, junto
 *   con la sucursal (`app_branch_access`) y la pertenencia de proveedor,
 *   productos y orden de compra.
 * - `total_line` bruto, retenciones, seriales y comisión los escribe la base.
 *   La CxP NO nace aquí: nace al confirmar (D2).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { guardarFacturaSchema } from '@/lib/services/compras/contrato';
import { guardarFacturaCompra } from '@/lib/services/compras/facturasCompra.server';
import { SIN_CACHE, exigirDeLaOrg, exigirPermisos, leerCuerpo, respuestaError } from '@/lib/services/compras/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'POST /api/facturas-compra';

export const POST = withOrg(async (ctx, req) => {
  try {
    const datos = await leerCuerpo(ctx, req, guardarFacturaSchema, RUTA);
    await exigirPermisos(ctx, ['finance.create'], RUTA);
    if (datos.id) await exigirDeLaOrg(ctx, 'invoice_purchase', datos.id);
    const resultado = await guardarFacturaCompra(ctx, datos);
    return NextResponse.json({ resultado }, { status: datos.id ? 200 : 201, headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
