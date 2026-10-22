/**
 * GET /api/sitio-web/legales/politica
 * URL efectiva de tratamiento: la manual si existe; si no, la página del sitio.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { manejarError } from '@/lib/website/v2/respuestasApi';
import { obtenerDocumentoLegal, urlPoliticaEfectiva } from '@/lib/website/legales/obtenerDocumentoLegal';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: 'sitio-web/legales/politica' });
    const manual = await ctx.supabase.from('comm_settings').select('data_policy_url').eq('organization_id', ctx.organizationId).maybeSingle();
    const guardada = (manual.data as { data_policy_url?: string | null } | null)?.data_policy_url ?? null;
    const pagina = await obtenerDocumentoLegal(ctx.supabase, ctx.organizationId, 'tratamiento');
    const url = await urlPoliticaEfectiva(ctx.supabase, ctx.organizationId, guardada);
    return NextResponse.json({ url, manual: guardada, sitio: pagina.url, publicado: pagina.publicado, conTexto: pagina.conTexto });
  } catch (error) {
    return manejarError(error, 'GET sitio-web/legales/politica');
  }
});
