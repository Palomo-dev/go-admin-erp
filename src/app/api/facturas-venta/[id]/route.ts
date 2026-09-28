/**
 * /api/facturas-venta/[id]
 *
 * GET — detalle agregado de una factura de venta: cabecera, cliente, líneas,
 *       pagos (vivos y anulados), notas crédito, cartera, asientos, estado DIAN
 *       e historial. Permiso `finance.view`; la factura debe ser de la
 *       organización de la sesión (404 si no). No es la ruta pública que se
 *       retiró: exige sesión, organización y permiso.
 * PUT — edita un BORRADOR en una transacción (`fn_factura_venta_guardar`).
 *       Permiso `finance.create`; una emitida → 409 factura_no_borrador.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import { estadoHttpErrorFactura, guardarFacturaSchema } from '@/lib/finanzas/ventas/contratoFacturas';
import { detalleFactura, ErrorFacturaServidor, guardarFactura } from '@/lib/services/ventas/facturasVenta.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const noEncontrada = () =>
  NextResponse.json({ error: 'Factura no encontrada', codigo: 'factura_no_encontrada' }, { status: 404, headers: SIN_CACHE });

function respuestaError(err: unknown) {
  if (err instanceof ErrorFacturaServidor) {
    return NextResponse.json({ error: err.codigo, codigo: err.codigo }, { status: estadoHttpErrorFactura(err.codigo), headers: SIN_CACHE });
  }
  throw err;
}

export const GET = withOrg(async (ctx, req, routeParams) => {
  await readOrgBody(ctx, req, { route: 'GET /api/facturas-venta/[id]' });
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) return noEncontrada();
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.view'))) {
    return NextResponse.json({ error: 'Sin permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  try {
    return NextResponse.json(await detalleFactura(ctx, id), { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(err);
  }
});

export const PUT = withOrg(async (ctx, req, routeParams) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'PUT /api/facturas-venta/[id]' });
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) return noEncontrada();
  const candidato =
    typeof raw === 'object' && raw !== null
      ? Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)))
      : raw;
  const parsed = guardarFacturaSchema.safeParse(candidato);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', codigo: 'datos_invalidos' }, { status: 400, headers: SIN_CACHE });
  }
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.create'))) {
    console.warn('[facturas-venta/[id]] permiso faltante → 403', { organizationId: ctx.organizationId, userId: ctx.userId });
    return NextResponse.json({ error: 'Sin permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  try {
    return NextResponse.json({ resultado: await guardarFactura(ctx, id, parsed.data) }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(err);
  }
});
