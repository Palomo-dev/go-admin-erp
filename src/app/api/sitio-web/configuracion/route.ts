/**
 * /api/sitio-web/configuracion — «Configuración del sitio» (Figma B/12-01…12-06).
 *
 * GET → permisos, dirección, datos de la organización, ajustes del sitio
 *       (contacto, chat, idioma, mantenimiento, código a medida), módulo Chat,
 *       monedas y funciones pendientes de migración.
 * PUT { correo?, telefono?, whatsapp?, saludoWhatsapp?, chatActivo?, idioma?,
 *       mantenimiento?, codigo? } → un solo lote por `update_website_settings`
 *       (autor y fecha del código los sella la base) y devuelve el GET.
 *
 * Nombre, logo y favicon NO pasan por aquí: son del borrador V2 (`useSitioV2`).
 * La organización sale de la sesión (`withOrg`); otra organización en la query
 * o el body → 403 y registro (`readOrgBody`). Permiso `website.sites.edit`
 * resuelto en la base.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError, ORG_BODY_KEYS } from '@/lib/utils/orgContext';
import { esquemaCambiosConfiguracion } from '@/lib/website/configuracionSitio';
import {
  ErrorConfiguracion,
  guardarConfiguracion,
  leerConfiguracion,
  respuestaErrorConfiguracion,
} from '@/lib/website/configuracionSitio.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;
const RUTA = 'sitio-web/configuracion';

function sinClavesDeOrganizacion(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  return Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)));
}

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    return NextResponse.json(await leerConfiguracion(ctx), { headers: SIN_CACHE });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorConfiguracion(error, RUTA, ctx.organizationId);
  }
});

export const PUT = withOrg(async (ctx, request) => {
  try {
    const raw = await readOrgBody(ctx, request, { route: RUTA });
    const r = esquemaCambiosConfiguracion.safeParse(sinClavesDeOrganizacion(raw));
    if (!r.success) {
      throw new ErrorConfiguracion('peticion_invalida', 400, 'Revisa los datos del formulario.', r.error.issues.map((i) => i.path.join('.')));
    }
    await guardarConfiguracion(ctx, r.data);
    return NextResponse.json(await leerConfiguracion(ctx), { headers: SIN_CACHE });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorConfiguracion(error, RUTA, ctx.organizationId);
  }
});
