/**
 * POST /api/saldos-a-favor/[id]/aplicar — aplica un saldo a favor a una factura
 * de venta del mismo cliente. Una RPC (`fn_apply_customer_credit`) con el
 * cliente de la sesión: valida cliente, organización, sucursal, estado y
 * vencimiento del saldo, idempotencia y asiento; el saldo de la factura lo pone
 * la regla única.
 *
 * - Organización de la sesión (`withOrg`); otra en el body o la query → 403.
 * - Permiso `finance.create`, resuelto aquí y otra vez en la base.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { aplicarSaldoSchema } from '@/lib/finanzas/saldosAFavor/contrato';
import {
  aplicarSaldo,
  ErrorSaldoFavorServidor,
  respuestaError,
  SIN_CACHE,
  sinClavesDeOrganizacion,
  UUID_RE,
} from '@/lib/services/saldosAFavor/saldosAFavor.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) return respuestaError('saldo_no_encontrado');

  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/saldos-a-favor/[id]/aplicar' });
  const parsed = aplicarSaldoSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!parsed.success) return respuestaError('datos_invalidos', parsed.error.issues.map((i) => i.path.join('.')));

  if (!(await hasOrgAdminOrPermission(ctx, 'finance.create'))) {
    console.warn('[saldos-a-favor/aplicar] permiso faltante → 403', { organizationId: ctx.organizationId, userId: ctx.userId });
    return respuestaError('sin_permiso');
  }

  try {
    const resultado = await aplicarSaldo(ctx, id, parsed.data);
    return NextResponse.json({ resultado }, { status: resultado.repetida ? 200 : 201, headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorSaldoFavorServidor) return respuestaError(err.codigo, err.detalle);
    throw err;
  }
});
