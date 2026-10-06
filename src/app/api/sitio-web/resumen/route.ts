/**
 * GET /api/sitio-web/resumen — Resumen del módulo Sitio web (Figma A/02a-02i):
 * estado (listo o primera vez), sitio con su dirección real, lista de
 * lanzamiento, KPIs de 7 días, alertas, cambios recientes y permisos.
 *
 * La organización sale de la sesión (`withOrg`); una organización distinta en
 * la query → 403 y registro (`readOrgBody`). Lectura con el cliente de la
 * sesión (RLS: miembros activos). Los permisos de editar y publicar los
 * resuelve la base (`fn_website_tiene_permiso`), con el mismo criterio que la
 * RLS de escritura.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { leerResumenSitio } from '@/lib/website/resumenSitio.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: 'sitio-web/resumen' });
    return NextResponse.json(await leerResumenSitio(ctx), { headers: SIN_CACHE });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    const codigo = (error as { code?: string } | null)?.code;
    if (codigo === '42501') {
      return NextResponse.json({ error: 'No tienes acceso al sitio web.', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
    }
    console.error('[api/sitio-web/resumen]', { organizationId: ctx.organizationId, message: error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error) });
    return NextResponse.json({ error: 'No pudimos cargar el resumen del sitio.', codigo: 'error_interno' }, { status: 500, headers: SIN_CACHE });
  }
});
