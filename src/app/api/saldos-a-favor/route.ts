/**
 * /api/saldos-a-favor
 *
 * POST — anticipo a mano: el dinero entra como un pago real (recibo, payments
 * y caja abierta si es efectivo) y queda como saldo a favor, en UNA RPC
 * (`fn_saldo_favor_crear`) con el cliente de la sesión. Permiso `finance.create`.
 *
 * La organización es la de la sesión (`withOrg`); otra en el body o la query → 403.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { crearSaldoSchema } from '@/lib/finanzas/saldosAFavor/contrato';
import {
  crearSaldo,
  ErrorSaldoFavorServidor,
  respuestaError,
  SIN_CACHE,
  sinClavesDeOrganizacion,
} from '@/lib/services/saldosAFavor/saldosAFavor.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/saldos-a-favor' });
  const parsed = crearSaldoSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!parsed.success) return respuestaError('datos_invalidos', parsed.error.issues.map((i) => i.path.join('.')));

  if (!(await hasOrgAdminOrPermission(ctx, 'finance.create'))) {
    console.warn('[saldos-a-favor] permiso faltante → 403', { organizationId: ctx.organizationId, userId: ctx.userId });
    return respuestaError('sin_permiso');
  }

  try {
    const resultado = await crearSaldo(ctx, parsed.data);
    return NextResponse.json({ resultado }, { status: resultado.repetida ? 200 : 201, headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorSaldoFavorServidor) return respuestaError(err.codigo, err.detalle);
    throw err;
  }
});
