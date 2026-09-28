import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server-service';
import { authenticateDisplayRequest } from '@/lib/pos/display/server/displayAuth';
import { issueDisplayRealtimeCredential } from '@/lib/pos/display/server/displayRealtime';
import { HEARTBEAT_WRITE_INTERVAL_MS } from '@/lib/pos/display/server/displayTokens';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/**
 * POST /api/pos/display/heartbeat — la pantalla remota avisa que sigue viva
 * (PLAN §7: cada 60 s). Fase 3, parte A. Token Bearer, sin sesión; la
 * terminal (y su organización) sale del token. Sin body: nada del cliente se
 * persiste.
 *
 * - Escribe SOLO `pos_terminals.display_last_seen_at` de ESA terminal, con
 *   service-role, tras validar el token, y SOLO si el valor anterior es nulo
 *   o más viejo que `HEARTBEAT_WRITE_INTERVAL_MS` (30 s): la condición va en
 *   el WHERE del UPDATE (sin lectura extra), así una tableta comprometida que
 *   martillee el latido no produce escrituras (ronda 3, qa bajo 5).
 * - Devuelve además `realtime: { channel, token, expiresAt }`: el JWT de
 *   Realtime renovado (5 min) (ronda 3, qa alto 2). Tras `/revoke` el latido
 *   da 401 y no hay renovación: el canal muere en <= 5 min. Sin secreto JWT
 *   → 503 `REALTIME_NOT_CONFIGURED` como en /bootstrap (no se registra el
 *   latido: una pantalla sin canal no está «viva»).
 */
export async function POST(request: Request) {
  const auth = await authenticateDisplayRequest(request);
  if (!auth.ok) return auth.response;

  const issued = issueDisplayRealtimeCredential(auth.terminal.id, 'heartbeat');
  if (!issued.ok) return issued.response;

  try {
    const now = Date.now();
    const at = new Date(now).toISOString();
    const staleBefore = new Date(now - HEARTBEAT_WRITE_INTERVAL_MS).toISOString();
    const { error } = await getServiceClient()
      .from('pos_terminals')
      .update({ display_last_seen_at: at })
      .eq('id', auth.terminal.id)
      .eq('organization_id', auth.terminal.organizationId)
      .or(`display_last_seen_at.is.null,display_last_seen_at.lt.${staleBefore}`);
    if (error) {
      console.error('[pos-display/heartbeat] escritura falló:', error.message);
      return NextResponse.json({ error: 'No se pudo registrar el latido', code: 'HEARTBEAT_FAILED' }, { status: 503, headers: NO_STORE });
    }
    return NextResponse.json({ data: { terminalId: auth.terminal.id, at, realtime: issued.realtime } }, { headers: NO_STORE });
  } catch (err: unknown) {
    console.error('[pos-display/heartbeat] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Error interno', code: 'INTERNAL' }, { status: 500, headers: NO_STORE });
  }
}
