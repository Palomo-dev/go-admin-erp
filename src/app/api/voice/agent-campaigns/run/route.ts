/**
 * POST /api/voice/agent-campaigns/run — cron del despachador de campañas del agente IA.
 *
 * Cierra C-F6-05: la ruta anterior (`/api/crm/voice-agents/campaigns/run`) queda detrás
 * del middleware de sesión y devolvía 307 al cron, así que NUNCA se ejecutaba.
 * Esta vive bajo el prefijo `/api/voice/`, que el middleware ya exime, y es fail-closed:
 * sin `CRON_SECRET` → 401; con token incorrecto → 401 (`verifyCronSecret`).
 *
 * La exención del middleware y los topes de marcación aterrizan en el mismo cambio
 * (riesgo 6 del informe del tester): el despachador aplica tope diario contando TODO
 * intento, tope horario y parada de emergencia por campaña.
 *
 * No acepta ningún identificador de organización de entrada: recorre las organizaciones
 * que tienen campañas `running` sin parada de emergencia.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server-service';
import { verifyCronSecret, WebhookError } from '@/lib/security/webhookSignatures';
import { runCampaignsForAllOrgs } from '@/lib/services/crm/voiceAgentCron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    verifyCronSecret(request);
  } catch (err) {
    if (err instanceof WebhookError) {
      console.warn('[Voice Agent Queue] Rechazado:', err.code);
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: err.statusCode });
    }
    throw err;
  }

  try {
    const data = await runCampaignsForAllOrgs(getServiceClient(), `cron-${Date.now().toString(36)}`);
    return NextResponse.json(
      { success: true, data },
      { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Voice Agent Queue] Error:', message);
    return NextResponse.json(
      { success: false, error: message, execution_time_ms: Date.now() - startTime },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return handle(request);
}

export async function GET(request: NextRequest) {
  return handle(request);
}
