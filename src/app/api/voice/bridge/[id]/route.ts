/**
 * GET /api/voice/bridge/[id] — estado del bridge y de su llamada (§4.1).
 *
 * Es el respaldo de Realtime: `useBridgeRealtime` lo consulta mientras el canal
 * no está suscrito. Auth de sesión y scope por organización.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getBridge } from '@/lib/services/crm/mobileBridgeService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ success: false, code: err.code, error: err.message }, { status: err.statusCode });
    }
    throw err;
  }

  try {
    const { id } = await params;
    const bridge = await getBridge(id, ctx.organizationId, ctx.supabase);
    if (!bridge) {
      return NextResponse.json({ success: false, code: 'BRIDGE_NOT_FOUND', error: 'Bridge no encontrado' }, { status: 404 });
    }

    let call = null;
    if (bridge.call_id) {
      const { data } = await ctx.supabase
        .from('calls')
        .select('id, status, answered_at, ended_at, duration_seconds, recording_enabled, consent_given')
        .eq('id', bridge.call_id)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();
      call = data ?? null;
    }

    return NextResponse.json({ success: true, data: { bridge, call } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Bridge GET] error:', message);
    return NextResponse.json({ success: false, code: 'INTERNAL', error: message }, { status: 500 });
  }
}
