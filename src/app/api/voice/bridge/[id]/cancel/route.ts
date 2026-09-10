/**
 * POST /api/voice/bridge/[id]/cancel — corta el bridge antes de conectar (§4.1).
 *
 * Auth de sesión. Solo el DUEÑO del bridge o un admin de la organización; el
 * servicio corta cada pata con el verbo que Twilio acepta según su estado real
 * y, si el proveedor rechaza el corte, devuelve 502 en vez de mentir marcando
 * el bridge como terminado con la llamada todavía viva.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError, isOrgAdminContext } from '@/lib/utils/orgContext';
import { cancelBridge, BridgeError } from '@/lib/services/crm/mobileBridgeService';
import { getServiceClient } from '@/lib/supabase/server-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    // Service role: cortar exige escribir el bridge y la llamada aunque la RLS
    // de `mobile_call_bridges` sea por dueño; la comprobación de dueño/admin la
    // hace `cancelBridge` con el userId de la SESIÓN.
    const result = await cancelBridge(id, ctx.organizationId, ctx.userId, isOrgAdminContext(ctx), getServiceClient());
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof BridgeError) {
      return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Bridge Cancel] error:', message);
    return NextResponse.json({ success: false, code: 'INTERNAL', error: message }, { status: 500 });
  }
}
