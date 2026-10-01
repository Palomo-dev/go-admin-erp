/**
 * POST /api/avisos-miembro/despachar
 * La sesión manda los correos pendientes de su organización.
 * No recibe ni devuelve destinatarios.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { despacharAvisosPendientes } from '@/lib/services/avisos/despacho.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx) => {
  try {
    const resumen = await despacharAvisosPendientes(ctx.organizationId);
    return NextResponse.json({
      ok: true,
      enviados: resumen.enviados,
      omitidos: resumen.omitidos,
      fallidos: resumen.fallidos,
      enPausa: resumen.enPausa,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[avisos/despachar]', err instanceof Error ? err.name : 'error');
    return NextResponse.json({ ok: false, error: 'No se pudieron enviar los avisos' }, { status: 500 });
  }
});
