/**
 * POST /api/facturas-venta/[id]/anular — anula una factura sin pagos con
 * motivo (`fn_factura_venta_anular`): reglas de L4 en la base, inventario de
 * vuelta por kardex, cartera 'cancelled' y contra-asiento por disparador.
 * Permiso `finance.void` aquí y en la base. Con pagos o con la factura
 * electrónica aceptada → 409 (se usa nota crédito).
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import { anulacionFacturaSchema, estadoHttpErrorFactura } from '@/lib/finanzas/ventas/contratoFacturas';
import { anularFactura, ErrorFacturaServidor } from '@/lib/services/ventas/facturasVenta.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = withOrg(async (ctx, req, routeParams) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/facturas-venta/[id]/anular' });
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Factura no encontrada', codigo: 'factura_no_encontrada' }, { status: 404, headers: SIN_CACHE });
  }
  const candidato =
    typeof raw === 'object' && raw !== null
      ? Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)))
      : raw;
  const parsed = anulacionFacturaSchema.safeParse(candidato);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Motivo obligatorio', codigo: 'motivo_obligatorio' }, { status: 400, headers: SIN_CACHE });
  }
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.void'))) {
    console.warn('[facturas-venta/anular] permiso faltante → 403', { organizationId: ctx.organizationId, userId: ctx.userId });
    return NextResponse.json({ error: 'Sin permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  try {
    const resultado = await anularFactura(ctx, id, parsed.data.motivo);
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorFacturaServidor) {
      return NextResponse.json({ error: err.codigo, codigo: err.codigo }, { status: estadoHttpErrorFactura(err.codigo), headers: SIN_CACHE });
    }
    throw err;
  }
});
