/**
 * /api/consignaciones
 *
 * GET — notas de consignación de la organización de la sesión, con sus líneas
 * y liquidaciones (Figma `2335:138595`). RLS por pertenencia. Sin la migración
 * 20261108121000: `{ pendiente: true }`. Permiso `finance.view`.
 *
 * POST — entrega mercancía en consignación (Figma `2335:139248`): nota, salida
 * del kardex como traslado y asiento de reclasificación, en UNA RPC
 * (`fn_consignacion_entregar`). Permiso `finance.create` aquí; la base exige
 * además inventario «trasladar». Organización de la sesión; otra → 403.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { entregarSchema } from '@/lib/finanzas/consignaciones/consignaciones';
import { sinClavesDeOrganizacion } from '@/lib/services/saldosAFavor/saldosAFavor.server';
import {
  entregarConsignacion,
  ErrorConsignacionServidor,
  listarConsignaciones,
  respuestaErrorConsignacion,
  SIN_CACHE,
} from '@/lib/services/consignaciones/consignaciones.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/consignaciones' });
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.view'))) return respuestaErrorConsignacion('sin_permiso');
  try {
    return NextResponse.json(await listarConsignaciones(ctx), { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorConsignacionServidor) return respuestaErrorConsignacion(err.codigo);
    throw err;
  }
});

export const POST = withOrg(async (ctx, req) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/consignaciones' });
  const parsed = entregarSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!parsed.success) return respuestaErrorConsignacion('datos_invalidos', parsed.error.issues.map((i) => i.path.join('.')));

  if (!(await hasOrgAdminOrPermission(ctx, 'finance.create'))) {
    console.warn('[consignaciones] permiso faltante → 403', { organizationId: ctx.organizationId, userId: ctx.userId });
    return respuestaErrorConsignacion('sin_permiso');
  }

  try {
    const resultado = await entregarConsignacion(ctx, parsed.data);
    return NextResponse.json({ resultado }, { status: resultado.repetida ? 200 : 201, headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorConsignacionServidor) return respuestaErrorConsignacion(err.codigo, err.detalle);
    throw err;
  }
});
