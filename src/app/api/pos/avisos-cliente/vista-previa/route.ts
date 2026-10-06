import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { MOMENTOS_AVISO, type MomentoAviso } from '@/lib/pos/pedidosWeb/avisosCliente';
import { armarVistaPrevia } from '@/lib/services/avisosVistaPrevia';

/**
 * GET /api/pos/avisos-cliente/vista-previa?momento=confirmado — «Vista
 * previa» (Figma 465:85523): el aviso tal como saldría, con los datos del
 * último pedido web de la organización (o uno de ejemplo si aún no hay).
 * Organización de la sesión; el pedido se lee filtrado por ella y el cliente
 * de servicio se usa solo después de validar la sesión.
 */
export const GET = withOrg(async (ctx, request) => {
  const momento = new URL(request.url).searchParams.get('momento') as MomentoAviso | null;
  if (!momento || !(MOMENTOS_AVISO as readonly string[]).includes(momento)) {
    return NextResponse.json({ error: 'Momento inválido' }, { status: 400 });
  }
  const vista = await armarVistaPrevia(getSupabaseAdmin(), ctx.supabase, ctx.organizationId, momento);
  return NextResponse.json(vista, { headers: { 'Cache-Control': 'private, no-store' } });
});
