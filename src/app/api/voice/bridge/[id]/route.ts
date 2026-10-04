/**
 * GET /api/voice/bridge/[id] — estado del bridge y de su llamada (§4.1).
 *
 * Es el respaldo de Realtime: `useBridgeRealtime` lo consulta mientras el canal
 * no está suscrito. Auth de sesión y scope por organización.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { exigirAccesoALlamadaCargada, exigirAlcanceReferenciasLlamada } from '@/lib/services/crm/callAccessService';
import { respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
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

    await exigirAccesoALlamadaCargada(ctx, bridge, 'lectura');
    await exigirAlcanceReferenciasLlamada(ctx, bridge);
    let call = null;
    if (bridge.call_id) {
      const { data, error: callError } = await ctx.supabase
        .from('calls')
        .select('id, status, answered_at, ended_at, duration_seconds, recording_enabled, consent_given, metadata')
        .eq('id', bridge.call_id)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();
      if (callError) throw callError;
      if (data) {
        const { metadata, ...visible } = data;
        const started = metadata?.recording_started_at;
        call = { ...visible, recording_started: Boolean(visible.recording_enabled && visible.consent_given && typeof started === 'string' && Number.isFinite(Date.parse(started))) };
      }
    }

    return NextResponse.json({ success: true, data: { bridge, call } });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET puente móvil');
  }
}
