/**
 * /api/facturas-venta
 *
 * GET  — listado paginado, filtrado y ordenado en el servidor
 *        (`fn_facturas_venta_listado`) con los KPIs del periodo. Permiso
 *        `finance.view`. La query pasa por listas blancas (`consultaFacturasDesde`).
 * POST — guarda una factura NUEVA en borrador en una transacción
 *        (`fn_factura_venta_guardar`): venta ligada, líneas, impuestos y comisión.
 *        Permiso `finance.create`. Devuelve los faltantes de inventario como aviso.
 *
 * La organización sale de la sesión; una organización ajena en la query o en
 * el cuerpo → 403.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import { estadoHttpErrorFactura, guardarFacturaSchema } from '@/lib/finanzas/ventas/contratoFacturas';
import { consultaFacturasDesde } from '@/lib/finanzas/ventas/listadoFacturas';
import { ErrorFacturaServidor, guardarFactura, listadoFacturas } from '@/lib/services/ventas/facturasVenta.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

function respuestaError(err: unknown) {
  if (err instanceof ErrorFacturaServidor) {
    return NextResponse.json({ error: err.codigo, codigo: err.codigo }, { status: estadoHttpErrorFactura(err.codigo), headers: SIN_CACHE });
  }
  throw err;
}

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/facturas-venta' });
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.view'))) {
    return NextResponse.json({ error: 'Sin permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  try {
    const consulta = consultaFacturasDesde(new URL(req.url).searchParams);
    return NextResponse.json(await listadoFacturas(ctx, consulta), { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(err);
  }
});

export const POST = withOrg(async (ctx, req) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/facturas-venta' });
  const candidato =
    typeof raw === 'object' && raw !== null
      ? Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)))
      : raw;
  const parsed = guardarFacturaSchema.safeParse(candidato);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', codigo: 'datos_invalidos' }, { status: 400, headers: SIN_CACHE });
  }
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.create'))) {
    console.warn('[facturas-venta] permiso faltante → 403', { organizationId: ctx.organizationId, userId: ctx.userId });
    return NextResponse.json({ error: 'Sin permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  try {
    const resultado = await guardarFactura(ctx, null, parsed.data);
    return NextResponse.json({ resultado }, { status: 201, headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(err);
  }
});
