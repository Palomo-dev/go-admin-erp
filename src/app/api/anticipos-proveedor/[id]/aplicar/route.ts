/**
 * POST /api/anticipos-proveedor/[id]/aplicar — aplica el anticipo a una cuenta
 * por pagar del mismo proveedor (`fn_anticipo_proveedor_aplicar`): la cuenta y
 * su factura bajan por la regla única de saldo de compras; asiento D cuenta por
 * pagar / C anticipo. Si la factura ya retuvo sobre la base del anticipo, la base
 * responde 409 `retencion_duplicada`; con `correccion` (motivo y soporte) se
 * aplica `fn_anticipo_proveedor_aplicar_corrigiendo` con traza y pendiente.
 *
 * UNA RPC con el cliente de la sesión. Permiso `finance.create`, resuelto aquí y
 * otra vez en la base. Organización de la sesión; otra en el body o la query →
 * 403. Sin la migración 20261108120000 → 501 `pendiente_de_activar`.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { aplicarAnticipoSchema } from '@/lib/finanzas/anticiposProveedor/contrato';
import { sinClavesDeOrganizacion, UUID_RE } from '@/lib/services/saldosAFavor/saldosAFavor.server';
import {
  aplicarAnticipo,
  ErrorAnticipoServidor,
  respuestaErrorAnticipo,
  SIN_CACHE,
} from '@/lib/services/anticiposProveedor/anticiposProveedor.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) return respuestaErrorAnticipo('anticipo_no_encontrado');

  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/anticipos-proveedor/[id]/aplicar' });
  const parsed = aplicarAnticipoSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!parsed.success) {
    const campos = parsed.error.issues.map((i) => i.path.join('.'));
    // Ronda 2, ítem 5: la corrección de una retención repetida exige motivo y soporte.
    if (campos.includes('correccion.motivo')) return respuestaErrorAnticipo('motivo_obligatorio');
    if (campos.includes('correccion.soporte')) return respuestaErrorAnticipo('soporte_obligatorio');
    return respuestaErrorAnticipo('datos_invalidos', campos);
  }

  if (!(await hasOrgAdminOrPermission(ctx, 'finance.create'))) {
    console.warn('[anticipos-proveedor/aplicar] permiso faltante → 403', { organizationId: ctx.organizationId, userId: ctx.userId });
    return respuestaErrorAnticipo('sin_permiso');
  }

  try {
    const resultado = await aplicarAnticipo(ctx, id, parsed.data);
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorAnticipoServidor) return respuestaErrorAnticipo(err.codigo, err.detalle);
    throw err;
  }
});
