/**
 * GET /api/sitio-web/manifiesto — contrato de secciones del sitio público.
 *
 * El editor lo pide en el mismo origen. Antes el navegador llamaba al dominio
 * del sitio (`/api/_sections/manifest`): esa ruta no existe, el catch-all
 * respondía HTML y el navegador lo bloqueaba por CORS.
 *
 * La organización sale de la sesión. El host se resuelve aquí (dominio propio
 * verificado o subdominio); no se acepta uno que venga del cliente.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { permisosSitio } from '@/lib/services/website/paginasSitioService';
import { hostPublicoDeLaOrganizacion, leerManifiestoDelHost } from '@/lib/website/manifiestoSitio.server';

export const dynamic = 'force-dynamic';

const RUTA = 'sitio-web/manifiesto';
const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    const permisos = await permisosSitio(ctx);
    if (!permisos.editar) {
      return NextResponse.json(
        { error: 'No tienes permiso para editar el sitio.', codigo: 'sin_permiso' },
        { status: 403, headers: SIN_CACHE },
      );
    }
    const host = await hostPublicoDeLaOrganizacion(ctx.supabase, ctx.organizationId);
    const manifest = host ? await leerManifiestoDelHost(host) : null;
    return NextResponse.json({ manifest }, { headers: SIN_CACHE });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    console.error(`[api/${RUTA}]`, {
      organizationId: ctx.organizationId,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'No pudimos leer el manifiesto del sitio.', codigo: 'error_interno' },
      { status: 500, headers: SIN_CACHE },
    );
  }
});
