/**
 * POST /api/saldos-a-favor/[id]/devolver — devuelve en dinero todo o parte de
 * un saldo a favor: pago negativo (sale del arqueo si es efectivo, con caja
 * abierta), asiento Dr 2805 / Cr cuenta de dinero y saldo rebajado, en UNA RPC
 * (`fn_saldo_favor_devolver`) con idempotencia.
 *
 * Permiso `finance.void`, resuelto aquí y otra vez en la base. Organización de
 * la sesión; otra en el body o la query → 403.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { devolverSaldoSchema } from '@/lib/finanzas/saldosAFavor/contrato';
import {
  devolverSaldo,
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

  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/saldos-a-favor/[id]/devolver' });
  const parsed = devolverSaldoSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!parsed.success) return respuestaError('datos_invalidos', parsed.error.issues.map((i) => i.path.join('.')));

  if (!(await hasOrgAdminOrPermission(ctx, 'finance.void'))) {
    console.warn('[saldos-a-favor/devolver] permiso faltante → 403', { organizationId: ctx.organizationId, userId: ctx.userId });
    return respuestaError('sin_permiso');
  }

  try {
    const resultado = await devolverSaldo(ctx, id, parsed.data);
    return NextResponse.json({ resultado }, { status: resultado.repetida ? 200 : 201, headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorSaldoFavorServidor) return respuestaError(err.codigo, err.detalle);
    throw err;
  }
});
