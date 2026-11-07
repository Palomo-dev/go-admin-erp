/**
 * /api/documentos-soporte/[id]
 *
 * GET    — detalle con líneas, factura de compra y último envío a la DIAN
 *          (estado, intentos, retención y eventos, nunca el payload). finance.view.
 * PUT    — edita un borrador, rechazado o con error sin envío vivo
 *          (`fn_documento_soporte_guardar`). finance.create.
 * DELETE — borra un documento que la DIAN no recibió (borrador, rechazado, con
 *          error o cancelado en el proveedor). finance.void, como la ruta del
 *          proveedor. El borrado en el proveedor de un rechazado lo sigue
 *          haciendo `DELETE /api/factus/support-document?ref=`.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS } from '@/lib/security/orgGuards';
import { guardarSoporteSchema } from '@/lib/finanzas/soporte/contratoSoporte';
import { errorSoporte, idDeRuta, SIN_CACHE, sinClavesDeOrganizacion, tienePermiso } from '@/lib/finanzas/soporte/rutasSoporte.server';
import {
  ErrorSoporteServidor,
  detalleDocumentoSoporte,
  eliminarDocumentoSoporte,
  guardarDocumentoSoporte,
} from '@/lib/services/soporte/documentosSoporte.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req, routeParams) => {
  await readOrgBody(ctx, req, { route: 'GET /api/documentos-soporte/[id]' });
  if (!(await tienePermiso(ctx, PERMISOS_FINANZAS.VER))) return errorSoporte(ctx, 'sin_permiso', 'GET /api/documentos-soporte/[id]');
  const id = await idDeRuta(routeParams);
  if (!id) return errorSoporte(ctx, 'documento_no_encontrado');
  try {
    return NextResponse.json(await detalleDocumentoSoporte(ctx, id), { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorSoporteServidor) return errorSoporte(ctx, err.codigo);
    throw err;
  }
});

export const PUT = withOrg(async (ctx, req, routeParams) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'PUT /api/documentos-soporte/[id]' });
  if (!(await tienePermiso(ctx, PERMISOS_FINANZAS.CREAR))) return errorSoporte(ctx, 'sin_permiso', 'PUT /api/documentos-soporte/[id]');
  const id = await idDeRuta(routeParams);
  if (!id) return errorSoporte(ctx, 'documento_no_encontrado');
  const parsed = guardarSoporteSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!parsed.success) return errorSoporte(ctx, 'datos_invalidos');
  try {
    return NextResponse.json({ resultado: await guardarDocumentoSoporte(ctx, id, parsed.data) }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorSoporteServidor) return errorSoporte(ctx, err.codigo);
    throw err;
  }
});

export const DELETE = withOrg(async (ctx, req, routeParams) => {
  await readOrgBody(ctx, req, { route: 'DELETE /api/documentos-soporte/[id]' });
  if (!(await tienePermiso(ctx, PERMISOS_FINANZAS.ANULAR))) return errorSoporte(ctx, 'sin_permiso', 'DELETE /api/documentos-soporte/[id]');
  const id = await idDeRuta(routeParams);
  if (!id) return errorSoporte(ctx, 'documento_no_encontrado');
  try {
    await eliminarDocumentoSoporte(ctx, id);
    return NextResponse.json({ ok: true }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorSoporteServidor) return errorSoporte(ctx, err.codigo);
    throw err;
  }
});
