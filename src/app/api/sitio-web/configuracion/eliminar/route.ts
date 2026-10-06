/**
 * POST /api/sitio-web/configuracion/eliminar { confirmacion: '<subdominio>' }
 * Zona de peligro › Eliminar sitio (Figma B/12-02).
 *
 * Borra páginas, diseño y ajustes del sitio con la RPC transaccional
 * `delete_website` (exige `website.sites.publish`); productos, pedidos,
 * clientes, dominios y revisiones publicadas se conservan. El servidor vuelve a
 * comprobar que el texto escrito es el subdominio de la organización de la
 * sesión.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { eliminarSitio, respuestaErrorConfiguracion } from '@/lib/website/configuracionSitio.server';

export const dynamic = 'force-dynamic';

const RUTA = 'sitio-web/configuracion/eliminar';

export const POST = withOrg(async (ctx, request) => {
  try {
    const raw = (await readOrgBody(ctx, request, { route: RUTA })) as Record<string, unknown> | null;
    await eliminarSitio(ctx, typeof raw?.confirmacion === 'string' ? raw.confirmacion : '');
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorConfiguracion(error, RUTA, ctx.organizationId);
  }
});
