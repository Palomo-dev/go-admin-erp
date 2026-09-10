import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getActiveProvider } from '@/lib/services/providerRegistry';
import { createCall } from '@/lib/services/crm/callManagementService';
import { getCommSettings } from '@/lib/services/integrations/twilio/twilioSubaccounts';
import { normalizeDialableE164 } from '@/lib/services/integrations/twilio/twilioConfig';
import { getTelephonySettings, pickCallerId, orgOwnsCallerId, filterOrgOwnedRefs } from '@/lib/services/crm/voiceContextService';
import { getTwilioWebhookOrigin } from '@/lib/security/webhookSignatures';
import Twilio from 'twilio';
import type { CallMode } from '@/lib/crm/enums';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/voice/call — Inicia una llamada saliente REST (legacy / F5-F6).
 *
 * Body: { to, from?, customer_id?, opportunity_id?, recording_enabled?, mode?: 'bridge' | 'ai_agent' }
 *
 * F3: el modo `browser` NO pasa por aquí (400 `USE_SDK`): el softphone hace
 * `device.connect()` y la fila `calls` la crea `/api/voice/twiml/outbound`
 * (elimina la doble marcación C10). `mode` y `status` usan los CHECK reales de
 * BD (C3). El bridge celular real vive en `/api/voice/bridge/initiate`.
 *
 * Ronda 3 (defecto N-1) — el cuerpo de la petición NO manda:
 * - `from` solo se acepta si es un número de ESTA organización
 *   (`orgOwnsCallerId`); si no viene, sale de `pickCallerId`, que rechaza el
 *   número global de la plataforma (gemelo de M2).
 * - `customer_id`/`opportunity_id` pasan por `filterOrgOwnedRefs` (gemelo de A2).
 * - `to` se valida con `normalizeDialableE164`, no con el formateador
 *   permisivo `formatE164` (gemelo de B1).
 */
