/**
 * /api/sitio-web/analitica/pixeles — «Píxeles y medición» (Figma B/09-01,
 * nota-codigo B/09-05): IDs tipados en `website_settings`, no `<script>`
 * pegado (eso sigue en Configuración › Código).
 *
 * GET → { pixeles: { meta|ga4|tiktok|gtm|ads: { id, disponible } }, puedeEditar, metaEnCodigo }
 *       `metaEnCodigo`: el código propio ya hace fbq('init'…); el sitio no pinta el Meta
 *       tipado encima (contaría dos veces) y la tarjeta lo avisa.
 *       Lo ve quien ve la analítica (`puedeVerAnaliticaWeb`).
 * PUT { tipo, id: string | null } → guarda o quita un ID. Exige
 *       `website.sites.edit` y valida el formato (el mismo de los CHECK).
 *
 * GA4 reutiliza `analytics_id` (ya existe). Meta, TikTok, GTM y Google Ads
 * dependen de la migración pendiente 20261008090000: sin ella salen con
 * `disponible: false` y el PUT responde 409.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError, jsonError } from '@/lib/utils/orgContext';
import { puedeVerAnaliticaWeb } from '@/lib/navigation/capacidadesNav.server';
import { permisosSitio } from '@/lib/services/website/paginasSitioService';
import { ErrorSeo, esSinColumna, guardarAjustesServidor, respuestaErrorSeo, type CtxSeo } from '@/components/sitio-web/seoanalitica/seo.server';
import {
  COLUMNA_PIXEL,
  TIPOS_PIXEL,
  esTipoPixel,
  normalizarIdPixel,
  type EstadoPixel,
  type PixelesRespuesta,
  type TipoPixel,
  snippetConMeta,
} from '@/components/sitio-web/seoanalitica/saludSitio';

export const dynamic = 'force-dynamic';

async function leerPixeles(ctx: CtxSeo): Promise<{ pixeles: Record<TipoPixel, EstadoPixel>; metaEnCodigo: boolean }> {
  // `custom_scripts` (existe hoy) para avisar si el código propio ya carga un Meta Pixel.
  const columnas = [...TIPOS_PIXEL.map((t) => COLUMNA_PIXEL[t]), 'custom_scripts'].join(', ');
  const completo = await ctx.supabase.from('website_settings').select(columnas).eq('organization_id', ctx.organizationId).is('branch_id', null).maybeSingle();
  let fila: Record<string, string | null> | null;
  let disponibles: Set<TipoPixel>;
  if (!completo.error) {
    fila = completo.data as unknown as Record<string, string | null> | null;
    disponibles = new Set(TIPOS_PIXEL);
  } else {
    if (!esSinColumna(completo.error)) throw completo.error;
    const soloGa = await ctx.supabase.from('website_settings').select('analytics_id, custom_scripts').eq('organization_id', ctx.organizationId).is('branch_id', null).maybeSingle();
    if (soloGa.error) throw soloGa.error;
    fila = soloGa.data as unknown as Record<string, string | null> | null;
    disponibles = new Set<TipoPixel>(['ga4']);
  }
  const pixeles = Object.fromEntries(
    TIPOS_PIXEL.map((t) => [t, { id: disponibles.has(t) ? (fila?.[COLUMNA_PIXEL[t]] ?? null) || null : null, disponible: disponibles.has(t) }]),
  ) as Record<TipoPixel, EstadoPixel>;
  return { pixeles, metaEnCodigo: snippetConMeta(fila?.custom_scripts) };
}

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: 'sitio-web/analitica/pixeles' });
    if (!(await puedeVerAnaliticaWeb(ctx))) return jsonError(403, 'SIN_PERMISO', 'No tienes acceso a la analítica web');
    const [{ pixeles, metaEnCodigo }, permisos] = await Promise.all([leerPixeles(ctx), permisosSitio(ctx)]);
    return NextResponse.json({ pixeles, puedeEditar: permisos.editar, metaEnCodigo } satisfies PixelesRespuesta, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorSeo(error, 'sitio-web/analitica/pixeles', ctx.organizationId);
  }
});

export const PUT = withOrg(async (ctx, request) => {
  try {
    const body = (await readOrgBody(ctx, request, { route: 'sitio-web/analitica/pixeles' })) as { tipo?: unknown; id?: unknown } | null;
    if (!body || !esTipoPixel(body.tipo) || (body.id !== null && typeof body.id !== 'string')) {
      throw new ErrorSeo('peticion_invalida', 400, 'Se esperaba { tipo, id }.');
    }
    const id = normalizarIdPixel(body.tipo, body.id ?? '');
    if (id === undefined) throw new ErrorSeo('peticion_invalida', 400, 'Ese ID no tiene el formato esperado.');
    await guardarAjustesServidor(ctx, { [COLUMNA_PIXEL[body.tipo]]: id });
    const [{ pixeles, metaEnCodigo }, permisos] = await Promise.all([leerPixeles(ctx), permisosSitio(ctx)]);
    return NextResponse.json({ pixeles, puedeEditar: permisos.editar, metaEnCodigo } satisfies PixelesRespuesta);
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorSeo(error, 'sitio-web/analitica/pixeles', ctx.organizationId);
  }
});
