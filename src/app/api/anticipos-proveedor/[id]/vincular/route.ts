/**
 * /api/anticipos-proveedor/[id]/vincular — ronda 2 del Contador, ítem 5: la
 * retención repetida se evita AL RECONOCER la factura.
 *
 * GET  → facturas de compra en borrador del proveedor del anticipo (las únicas
 *        vinculables) con lo ya vinculado. Permiso `finance.view`.
 * POST → `fn_anticipo_proveedor_vincular_factura`: al causar esa factura, la base
 *        no deja retener otra vez sobre la base ya retenida en el anticipo.
 *        Permiso `finance.create`.
 *
 * Cliente de la sesión, organización de la sesión; otra en el body o la query → 403.
 * Sin la migración 20261108170000 → 501 `pendiente_de_activar`.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { vincularFacturaSchema } from '@/lib/finanzas/anticiposProveedor/contrato';
import { sinClavesDeOrganizacion, UUID_RE } from '@/lib/services/saldosAFavor/saldosAFavor.server';
import {
  ErrorAnticipoServidor,
  facturasParaVincular,
  respuestaErrorAnticipo,
  SIN_CACHE,
  vincularFactura,
} from '@/lib/services/anticiposProveedor/anticiposProveedor.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req, routeParams) => {
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) return respuestaErrorAnticipo('anticipo_no_encontrado');
  await readOrgBody(ctx, req, { route: 'GET /api/anticipos-proveedor/[id]/vincular' });
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.view'))) return respuestaErrorAnticipo('sin_permiso');
  try {
    return NextResponse.json({ facturas: await facturasParaVincular(ctx, id) }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorAnticipoServidor) return respuestaErrorAnticipo(err.codigo);
    throw err;
  }
});

export const POST = withOrg(async (ctx, req, routeParams) => {
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) return respuestaErrorAnticipo('anticipo_no_encontrado');
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/anticipos-proveedor/[id]/vincular' });
  const parsed = vincularFacturaSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!parsed.success) return respuestaErrorAnticipo('datos_invalidos', parsed.error.issues.map((i) => i.path.join('.')));
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.create'))) {
    console.warn('[anticipos-proveedor/vincular] permiso faltante → 403', { organizationId: ctx.organizationId, userId: ctx.userId });
    return respuestaErrorAnticipo('sin_permiso');
  }
  try {
    const resultado = await vincularFactura(ctx, id, parsed.data);
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorAnticipoServidor) return respuestaErrorAnticipo(err.codigo, err.detalle);
    throw err;
  }
});
