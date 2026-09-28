/**
 * POST /api/pagos/[id]/anular — anula un pago con motivo: la RPC lo pasa a
 * `void` (los disparadores devuelven el saldo a la factura y a la cartera),
 * revierte su asiento con un contra-asiento y devuelve la cuota. Nunca borra.
 *
 * Permiso: `finance.void` (o `pos.void` si se anula desde la cartera del POS),
 * resuelto aquí y otra vez en la base. Pago de otra organización → 404.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import { assertRecordOfOrg } from '@/lib/security/orgGuards';
import { anulacionPagoSchema, estadoHttpErrorPago, permisoParaAnular } from '@/lib/finanzas/pagos/contrato';
import { anularPago, ErrorPagoServidor } from '@/lib/services/pagos/pagos.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = withOrg(async (ctx, req, routeParams) => {
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Pago no encontrado', codigo: 'pago_no_encontrado' }, { status: 404, headers: SIN_CACHE });
  }

  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/pagos/[id]/anular' });
  const candidato =
    typeof raw === 'object' && raw !== null
      ? Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)))
      : raw;
  const parsed = anulacionPagoSchema.safeParse(candidato);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Motivo obligatorio', codigo: 'motivo_obligatorio' }, { status: 400, headers: SIN_CACHE });
  }

  await assertRecordOfOrg(ctx, 'payments', id, 'Pago no encontrado');

  const permiso = permisoParaAnular(parsed.data.origen);
  if (!(await hasOrgAdminOrPermission(ctx, permiso))) {
    console.warn('[pagos/anular] permiso faltante → 403', { permiso, organizationId: ctx.organizationId, userId: ctx.userId });
    return NextResponse.json({ error: 'Sin permiso para anular pagos', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }

  try {
    const resultado = await anularPago(ctx, id, parsed.data.motivo);
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorPagoServidor) {
      return NextResponse.json({ error: err.codigo, codigo: err.codigo }, { status: estadoHttpErrorPago(err.codigo), headers: SIN_CACHE });
    }
    throw err;
  }
});
