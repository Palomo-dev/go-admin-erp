import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { revalidarCatalogoWeb } from '@/lib/services/website/revalidarCatalogoWeb';

export const dynamic = 'force-dynamic';

/**
 * POST /api/website/revalidate
 *
 * Invalida la caché del catálogo de la tienda web de la organización de la
 * sesión. Lo llama la UI del ERP (fire-and-forget) tras guardar productos,
 * precios o stock: ver `src/lib/services/website/revalidarCatalogoWeb.ts`.
 *
 * La organización sale de la sesión, nunca del body; el secreto compartido
 * con la tienda no sale del servidor.
 */
export const POST = withOrg(async (ctx) => {
  await revalidarCatalogoWeb(ctx.organizationId);
  return NextResponse.json({ ok: true });
});
