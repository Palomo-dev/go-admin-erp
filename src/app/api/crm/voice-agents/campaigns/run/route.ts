/**
 * POST /api/crm/voice-agents/campaigns/run — alias histórico del cron de campañas.
 *
 * ⚠️ Esta ruta está DETRÁS del middleware de sesión (`src/middleware.ts` no la exime),
 * así que un cron externo recibe 307 hacia /auth/login. La ruta canónica del cron es
 * `/api/voice/agent-campaigns/run`, bajo un prefijo que el middleware sí exime.
 *
 * Se conserva el alias con su contrato original (fail-closed por `CRON_SECRET` y
 * `organization_id` opcional en el cuerpo para ejecutar una sola organización), porque
 * hay invocaciones internas que dependen de él.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret, WebhookError } from '@/lib/security/webhookSignatures';
import { getServiceClient } from '@/lib/supabase/server-service';
import { runCampaignsForAllOrgs, runCampaignsForOrg } from '@/lib/services/crm/voiceAgentCron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: NextRequest): Promise<NextResponse> {
  try {
    verifyCronSecret(request);
  } catch (err) {
    if (err instanceof WebhookError) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: err.statusCode });
    }
    throw err;
  }

  let organizationId: number | undefined;
  try {
    const body = await request.json();
    // Solo se acepta tras validar el secreto del cron (nunca desde una sesión de usuario).
    organizationId = typeof body?.organization_id === 'number' ? body.organization_id : undefined;
  } catch {
    organizationId = undefined;
  }

  try {
    const supabase = getServiceClient();
    const worker = `alias-${Date.now().toString(36)}`;
    const data =
      organizationId === undefined
        ? await runCampaignsForAllOrgs(supabase, worker)
        : await runCampaignsForOrg(supabase, organizationId, worker);
    return NextResponse.json(
      { success: true, data },
      { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Voice Agent Queue alias] Error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handle(request);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handle(request);
}
