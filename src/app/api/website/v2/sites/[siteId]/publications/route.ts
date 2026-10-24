import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { publicar, publicarYActivar } from '@/lib/services/website/siteDocumentService';
import { manejarError, respuestaError, sitioDeRuta, versionDe } from '@/lib/website/v2/respuestasApi';
import { revalidarPublicacionWeb } from '@/lib/services/website/revalidarPublicacionWeb';

export const maxDuration = 60;

/**
 * POST { version, nota?, activar? } → publica el borrador como revisión inmutable
 * (`publish_site_revision`). Idempotente con la misma versión.
 *
 * Con `activar: true` («Publicar» del editor), si el sitio aún no está activo en la web y el
 * lector público de V2 está desplegado, también lo activa (`set_site_v2_adoption`, lo mismo que
 * `adoption`) en esta misma llamada. Si activar falla, la revisión queda publicada y la
 * respuesta lleva `activacion: 'fallo'`. Sin `activar`, no cambia la web pública (D4).
 */
export const POST = withOrg(async (ctx, request, routeParams) => {
  try {
    const body = (await readOrgBody(ctx, request, { route: 'website/v2/sites/publications' })) as {
      version?: unknown;
      nota?: unknown;
      activar?: unknown;
    };
    const sitioId = await sitioDeRuta(routeParams);
    if (!sitioId) return respuestaError('sitio_no_encontrado', 'El sitio no existe en esta organización.');
    const version = versionDe(body.version);
    if (version === null) return respuestaError('peticion_invalida', 'Se esperaba { version }.');
    if (body.nota !== undefined && body.nota !== null && typeof body.nota !== 'string') {
      return respuestaError('peticion_invalida', 'La nota debe ser texto.');
    }
    if (body.activar !== undefined && typeof body.activar !== 'boolean') {
      return respuestaError('peticion_invalida', 'activar debe ser booleano.');
    }
    const nota = typeof body.nota === 'string' && body.nota.trim() ? body.nota.trim() : null;
    const resultado = body.activar === true
      ? await publicarYActivar(ctx.supabase, ctx.organizationId, sitioId, version, nota, process.env.NEXT_PUBLIC_WEBSITE_V2_LECTOR === '1')
      : await publicar(ctx.supabase, ctx.organizationId, sitioId, version, nota);
    if (resultado.v2Adoptado || resultado.activacion === 'activada') {
      const confirmada = await revalidarPublicacionWeb(ctx.organizationId, sitioId, resultado.revisionId, resultado.branchId ?? null);
      if (!confirmada) {
        // La revisión ya existe. Reintentar la misma versión es idempotente; nunca afirmar
        // que está visible si algún despliegue no confirmó el id que sirve el lector público.
        return NextResponse.json({ error: { code: 'no_disponible', message: 'La versión se guardó, pero no se pudo confirmar en la web. Reintenta publicar; tus cambios están a salvo.' } }, { status: 503 });
      }
    }
    return NextResponse.json(resultado, { status: 201 });
  } catch (error) {
    return manejarError(error, 'POST publications');
  }
});
