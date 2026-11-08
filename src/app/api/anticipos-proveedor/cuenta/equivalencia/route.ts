/**
 * POST /api/anticipos-proveedor/cuenta/equivalencia — ronda 2 del Contador, ítem
 * 10: la cuenta de anticipos es un auxiliar de detalle de ocho dígitos bajo
 * 133005; una cuenta de otro plan solo sirve con equivalencia APROBADA y su nota
 * (`fn_anticipo_cuenta_equivalencia_aprobar`, que exige cuenta de detalle del
 * activo). Permiso `finance.approve`, resuelto aquí y otra vez en la base.
 * Organización de la sesión; otra en el body → 403. Sin la migración → 501.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { equivalenciaCuentaSchema } from '@/lib/finanzas/anticiposProveedor/contrato';
import { sinClavesDeOrganizacion } from '@/lib/services/saldosAFavor/saldosAFavor.server';
import {
  aprobarEquivalenciaCuenta,
  ErrorAnticipoServidor,
  respuestaErrorAnticipo,
  SIN_CACHE,
} from '@/lib/services/anticiposProveedor/anticiposProveedor.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/anticipos-proveedor/cuenta/equivalencia' });
  const parsed = equivalenciaCuentaSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!parsed.success) {
    const campos = parsed.error.issues.map((i) => i.path.join('.'));
    if (campos.includes('nota')) return respuestaErrorAnticipo('nota_obligatoria');
    if (campos.includes('cuenta')) return respuestaErrorAnticipo('cuenta_no_valida');
    return respuestaErrorAnticipo('datos_invalidos', campos);
  }
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.approve'))) {
    console.warn('[anticipos-proveedor/cuenta/equivalencia] permiso faltante → 403', { organizationId: ctx.organizationId, userId: ctx.userId });
    return respuestaErrorAnticipo('sin_permiso');
  }
  try {
    const resultado = await aprobarEquivalenciaCuenta(ctx, parsed.data);
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorAnticipoServidor) return respuestaErrorAnticipo(err.codigo, err.detalle);
    throw err;
  }
});
