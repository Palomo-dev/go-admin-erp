/**
 * POST /api/anticipos-proveedor/retenciones — vista previa (P1 del Contador) de
 * renta, reteIVA y reteICA de un anticipo según su naturaleza, la operación y
 * las calidades de las partes (`fn_anticipo_proveedor_evaluar_retenciones`, solo
 * lectura). Lo que falte (regla, perfil, datos del proveedor, norma municipal de
 * ICA) vuelve como «pendiente», nunca como 0. Al registrar, la base vuelve a
 * evaluar: esta respuesta no se reenvía como valor.
 *
 * Es POST porque lleva un cuerpo validado, pero no escribe. Permiso
 * `finance.create` (solo quien puede registrar el anticipo la necesita).
 * Organización de la sesión; otra en el body o la query → 403.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { evaluarRetencionesSchema } from '@/lib/finanzas/anticiposProveedor/contrato';
import { sinClavesDeOrganizacion } from '@/lib/services/saldosAFavor/saldosAFavor.server';
import {
  ErrorAnticipoServidor,
  evaluarRetenciones,
  respuestaErrorAnticipo,
  SIN_CACHE,
} from '@/lib/services/anticiposProveedor/anticiposProveedor.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/anticipos-proveedor/retenciones' });
  const parsed = evaluarRetencionesSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!parsed.success) {
    const campos = parsed.error.issues.map((i) => i.path.join('.'));
    if (campos.includes('naturaleza')) return respuestaErrorAnticipo('naturaleza_obligatoria');
    if (campos.includes('tarifa_iva')) return respuestaErrorAnticipo('tarifa_iva_obligatoria');
    return respuestaErrorAnticipo('datos_invalidos', campos);
  }

  if (!(await hasOrgAdminOrPermission(ctx, 'finance.create'))) return respuestaErrorAnticipo('sin_permiso');

  try {
    return NextResponse.json({ resultado: await evaluarRetenciones(ctx, parsed.data) }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorAnticipoServidor) return respuestaErrorAnticipo(err.codigo, err.detalle);
    throw err;
  }
});
