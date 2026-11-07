/**
 * /api/documentos-soporte
 *
 * GET  — listado paginado, filtrado y ordenado en el servidor, con KPI
 *        (`listarDocumentosSoporte`). Permiso finance.view.
 * POST — crea un borrador con sus líneas en una transacción
 *        (`fn_documento_soporte_guardar`): referencia DS-#### y totales en la
 *        base, vendedor armado en el servidor desde `suppliers`. Permiso
 *        finance.create.
 *
 * Enviar a la DIAN sigue en `POST /api/factus/support-document` (cola).
 * La organización sale de la sesión; una ajena en la query o el cuerpo → 403.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS } from '@/lib/security/orgGuards';
import { guardarSoporteSchema, parametrosListadoSoporteSchema } from '@/lib/finanzas/soporte/contratoSoporte';
import { errorSoporte, SIN_CACHE, sinClavesDeOrganizacion, tienePermiso } from '@/lib/finanzas/soporte/rutasSoporte.server';
import { ErrorSoporteServidor, guardarDocumentoSoporte, listarDocumentosSoporte } from '@/lib/services/soporte/documentosSoporte.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/documentos-soporte' });
  if (!(await tienePermiso(ctx, PERMISOS_FINANZAS.VER))) return errorSoporte(ctx, 'sin_permiso', 'GET /api/documentos-soporte');
  const p = parametrosListadoSoporteSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!p.success) return errorSoporte(ctx, 'datos_invalidos');
  try {
    return NextResponse.json(await listarDocumentosSoporte(ctx, p.data), { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorSoporteServidor) return errorSoporte(ctx, err.codigo);
    throw err;
  }
});

export const POST = withOrg(async (ctx, req) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/documentos-soporte' });
  if (!(await tienePermiso(ctx, PERMISOS_FINANZAS.CREAR))) return errorSoporte(ctx, 'sin_permiso', 'POST /api/documentos-soporte');
  const parsed = guardarSoporteSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!parsed.success) return errorSoporte(ctx, 'datos_invalidos');
  try {
    return NextResponse.json({ resultado: await guardarDocumentoSoporte(ctx, null, parsed.data) }, { status: 201, headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorSoporteServidor) return errorSoporte(ctx, err.codigo);
    throw err;
  }
});
