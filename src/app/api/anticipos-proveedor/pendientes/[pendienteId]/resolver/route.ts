/**
 * POST /api/anticipos-proveedor/pendientes/[pendienteId]/resolver — ronda 2 del
 * Contador, ítem 9: un pendiente contable de anticipos (retención por evaluar,
 * retención repetida, retenciones de una devolución por definir, anulación con
 * la caja cerrada) solo se cierra con la resolución y su soporte
 * (`fn_anticipo_pendiente_resolver`). No se reabre ni se borra.
 *
 * Permiso `finance.approve`, resuelto aquí y otra vez en la base. Organización de
 * la sesión; otra en el body o la query → 403. Sin la migración → 501.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { resolverPendienteSchema } from '@/lib/finanzas/anticiposProveedor/contrato';
import { sinClavesDeOrganizacion, UUID_RE } from '@/lib/services/saldosAFavor/saldosAFavor.server';
import {
  ErrorAnticipoServidor,
  resolverPendiente,
  respuestaErrorAnticipo,
  SIN_CACHE,
} from '@/lib/services/anticiposProveedor/anticiposProveedor.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.pendienteId === 'string' ? params.pendienteId : '';
  if (!UUID_RE.test(id)) return respuestaErrorAnticipo('pendiente_no_encontrado');

  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/anticipos-proveedor/pendientes/[pendienteId]/resolver' });
  const parsed = resolverPendienteSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!parsed.success) {
    const campos = parsed.error.issues.map((i) => i.path.join('.'));
    if (campos.includes('resolucion')) return respuestaErrorAnticipo('resolucion_obligatoria');
    if (campos.includes('soporte')) return respuestaErrorAnticipo('soporte_obligatorio');
    return respuestaErrorAnticipo('datos_invalidos', campos);
  }

  if (!(await hasOrgAdminOrPermission(ctx, 'finance.approve'))) {
    console.warn('[anticipos-proveedor/pendientes/resolver] permiso faltante → 403', { organizationId: ctx.organizationId, userId: ctx.userId });
    return respuestaErrorAnticipo('sin_permiso');
  }

  try {
    const resultado = await resolverPendiente(ctx, id, parsed.data);
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorAnticipoServidor) return respuestaErrorAnticipo(err.codigo, err.detalle);
    throw err;
  }
});
