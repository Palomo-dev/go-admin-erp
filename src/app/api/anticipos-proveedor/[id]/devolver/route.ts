/**
 * POST /api/anticipos-proveedor/[id]/devolver — el proveedor regresa todo o
 * parte del anticipo; entra a la caja abierta o al banco
 * (`fn_anticipo_proveedor_devolver`, asiento D caja o banco [+ D retenciones
 * del procedimiento] / C anticipo). `procedimiento`: causa, soporte del hecho,
 * líneas afectadas, soportes y tratamiento en declaraciones (rondas 3 y 4); las
 * retenciones y el período de descuento salen de él y de la regla de cada
 * impuesto; null → pendiente contable.
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
  if (!parsed.success) {
    const campos = parsed.error.issues.map((i) => i.path.join('.'));
    // P7: la devolución real lleva soporte (consignación, recibo o transferencia) en `referencia`.
    if (campos.includes('referencia')) return respuestaErrorAnticipo('soporte_obligatorio');
    // Ronda 4: el procedimiento lleva causa, el soporte del HECHO (la solicitud del proveedor sola no lo prueba),
    // las líneas afectadas en la resolución o devolución parcial, y los soportes.
    const mensajes = parsed.error.issues.map((i) => i.message);
    const tipoHecho = (raw as { procedimiento?: { hecho?: { tipo?: unknown } } } | null)?.procedimiento?.hecho?.tipo;
    if (tipoHecho === 'solicitud_proveedor') return respuestaErrorAnticipo('solicitud_no_prueba_el_hecho');
    if (campos.some((c) => c === 'procedimiento.hecho' || c.startsWith('procedimiento.hecho.'))) return respuestaErrorAnticipo('soporte_del_hecho_obligatorio', campos);
    if (mensajes.includes('lineas_afectadas_obligatorias')) return respuestaErrorAnticipo('lineas_afectadas_obligatorias');
    if (campos.some((c) => c.startsWith('procedimiento.lineas'))) return respuestaErrorAnticipo('procedimiento_invalido', campos);
    if (campos.some((c) => c.startsWith('procedimiento.soportes'))) return respuestaErrorAnticipo('soporte_procedimiento_obligatorio', campos);
    if (campos.some((c) => c.startsWith('procedimiento'))) return respuestaErrorAnticipo('procedimiento_invalido', campos);
    return respuestaErrorAnticipo('datos_invalidos', campos);
  }

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
