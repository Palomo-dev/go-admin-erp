/**
 * Mi asistencia › Tus autorizaciones (Figma 20.32). Solo las de la persona de la
 * sesión: la base toma su vínculo del actor, nunca del cuerpo.
 * GET → vigentes e historial. POST { tipos: [...], autorizo } → nueva decisión
 * (solo inserción, con versión del texto, IP y agente).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { decidirAutorizacion, misAutorizaciones } from '@/lib/services/hrm/kioscoGestionService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  try {
    return NextResponse.json(await misAutorizaciones(ctx), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'marcacion:autorizaciones');
  }
});

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<unknown>(ctx, req, { route: 'hrm/marcacion/autorizaciones' });
    return NextResponse.json(await decidirAutorizacion(ctx, body, contextoDePeticion(req)), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'marcacion:autorizar');
  }
});
