/**
 * POST /api/hrm/ausencias/[id]/soporte — { documento_id }
 *
 * Enlaza el soporte que ya se subió a `hr-documentos` (Figma 20.14 «Subir soporte»). La subida va
 * por `/api/hrm/personas/[id]/documentos` con su permiso de grupo; aquí la base exige que el
 * documento sea de la misma persona y, en una incapacidad, del grupo salud.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { enlazarSoporte } from '@/lib/services/hrm/ausenciasService.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    const id = await parametroDeRuta(routeParams, 'id');
    const body = await readOrgBody<{ documento_id?: unknown }>(ctx, req, { route: 'hrm/ausencias/soporte' });
    return NextResponse.json(await enlazarSoporte(ctx, id, body?.documento_id), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'ausencias:soporte');
  }
});
