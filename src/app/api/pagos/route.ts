/**
 * POST /api/pagos — pago único: cobra (cliente) o paga (proveedor) una o varias
 * facturas o cuentas, con cuota opcional, efectivo con caja y sobrante a saldo
 * a favor. Contrato: `@/lib/finanzas/pagos/contrato` y el plan §6.
 *
 * - Organización de la sesión (`withOrg`); si el body o la query traen otra →
 *   403 `FOREIGN_ORGANIZATION` y registro (`readOrgBody`).
 * - Permiso resuelto aquí según dirección y origen (`finance.create`, o
 *   `pos.create` en la cartera del POS); la RPC lo vuelve a comprobar.
 * - La escritura es UNA RPC (`fn_registrar_pago`) con el cliente de la sesión:
 *   nunca se escriben saldos de factura ni de cartera.
 * - Errores con `codigo` estable (`pagos.errores.<codigo>`).
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import { estadoHttpErrorPago, permisoParaRegistrar, solicitudPagoSchema } from '@/lib/finanzas/pagos/contrato';
import { ErrorPagoServidor, registrarPago } from '@/lib/services/pagos/pagos.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export const POST = withOrg(async (ctx, req) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/pagos' });
  const candidato =
    typeof raw === 'object' && raw !== null
      ? Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)))
      : raw;
  const parsed = solicitudPagoSchema.safeParse(candidato);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos del pago inválidos', codigo: 'datos_invalidos', campos: parsed.error.issues.map((i) => i.path.join('.')) },
      { status: 400, headers: SIN_CACHE },
    );
  }
  const solicitud = parsed.data;

  const permiso = permisoParaRegistrar(solicitud.direccion, solicitud.origen);
  if (!(await hasOrgAdminOrPermission(ctx, permiso))) {
    console.warn('[pagos] permiso faltante → 403', { permiso, organizationId: ctx.organizationId, userId: ctx.userId, origen: solicitud.origen });
    return NextResponse.json({ error: 'Sin permiso para registrar pagos', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }

  try {
    const resultado = await registrarPago(ctx, solicitud);
    return NextResponse.json({ resultado }, { status: resultado.repetida ? 200 : 201, headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorPagoServidor) {
      return NextResponse.json(
        { error: err.codigo, codigo: err.codigo, detalle: err.detalle },
        { status: estadoHttpErrorPago(err.codigo), headers: SIN_CACHE },
      );
    }
    throw err;
  }
});
