/**
 * POST /api/anticipos-proveedor/[id]/anular — P7 del Contador: anula SOLO como
 * corrección de un desembolso registrado que NO ocurrió. El cuerpo declara
 * `declaracion: 'desembolso_no_ocurrio'`, motivo, soporte y la fecha del ajuste
 * documentado (por defecto hoy; nunca futura ni en periodo cerrado). Contra-asiento
 * en esa fecha, pago void y saldo cancelado (`fn_anticipo_proveedor_anular_por_error`).
 * Si el dinero salió, no se anula: se registra la devolución o se mantiene el
 * derecho. Con aplicaciones o devoluciones → 409 `anticipo_usado`.
 *
 * UNA RPC con el cliente de la sesión. Permiso `finance.void`, resuelto aquí y
 * otra vez en la base. Organización de la sesión; otra en el body o la query →
 * 403. Sin la migración → 501 `pendiente_de_activar`.
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
  if (!parsed.success) {
    const campos = parsed.error.issues.map((i) => i.path.join('.'));
    // Primero la declaración (P7): sin ella no se anula, falte lo que falte.
    if (campos.includes('declaracion')) return respuestaErrorAnticipo('anulacion_requiere_declaracion');
    if (campos.includes('motivo')) return respuestaErrorAnticipo('motivo_obligatorio');
    if (campos.includes('soporte')) return respuestaErrorAnticipo('soporte_obligatorio');
    return respuestaErrorAnticipo('datos_invalidos', campos);
  }

  if (!(await hasOrgAdminOrPermission(ctx, 'finance.void'))) {
    console.warn('[anticipos-proveedor/anular] permiso faltante → 403', { organizationId: ctx.organizationId, userId: ctx.userId });
    return respuestaErrorAnticipo('sin_permiso');
  }

  try {
    const resultado = await anularAnticipo(ctx, id, parsed.data);
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorAnticipoServidor) return respuestaErrorAnticipo(err.codigo, err.detalle);
    throw err;
  }
});
