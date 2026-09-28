/**
 * POST /api/saldos-a-favor/[id]/anular — anula un anticipo que no se ha usado:
 * pago void (el efectivo sale del arqueo), saldo cancelado y contra-asiento, en
 * UNA RPC (`fn_saldo_favor_anular` → `fn_anular_pago`). Si el saldo ya se aplicó
 * o se devolvió → 409 `saldo_usado`; si no nació de un pago → `saldo_no_anulable`.
 *
 * Permiso `finance.void`, resuelto aquí y otra vez en la base. Organización de
 * la sesión; otra en el body o la query → 403.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { anularSaldoSchema } from '@/lib/finanzas/saldosAFavor/contrato';
import {
  anularSaldo,
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

  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/saldos-a-favor/[id]/anular' });
  const parsed = anularSaldoSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!parsed.success) return respuestaError('motivo_obligatorio');

  if (!(await hasOrgAdminOrPermission(ctx, 'finance.void'))) {
    console.warn('[saldos-a-favor/anular] permiso faltante → 403', { organizationId: ctx.organizationId, userId: ctx.userId });
    return respuestaError('sin_permiso');
  }

  try {
    const resultado = await anularSaldo(ctx, id, parsed.data.motivo);
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorSaldoFavorServidor) return respuestaError(err.codigo, err.detalle);
    throw err;
  }
});
