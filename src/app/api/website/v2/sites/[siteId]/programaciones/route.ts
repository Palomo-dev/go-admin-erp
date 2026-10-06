import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import {
  cancelarProgramacion,
  listarProgramaciones,
  programarPublicacion,
} from '@/lib/services/website/editorSitioService';
import { esUuid, manejarError, respuestaError, sitioDeRuta, versionDe } from '@/lib/website/v2/respuestasApi';

export const dynamic = 'force-dynamic';

/**
 * Publicación programada del borrador V2 (Figma A/05g «Programar · Ej.: el lunes antes de abrir»).
 *
 * - GET → { programaciones } (la pendiente primero).
 * - POST { version, ejecutarEn (ISO), nota? } → programa la versión actual del borrador.
 * - DELETE ?id=<uuid> → cancela la pendiente.
 *
 * Programar y cancelar exigen `website.sites.publish` (se comprueba aquí y otra vez en la RLS).
 * La publicación la hace el job `fn_website_ejecutar_programadas` (pg_cron) con la MISMA RPC
 * `publish_site_revision`, en nombre de quien programó. Migración pendiente: hasta aplicarla,
 * responde `no_disponible` (503).
 */
async function exigirPublicar(ctx: { supabase: import('@supabase/supabase-js').SupabaseClient; organizationId: number }) {
  const { data, error } = await ctx.supabase.rpc('fn_website_tiene_permiso', { p_org: ctx.organizationId, p_code: 'website.sites.publish' });
  if (error) throw error;
  return data === true;
}

export const GET = withOrg(async (ctx, request, routeParams) => {
  try {
    await readOrgBody(ctx, request, { route: 'website/v2/sites/programaciones' });
    const sitioId = await sitioDeRuta(routeParams);
    if (!sitioId) return respuestaError('sitio_no_encontrado', 'El sitio no existe en esta organización.');
    return NextResponse.json({ programaciones: await listarProgramaciones(ctx.supabase, ctx.organizationId, sitioId) });
  } catch (error) {
    return manejarError(error, 'GET programaciones');
  }
});

export const POST = withOrg(async (ctx, request, routeParams) => {
  try {
    const body = (await readOrgBody(ctx, request, { route: 'website/v2/sites/programaciones' })) as {
      version?: unknown;
      ejecutarEn?: unknown;
      nota?: unknown;
    };
    const sitioId = await sitioDeRuta(routeParams);
    if (!sitioId) return respuestaError('sitio_no_encontrado', 'El sitio no existe en esta organización.');
    const version = versionDe(body.version);
    if (version === null || typeof body.ejecutarEn !== 'string') {
      return respuestaError('peticion_invalida', 'Se esperaba { version, ejecutarEn }.');
    }
    if (!(await exigirPublicar(ctx))) return respuestaError('sin_permiso', 'No tienes permiso para publicar este sitio.');
    const nota = typeof body.nota === 'string' ? body.nota : null;
    const programacion = await programarPublicacion(ctx.supabase, ctx.organizationId, sitioId, { version, ejecutarEn: body.ejecutarEn, nota });
    return NextResponse.json({ programacion }, { status: 201 });
  } catch (error) {
    return manejarError(error, 'POST programaciones');
  }
});

export const DELETE = withOrg(async (ctx, request, routeParams) => {
  try {
    await readOrgBody(ctx, request, { route: 'website/v2/sites/programaciones' });
    const sitioId = await sitioDeRuta(routeParams);
    if (!sitioId) return respuestaError('sitio_no_encontrado', 'El sitio no existe en esta organización.');
    const id = new URL(request.url).searchParams.get('id');
    if (!esUuid(id)) return respuestaError('peticion_invalida', 'Falta la programación.');
    if (!(await exigirPublicar(ctx))) return respuestaError('sin_permiso', 'No tienes permiso para publicar este sitio.');
    await cancelarProgramacion(ctx.supabase, ctx.organizationId, sitioId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return manejarError(error, 'DELETE programaciones');
  }
});
