/**
 * /api/saldos-a-favor
 *
 * GET ?sucursal=<id> — saldos a favor de la organización de la sesión
 * (`fn_list_customer_credits`): finance.view, solo sucursales con acceso y
 * estado vivo ('expired' si venció y queda saldo).
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
  listarSaldos,
  respuestaError,
  SIN_CACHE,
  sinClavesDeOrganizacion,
} from '@/lib/services/saldosAFavor/saldosAFavor.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/saldos-a-favor' });
  const crudo = new URL(req.url).searchParams.get('sucursal');
  const sucursal = crudo && /^\d+$/.test(crudo) ? Number(crudo) : null;
  if (crudo && sucursal === null) return respuestaError('datos_invalidos');

  if (!(await hasOrgAdminOrPermission(ctx, 'finance.view'))) return respuestaError('sin_permiso');

  try {
    return NextResponse.json({ saldos: await listarSaldos(ctx, sucursal) }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorSaldoFavorServidor) return respuestaError(err.codigo);
    throw err;
  }
});

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
