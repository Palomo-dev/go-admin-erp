/**
 * POST /api/anticipos-proveedor/[id]/anular — anula un anticipo sin usar: pago
 * void, contra-asiento y saldo cancelado (`fn_anticipo_proveedor_anular`). Con
 * aplicaciones o devoluciones → 409 `anticipo_usado`.
 *
 * UNA RPC con el cliente de la sesión. Permiso `finance.void`, resuelto aquí y
 * otra vez en la base. Organización de la sesión; otra en el body o la query →
 * 403. Sin la migración 20261108120000 → 501 `pendiente_de_activar`.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { anularAnticipoSchema } from '@/lib/finanzas/anticiposProveedor/contrato';
import { sinClavesDeOrganizacion, UUID_RE } from '@/lib/services/saldosAFavor/saldosAFavor.server';
import {
  anularAnticipo,
  ErrorAnticipoServidor,
  respuestaErrorAnticipo,
  SIN_CACHE,
} from '@/lib/services/anticiposProveedor/anticiposProveedor.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) return respuestaErrorAnticipo('anticipo_no_encontrado');

  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/anticipos-proveedor/[id]/anular' });
  const parsed = anularAnticipoSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!parsed.success) return respuestaErrorAnticipo('motivo_obligatorio');

  if (!(await hasOrgAdminOrPermission(ctx, 'finance.void'))) {
    console.warn('[anticipos-proveedor/anular] permiso faltante → 403', { organizationId: ctx.organizationId, userId: ctx.userId });
    return respuestaErrorAnticipo('sin_permiso');
  }

  try {
    const resultado = await anularAnticipo(ctx, id, parsed.data.motivo);
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorAnticipoServidor) return respuestaErrorAnticipo(err.codigo, err.detalle);
    throw err;
  }
});
