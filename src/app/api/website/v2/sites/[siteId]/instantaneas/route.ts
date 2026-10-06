import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import {
  crearInstantanea,
  listarInstantaneas,
  restaurarInstantanea,
} from '@/lib/services/website/editorSitioService';
import { esUuid, manejarError, respuestaError, sitioDeRuta, versionDe } from '@/lib/website/v2/respuestasApi';
import type { MotivoInstantanea } from '@/lib/website/v2/tiposEditor';

export const dynamic = 'force-dynamic';

/**
 * Instantáneas del borrador V2: los «Guardado automático» del historial (Figma A/05h) y la copia
 * que se guarda al elegir «Descartar mis cambios» en el conflicto (A/05i).
 *
 * - GET → { instantaneas }.
 * - POST { accion: 'crear', documento, version, motivo } → guarda una instantánea.
 * - POST { accion: 'restaurar', instantaneaId, version } → la copia al borrador (compare-and-swap).
 *
 * Exige `website.sites.edit` (aquí y en la RLS). Migración pendiente: hasta aplicarla, responde
 * `no_disponible` (503) y el editor simplemente no las muestra.
 */
export const GET = withOrg(async (ctx, request, routeParams) => {
  try {
    await readOrgBody(ctx, request, { route: 'website/v2/sites/instantaneas' });
    const sitioId = await sitioDeRuta(routeParams);
    if (!sitioId) return respuestaError('sitio_no_encontrado', 'El sitio no existe en esta organización.');
    return NextResponse.json({ instantaneas: await listarInstantaneas(ctx.supabase, ctx.organizationId, sitioId) });
  } catch (error) {
    return manejarError(error, 'GET instantaneas');
  }
});

export const POST = withOrg(async (ctx, request, routeParams) => {
  try {
    const body = (await readOrgBody(ctx, request, { route: 'website/v2/sites/instantaneas' })) as {
      accion?: unknown;
      documento?: unknown;
      version?: unknown;
      motivo?: unknown;
      instantaneaId?: unknown;
    };
    const sitioId = await sitioDeRuta(routeParams);
    if (!sitioId) return respuestaError('sitio_no_encontrado', 'El sitio no existe en esta organización.');
    const version = versionDe(body.version);
    if (version === null) return respuestaError('peticion_invalida', 'Falta la versión del borrador.');
    const { data: puede, error } = await ctx.supabase.rpc('fn_website_tiene_permiso', { p_org: ctx.organizationId, p_code: 'website.sites.edit' });
    if (error) throw error;
    if (puede !== true) return respuestaError('sin_permiso', 'No tienes permiso para editar este sitio.');

    if (body.accion === 'restaurar') {
      if (!esUuid(body.instantaneaId)) return respuestaError('peticion_invalida', 'Falta el guardado automático.');
      return NextResponse.json(await restaurarInstantanea(ctx.supabase, ctx.organizationId, sitioId, body.instantaneaId, version));
    }
    if (body.accion === 'crear') {
      const instantanea = await crearInstantanea(ctx.supabase, ctx.organizationId, sitioId, {
        documento: body.documento,
        version,
        motivo: body.motivo as MotivoInstantanea,
      });
      return NextResponse.json({ instantanea }, { status: 201 });
    }
    return respuestaError('peticion_invalida', 'Acción no válida.');
  } catch (error) {
    return manejarError(error, 'POST instantaneas');
  }
});
