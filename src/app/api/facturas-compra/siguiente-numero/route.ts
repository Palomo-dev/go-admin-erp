/**
 * GET /api/facturas-compra/siguiente-numero — consecutivo interno sugerido
 * `COMP-AAAA-NNNN` (D11: el campo pide el número del proveedor; el consecutivo
 * se ofrece con un botón). El año es el de la zona de la organización.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { siguienteNumeroCompra } from '@/lib/services/compras/facturasCompra.server';
import { SIN_CACHE, exigirPermisos, respuestaError } from '@/lib/services/compras/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'GET /api/facturas-compra/siguiente-numero';

export const GET = withOrg(async (ctx, req) => {
  try {
    await readOrgBody(ctx, req, { route: RUTA });
    await exigirPermisos(ctx, ['finance.create'], RUTA);
    const numero = await siguienteNumeroCompra(ctx);
    return NextResponse.json({ numero }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