export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext();
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.statusCode }
      );
    }
    throw err;
  }

  try {
    const body = await request.json();
    const { to, from, customer_id, opportunity_id, recording_enabled, mode } = body as {
      to?: string;
      from?: string;
      customer_id?: string;
      opportunity_id?: string;
      recording_enabled?: boolean;
      mode?: string;
    };

    if (!mode || mode === 'browser' || mode === 'click-to-call') {
      return NextResponse.json(
        { success: false, error: 'Las llamadas desde el navegador se inician con el softphone (device.connect); usa /api/voice/bridge/initiate para el celular', code: 'USE_SDK' },
        { status: 400 }
      );
    }
    const callMode: CallMode = mode === 'voice-agent' || mode === 'ai_agent' ? 'ai_agent' : mode === 'bridge' ? 'bridge' : 'manual';

    if (!to) {
      return NextResponse.json(
        { success: false, error: 'Falta el parámetro "to" (número destino)' },
        { status: 400 }
      );
    }

    // 1. Obtener provider de voz
    const provider = await getActiveProvider(ctx.organizationId, 'voice', ctx.supabase);
    if (!provider.isActive || provider.provider === 'none') {
      return NextResponse.json(
        { success: false, error: 'No hay proveedor de voz activo' },
        { status: 400 }
      );
    }

    const accountSid = provider.credentials.TWILIO_ACCOUNT_SID;
    const authToken = provider.credentials.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      return NextResponse.json(
        { success: false, error: 'Faltan credenciales de Twilio' },
        { status: 500 }
      );
    }

    // 2. Destino marcable (B1): `formatE164` convierte '12345' en '+5712345'.
    const formattedTo = normalizeDialableE164(to);
    if (!formattedTo) {
      return NextResponse.json(
        { success: false, error: 'El número de destino no es válido', code: 'INVALID_DESTINATION' },
        { status: 400 }
      );
    }

    // 3. Número de origen: SIEMPRE de la organización (M2/N-1).
    const settings = await getCommSettings(ctx.organizationId);
    const telephony = await getTelephonySettings(ctx.organizationId, ctx.supabase);
    let fromNumber: string;
    if (from) {
      if (!(await orgOwnsCallerId(ctx.organizationId, from, telephony, ctx.supabase))) {
        console.warn('[Voice Call] caller id ajeno a la organización', { org: ctx.organizationId });
        return NextResponse.json(
          { success: false, error: 'El número de origen no pertenece a esta organización', code: 'CALLER_ID_NOT_OWNED' },
          { status: 403 }
        );
      }
      fromNumber = from;
    } else {
      const picked = await pickCallerId(ctx.organizationId, telephony, ctx.supabase);
      const usable =
        picked.e164 && (picked.source !== 'platform' || process.env.VOICE_ALLOW_PLATFORM_CALLER_ID === 'true');
      if (!usable || !picked.e164) {
        return NextResponse.json(
          {
            success: false,
            error: 'La organización no tiene un número de salida configurado. Configúralo en Configuración, CRM, Telefonía.',
            code: 'NO_ORG_CALLER_ID',
          },
          { status: 400 }
        );
      }
      fromNumber = picked.e164;
    }

    // 4. Crear cliente Twilio
    const client = Twilio(accountSid, authToken);

    // 5. Construir URL de TwiML para salida.
    //    `TWILIO_WEBHOOK_BASE_URL` puede traer un path heredado
    //    (`https://app.goadmin.io/api/integrations/twilio`); usar el valor crudo
    //    generaba URLs 404. `getTwilioWebhookOrigin()` normaliza a origin, igual
    //    que el resto de rutas de voz, y falla explícito si no está definido.
    let webhookBase: string;
    try {
      webhookBase = getTwilioWebhookOrigin();
    } catch {
      return NextResponse.json(
        { success: false, error: 'TWILIO_WEBHOOK_BASE_URL no configurado', code: 'WEBHOOK_BASE_URL_MISSING' },
        { status: 500 }
      );
    }
    const twimlUrl = `${webhookBase}/api/voice/twiml/outbound`;
    const statusCallback = `${webhookBase}/api/voice/status`;

    const recordingEnabled = recording_enabled ?? settings?.voice_recording_enabled ?? false;

    // 6. Ids del cuerpo: solo se persisten si son de ESTA organización (A2/N-1).
    const refs = await filterOrgOwnedRefs(
      ctx.organizationId,
      { customerId: customer_id ?? null, opportunityId: opportunity_id ?? null },
      ctx.supabase
    );
    if (refs.rejected.length) {
      console.warn('[Voice Call] ids de otra organización descartados', { org: ctx.organizationId, rejected: refs.rejected.length });
    }

    // 7. Iniciar llamada
    const callInstance = await client.calls.create({
      to: formattedTo,
      from: fromNumber,
      url: twimlUrl,
      statusCallback,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      // A-2 (gemelo): NO se pide `record: true` aquí. Arrancaba la grabación en
      // cuanto contestaban, es decir ANTES de que el TwiML de
      // `/api/voice/twiml/outbound` reprodujera el aviso de la Ley 1581 — y
      // encima duplicaba la grabación, porque ese mismo TwiML ya trae
      // `<Dial record="record-from-answer-dual" recordingStatusCallback=…>`.
      // Ese `<Dial>` empieza a grabar al conectar la pata del cliente, que es
      // después del aviso: una sola grabación y con acta.
    });

    // 8. Registrar en BD
    const callRecord = await createCall(
      ctx.organizationId,
      {
        provider: 'twilio',
        provider_call_sid: callInstance.sid,
        direction: 'outbound',
        mode: callMode,
        from_number: fromNumber,
        to_number: formattedTo,
        customer_id: refs.customerId,
        opportunity_id: refs.opportunityId,
        user_id: ctx.userId,
        status: 'dialing',
        recording_enabled: recordingEnabled,
        metadata: refs.rejected.length ? { rejected_refs: refs.rejected } : {},
      },
      ctx.supabase
    );

    return NextResponse.json(
      {
        success: true,
        callSid: callInstance.sid,
        call: callRecord,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Voice Call] error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
