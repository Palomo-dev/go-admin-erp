import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { revalidarCatalogoWeb, revalidarSitioWeb } from '@/lib/services/website/revalidarCatalogoWeb';

export const dynamic = 'force-dynamic';

/**
 * POST /api/website/revalidate
 *
 * Invalida la caché del catálogo de la tienda web de la organización de la
 * sesión. Lo llama la UI del ERP tras guardar productos, precios o stock.
 * Con `{ sitio: true, site_state_id }` también invalida el documento publicado.
 *
 * La organización sale de la sesión, nunca del body; el secreto compartido
 * con la tienda no sale del servidor.
 */
export const POST = withOrg(async (ctx, req) => {
  let cuerpo: { sitio?: unknown; site_state_id?: unknown } = {};
  try {
    const texto = await req.text();
    if (texto.trim()) cuerpo = JSON.parse(texto) as typeof cuerpo;
  } catch {
    return NextResponse.json({ ok: false, error: 'No se pudo leer la petición' }, { status: 400 });
  }
  if (cuerpo.sitio === true) {
    const siteStateId = typeof cuerpo.site_state_id === 'string' ? cuerpo.site_state_id : null;
    const confirmado = await revalidarSitioWeb(ctx.organizationId, siteStateId);
    return NextResponse.json({ ok: true, confirmado });
  }
  await revalidarCatalogoWeb(ctx.organizationId);
  return NextResponse.json({ ok: true });
});
