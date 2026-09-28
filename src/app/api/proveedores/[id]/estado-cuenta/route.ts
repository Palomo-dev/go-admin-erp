/**
 * GET /api/proveedores/[id]/estado-cuenta?desde=YYYY-MM-DD&hasta=YYYY-MM-DD —
 * estado de cuenta de un proveedor (`fn_estado_cuenta_proveedor`): saldo
 * inicial, facturas confirmadas por su neto, pagos de los dos orígenes, saldo
 * corrido, vencido y por vencer, con los días de la organización. Reemplaza el
 * `.txt` de `generarEstadoCuenta`.
 *
 * Permiso `finance.view`. El PDF lo genera el motor de documentos cuando tenga
 * la plantilla de proveedor (pedido a esa sesión); aquí se entregan los datos.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { estadoCuentaQuerySchema } from '@/lib/services/compras/contrato';
import { estadoCuentaProveedor } from '@/lib/services/compras/facturasCompra.server';
import { ErrorDatos, SIN_CACHE, exigirDeLaOrg, exigirPermisos, respuestaError } from '@/lib/services/compras/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'GET /api/proveedores/[id]/estado-cuenta';

export const GET = withOrg(async (ctx, req, routeParams) => {
  try {
    await readOrgBody(ctx, req, { route: RUTA });
    const p = routeParams ? await routeParams.params : {};
    const crudo = Array.isArray(p.id) ? p.id[0] : p.id;
    const proveedorId = Number.parseInt(String(crudo ?? ''), 10);
    if (!Number.isInteger(proveedorId) || proveedorId <= 0 || String(proveedorId) !== String(crudo)) {
      throw new OrgContextError('No encontrado', 404, 'no_encontrado');
    }
    const url = new URL(req.url);
    const q = estadoCuentaQuerySchema.safeParse({
      desde: url.searchParams.get('desde') || null,
      hasta: url.searchParams.get('hasta') || null,
    });
    if (!q.success) throw new ErrorDatos(q.error.issues.map((i) => i.path.join('.')));
    await exigirPermisos(ctx, ['finance.view'], RUTA);
    await exigirDeLaOrg(ctx, 'suppliers', proveedorId);
    const resultado = await estadoCuentaProveedor(ctx, proveedorId, q.data.desde ?? null, q.data.hasta ?? null);
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
