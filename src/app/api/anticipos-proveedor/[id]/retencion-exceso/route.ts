/**
 * POST /api/anticipos-proveedor/[id]/retencion-exceso — rondas 3 y 4 del
 * Contador, causa (b) «retención excesiva o indebida»: el cálculo correcto (base
 * y tarifa) da el exceso, que se reintegra al proveedor (D retención por pagar /
 * C caja o banco) con la solicitud escrita y sus pruebas, el cálculo, el
 * certificado corregido y si la declaración requiere corrección; con reteICA, las
 * pruebas del procedimiento validado del municipio. El período lo fija la regla
 * del impuesto (`fn_anticipo_retencion_exceso_reintegrar`). El anticipo no cambia.
 *
 * Permiso `finance.void`, resuelto aquí y otra vez en la base. Organización de la
 * sesión; otra en el body o la query → 403. Sin la migración → 501.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { excesoRetencionSchema } from '@/lib/finanzas/anticiposProveedor/contrato';
import { sinClavesDeOrganizacion, UUID_RE } from '@/lib/services/saldosAFavor/saldosAFavor.server';
import {
  ErrorAnticipoServidor,
  reintegrarExcesoRetencion,
  respuestaErrorAnticipo,
  SIN_CACHE,
} from '@/lib/services/anticiposProveedor/anticiposProveedor.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) return respuestaErrorAnticipo('anticipo_no_encontrado');

  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/anticipos-proveedor/[id]/retencion-exceso' });
  const parsed = excesoRetencionSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!parsed.success) {
    const campos = parsed.error.issues.map((i) => i.path.join('.'));
    // Ronda 4: con reteICA, las pruebas del procedimiento municipal; el período ya no se elige (si llega, mal formado → 422).
    if (parsed.error.issues.some((i) => i.message === 'reteica_pruebas_incompletas')) return respuestaErrorAnticipo('reteica_pruebas_incompletas', campos);
    if (campos.some((c) => c.startsWith('soportes'))) return respuestaErrorAnticipo('soporte_procedimiento_obligatorio', campos);
    if (campos.some((c) => c === 'periodo_descuento' || c === 'requiere_correccion')) return respuestaErrorAnticipo('tratamiento_declaracion_obligatorio');
    return respuestaErrorAnticipo('datos_invalidos', campos);
  }

  if (!(await hasOrgAdminOrPermission(ctx, 'finance.void'))) {
    console.warn('[anticipos-proveedor/retencion-exceso] permiso faltante → 403', { organizationId: ctx.organizationId, userId: ctx.userId });
    return respuestaErrorAnticipo('sin_permiso');
  }

  try {
    const resultado = await reintegrarExcesoRetencion(ctx, id, parsed.data);
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorAnticipoServidor) return respuestaErrorAnticipo(err.codigo, err.detalle);
    throw err;
  }
});
