import { randomUUID } from 'crypto';
import { after, NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { aplicarPlantillaCompleta } from '@/lib/services/website/plantillaCompletaService';
import { mejorarLegalesPendientes } from '@/lib/website/legales/mejorarLegalesPendientes';
import { manejarError, respuestaError } from '@/lib/website/v2/respuestasApi';
import { sitioDeCuerpo, versionDeCuerpo } from '@/components/sitio-web/paginas/parametrosPaginas';

/**
 * POST { sitio, version, plantilla } → «Usar esta plantilla › Plantilla completa»: reemplaza el
 * borrador por el sitio completo de la plantilla (encabezado, pie, páginas, secciones y menús) con
 * los datos reales de la organización. El borrador anterior queda en el historial y la respuesta
 * trae su `instantaneaId` para «Deshacer». La organización sale de la sesión; el permiso
 * `website.sites.edit` lo resuelve el servidor. Nada cambia en la web pública hasta publicar.
 */
export const POST = withOrg(async (ctx, request) => {
  try {
    const body = (await readOrgBody(ctx, request, { route: 'sitio-web/paginas/plantilla' })) as Record<string, unknown>;
    const sitio = sitioDeCuerpo(body.sitio);
    const version = versionDeCuerpo(body.version);
    const plantilla = typeof body.plantilla === 'string' && /^[a-z0-9_]{1,64}$/.test(body.plantilla) ? body.plantilla : null;
    if (sitio === 'invalido' || version === 'invalido' || !plantilla) {
      return respuestaError('peticion_invalida', 'Se esperaba { sitio, version, plantilla }.');
    }
    const respuesta = await aplicarPlantillaCompleta(ctx, sitio, version, plantilla, randomUUID);
    // La plantilla ya dejó el texto. Si la IA responde, reemplaza solo lo no editado.
    after(() => {
      void mejorarLegalesPendientes(ctx.supabase, ctx.organizationId, sitio).catch((error) => {
        console.error('[legales] no se pudo mejorar con IA', error instanceof Error ? error.message : error);
      });
    });
    return NextResponse.json(respuesta);
  } catch (error) {
    return manejarError(error, 'POST sitio-web/paginas/plantilla');
  }
});
