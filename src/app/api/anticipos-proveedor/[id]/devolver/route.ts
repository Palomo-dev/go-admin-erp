/**
 * POST /api/anticipos-proveedor/[id]/devolver — el proveedor regresa todo o
 * parte del anticipo; entra a la caja abierta o al banco
 * (`fn_anticipo_proveedor_devolver`, asiento D caja o banco / C anticipo).
 *
 * UNA RPC con el cliente de la sesión. Permiso `finance.void` (el mismo de
 * devolver un saldo a favor), resuelto aquí y otra vez en la base. Organización
 * de la sesión; otra en el body o la query → 403. Sin la migración → 501.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { devolverAnticipoSchema } from '@/lib/finanzas/anticiposProveedor/contrato';
import { sinClavesDeOrganizacion, UUID_RE } from '@/lib/services/saldosAFavor/saldosAFavor.server';
import {
  devolverAnticipo,
  ErrorAnticipoServidor,
  respuestaErrorAnticipo,
  SIN_CACHE,
} from '@/lib/services/anticiposProveedor/anticiposProveedor.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) return respuestaErrorAnticipo('anticipo_no_encontrado');

  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/anticipos-proveedor/[id]/devolver' });
  const parsed = devolverAnticipoSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!parsed.success) return respuestaErrorAnticipo('datos_invalidos', parsed.error.issues.map((i) => i.path.join('.')));

  if (!(await hasOrgAdminOrPermission(ctx, 'finance.void'))) {
    console.warn('[anticipos-proveedor/devolver] permiso faltante → 403', { organizationId: ctx.organizationId, userId: ctx.userId });
    return respuestaErrorAnticipo('sin_permiso');
  }

  try {
    const resultado = await devolverAnticipo(ctx, id, parsed.data);
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorAnticipoServidor) return respuestaErrorAnticipo(err.codigo, err.detalle);
    throw err;
  }
});
