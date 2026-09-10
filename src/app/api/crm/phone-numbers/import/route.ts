import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { isOrgAdmin } from '@/lib/utils/rbac';
import { getServiceClient } from '@/lib/supabase/server-service';
import { importNumbersFromTwilio, syncNumberWebhooks } from '@/lib/services/crm/phoneNumberService';
import { VoiceNotConfiguredError } from '@/lib/services/crm/voiceContextService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/crm/phone-numbers/import — Importa los números de la (sub)cuenta
 * Twilio de la organización (`incomingPhoneNumbers.list`) a `phone_numbers`
 * (upsert por e164: provider_sid, capabilities, label) y apunta cada uno a
 * nuestros webhooks (`voiceUrl → /api/voice/twiml/inbound`, `statusCallback → /api/voice/status`).
 * Solo admin. Respuesta: { success, data: ImportedNumber[], synced: number, sync_errors: string[] }
 * 409 VOICE_NOT_CONFIGURED sin credenciales REST; 502 si Twilio falla.
 */
export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    throw err;
  }
  if (!isOrgAdmin(ctx) && !ctx.isSuperAdmin) {
    return NextResponse.json({ success: false, error: 'Solo un administrador puede importar números' }, { status: 403 });
  }

  try {
    const sb = getServiceClient();
    const imported = await importNumbersFromTwilio(ctx.organizationId, sb);
    const syncErrors: string[] = [];
    let synced = 0;
    for (const n of imported) {
      if (!n.capabilities.voice) continue;
      try {
        await syncNumberWebhooks(ctx.organizationId, n.provider_sid);
        synced += 1;
      } catch (err) {
        syncErrors.push(`${n.e164}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return NextResponse.json({ success: true, data: imported, synced, sync_errors: syncErrors }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof VoiceNotConfiguredError) {
      return NextResponse.json({ success: false, error: error.message, code: 'VOICE_NOT_CONFIGURED' }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Phone Numbers] import error:', message);
    const status = /twilio|authenticate|20003|401/i.test(message) ? 502 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
