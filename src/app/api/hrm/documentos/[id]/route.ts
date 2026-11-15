/**
 * GET /api/hrm/documentos/[id] — URL firmada de 60 s para descargar un
 * documento del empleado. Antes, `fn_hr_documento_autorizar_descarga` comprueba
 * el permiso del grupo y deja el registro de acceso (ADR-001 §10).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { urlDescarga } from '@/lib/services/hrm/documentosService.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req, routeParams) => {
  try {
    const documento = await parametroDeRuta(routeParams, 'id');
    return NextResponse.json(await urlDescarga(ctx, documento, contextoDePeticion(req)), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'documentos:descarga');
  }
});
