import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret, webhookErrorResponse } from '@/lib/security/webhookSignatures';
import { getServiceClient } from '@/lib/supabase/server-service';
import { desactivarLinkCambio } from '@/lib/services/webOrderChanges/webOrderChangesServer';

export const dynamic = 'force-dynamic';

/** Errores de «la migración aún no está aplicada»: tabla o función inexistente. */
const SIN_MIGRACION = new Set(['42P01', '42883', 'PGRST202', 'PGRST205']);

/**
 * GET /api/cron/expire-web-order-changes
 * Vence los cambios de pedido con link sin pagar (expires_at pasado), libera su reserva CHG-… y
 * desactiva en la pasarela los links de cambios cerrados que sigan activos (Wompi; Bold no expone
 * anulación y su link vence solo).
 * Si la migración 20261028210000 no está aplicada responde 200 con aviso (no reintentar en bucle).
 * Seguridad: `Authorization: Bearer CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  try {
    verifyCronSecret(request);
  } catch (err) {
    return webhookErrorResponse(err);
  }
  const db = getServiceClient();
  const { data, error } = await db.rpc('fn_web_order_changes_expirar');
  if (error) {
    if (SIN_MIGRACION.has(String((error as { code?: string }).code ?? ''))) {
      return NextResponse.json({ ok: true, vencidos: 0, aviso: 'Cambios de pedido no instalados (migración 20261028210000 sin aplicar).' });
    }
    console.error('[cron expire-web-order-changes]', error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  const vencidos = Number((data as { vencidos?: number } | null)?.vencidos ?? 0);

  let desactivados = 0;
  const { data: pendientes } = await db
    .from('web_order_changes')
    .select('id')
    .in('estado', ['expired', 'cancelled'])
    .eq('provider_code', 'wompi_link')
    .is('link_disabled_at', null)
    .not('qr_session_id', 'is', null)
    .limit(50);
  for (const p of (pendientes as Array<{ id: string }> | null) ?? []) {
    if ((await desactivarLinkCambio(db, p.id)) === 'desactivado') desactivados += 1;
  }
  return NextResponse.json({ ok: true, vencidos, linksDesactivados: desactivados });
}
