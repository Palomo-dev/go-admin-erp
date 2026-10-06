/**
 * /api/sitio-web/sedes — «Sedes en la web» (Figma B/11-01…11-05).
 *
 * GET → modo, dirección base del sitio y sedes (publicada, dirección, fuente
 *       de stock, dominio propio, horario de la sucursal en solo lectura).
 * PUT { modo?, sedes: [{ id, publicada, slug, fuenteStock }] } → guarda en un
 *       lote y devuelve el GET. Publicar exige dirección; una dirección en uso
 *       → 409 `slug_en_uso` (otra sede) o `slug_es_pagina` (una página del sitio).
 *
 * La organización sale de la sesión (`withOrg`); una organización ajena en la
 * query o el body → 403 y registro (`readOrgBody`). Permiso
 * `website.sites.edit` resuelto en la base.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError, ORG_BODY_KEYS } from '@/lib/utils/orgContext';
import { ErrorSedesWeb, guardarSedesWeb, leerSedesWeb, respuestaErrorSedes } from '@/lib/website/sedesWeb.server';
import { validarCambiosSedes } from '@/components/sitio-web/ventas/sedesWeb';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: 'sitio-web/sedes' });
    return NextResponse.json(await leerSedesWeb(ctx), { headers: SIN_CACHE });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorSedes(error, 'sitio-web/sedes', ctx.organizationId);
  }
});

export const PUT = withOrg(async (ctx, request) => {
  try {
    const raw = await readOrgBody(ctx, request, { route: 'sitio-web/sedes' });
    const limpio =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)))
        : raw;
    const v = validarCambiosSedes(limpio);
    if (!v.ok) throw new ErrorSedesWeb('peticion_invalida', 400, 'Revisa las direcciones de las sedes.', v.errores);
    await guardarSedesWeb(ctx, v.cambios);
    return NextResponse.json(await leerSedesWeb(ctx), { headers: SIN_CACHE });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorSedes(error, 'sitio-web/sedes', ctx.organizationId);
  }
});
