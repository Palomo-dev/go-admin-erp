/**
 * POST /api/sitio-web/dominios/[id]/verificar (Figma B/07-08…07-12).
 *
 * Verifica en el servidor (`verificacion.ts`: Vercel + DNS público, o la
 * verificación de propiedad P0-8 si no hay Vercel) y guarda el estado con
 * service role. Límite por organización: cada intento consulta el DNS y Vercel.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { checkRateLimits } from '@/lib/security/rateLimit';
import { getRateLimitStore } from '@/lib/security/rateLimitStore';
import { dependenciasDominios, verificar } from '@/lib/services/website/dominios/dominiosSitioService';
import { idDeRuta, jsonError, respuestaDeError, SIN_CACHE } from '@/lib/services/website/dominios/respuestaDominios';

export const dynamic = 'force-dynamic';

const RUTA = 'sitio-web/dominios/[id]/verificar';
/** 20 intentos / 10 min por organización (el mismo límite que la verificación P0-8). */
const LIMITE_ORG = { limit: 20, windowMs: 10 * 60 * 1000 };

export const POST = withOrg(async (ctx, request, routeParams) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    const id = await idDeRuta(routeParams);
    if (!id) return jsonError(404, 'no_existe', 'No encontramos ese dominio.');
    const rl = await checkRateLimits([{ key: `sitio-web:dominios:verificar:org:${ctx.organizationId}`, opts: LIMITE_ORG }], { store: getRateLimitStore() });
    if (!rl.allowed) {
      const espera = Math.max(1, Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000));
      return NextResponse.json(
        { error: 'Demasiados intentos de verificación. Espera unos minutos.', codigo: 'demasiados_intentos' },
        { status: 429, headers: { ...SIN_CACHE, 'Retry-After': String(espera) } },
      );
    }
    return NextResponse.json(await verificar(ctx, id, await dependenciasDominios()), { headers: SIN_CACHE });
  } catch (error) {
    return respuestaDeError(RUTA, ctx.organizationId, error);
  }
});
