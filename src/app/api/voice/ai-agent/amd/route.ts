/**
 * POST /api/voice/ai-agent/amd — veredicto ASÍNCRONO de la detección de
 * contestadora (`asyncAmdStatusCallback`) de las llamadas del agente IA.
 *
 * Por qué existe (2026-10-07, org 125): con AMD síncrono Twilio retenía la
 * llamada en silencio hasta tener veredicto (hasta 30 s) y la gente colgaba
 * antes de oír al agente. Ahora el TwiML del agente arranca al contestar y el
 * veredicto llega aquí (ver `voiceAgent/amd.ts`).
 *
 * Twilio manda `CallSid`, `AccountSid`, `AnsweredBy` y `MachineDetectionDuration`.
 *  - `machine_*` o `fax`: se cierra la fila (`voiceAgent/cierreAmd.ts`: misma
 *    guarda atómica de estado vivo y devolución de la reserva reclamada en la
 *    misma escritura) y DESPUÉS se cuelga por la API de Twilio.
 *  - `human` o `unknown` (= persona, a propósito): no se toca nada.
 *
 * Seguridad (fail-closed):
 *  - Firma de Twilio verificada SIEMPRE y antes de tocar la base: sin firma
 *    válida → 401 y nada se escribe ni se cuelga.
 *  - La organización sale de la fila `voice_agent_calls` (callId de la query),
 *    jamás del cuerpo; y quien firma debe ser la cuenta de ESA organización.
 *  - El `CallSid` firmado debe ser el de la fila: un veredicto de otra llamada
 *    no cierra ni cuelga esta.
 *
 * Pública en el middleware por el prefijo `/api/voice/` (webhooks de Twilio).
 */

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server-service';
import { verifyTwilioWebhook, WebhookError } from '@/lib/security/webhookSignatures';
import { accountSidMatchesOrg } from '@/lib/services/crm/voiceContextService';
import { clasificarAnsweredBy, debeColgarPorAmd } from '@/lib/services/crm/voiceAgent/amd';
import { cerrarLlamadaPorAmd, type FilaVacParaAmd } from '@/lib/services/crm/voiceAgent/cierreAmd';
import { colgarLlamadaDelAgente } from '@/lib/services/crm/voiceAgentService';

export const runtime = 'nodejs';

const OK = () => new NextResponse('OK', { status: 200 });

export async function POST(request: Request) {
  let params: Record<string, string>;
  let accountSid: string;
  try {
    ({ params, accountSid } = await verifyTwilioWebhook(request));
  } catch (err) {
    if (err instanceof WebhookError) {
      console.warn('[AI Agent AMD] Rechazado:', err.code);
      return new NextResponse('Unauthorized', { status: 401 });
    }
    throw err;
  }

  const callId = new URL(request.url).searchParams.get('callId') || '';
  const callSid = params.CallSid || '';
  const answeredBy = params.AnsweredBy || '';
  const duracionMs = params.MachineDetectionDuration || null;
  if (!callId || !callSid) {
    console.warn('[AI Agent AMD] Sin callId o sin CallSid: no hay llamada que correlacionar');
    return OK();
  }

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('voice_agent_calls')
      .select('id, organization_id, call_id, status, provider_call_sid, credits_reserved, credits_settled_at')
      .eq('id', callId)
      .maybeSingle();
    if (error) throw error;
    const vac = data as (FilaVacParaAmd & { status: string }) | null;
    if (!vac) {
      console.warn('[AI Agent AMD] Sin correlación para', callId);
      return OK();
    }

    if (!(await accountSidMatchesOrg(vac.organization_id, accountSid, supabase))) {
      console.warn('[AI Agent AMD] AccountSid ajeno a la org de la llamada', { org: vac.organization_id });
      return new NextResponse('Forbidden', { status: 403 });
    }

    if (vac.provider_call_sid && vac.provider_call_sid !== callSid) {
      console.warn('[AI Agent AMD] CallSid distinto al de la fila: se ignora', { org: vac.organization_id, callId });
      return OK();
    }

    const clase = clasificarAnsweredBy(answeredBy);
    console.log('[AI Agent AMD] Veredicto', { org: vac.organization_id, callId, answeredBy: answeredBy || null, clase, duracionMs });

    // Persona o `unknown`: la conversación ya está en marcha; no se toca nada.
    if (!debeColgarPorAmd(answeredBy)) return OK();

    const r = await cerrarLlamadaPorAmd(supabase, vac, answeredBy, callSid);
    if (!r.cerrada) {
      // La fila ya estaba cerrada (colgaron antes del veredicto, o un reintento
      // de este mismo callback): no hay llamada viva que colgar.
      console.log('[AI Agent AMD] La fila ya estaba cerrada: no se cuelga', { org: vac.organization_id, callId });
      return OK();
    }

    try {
      const colgada = await colgarLlamadaDelAgente(vac.organization_id, callSid, supabase);
      if (!colgada) console.log('[AI Agent AMD] La llamada ya no estaba en curso', { org: vac.organization_id, callId });
    } catch (err) {
      // La fila ya quedó cerrada como buzón y sin reserva; si Twilio no colgó,
      // el ws-server la corta por silencio o por el tope de duración y no
      // cobra (la reserva figura conciliada). Se deja en el log para revisar.
      console.error('[AI Agent AMD] No se pudo colgar por la API de Twilio:', err instanceof Error ? err.message : err, {
        org: vac.organization_id,
        callId,
      });
    }
    return OK();
  } catch (error) {
    console.error('[AI Agent AMD] Error:', error instanceof Error ? error.message : error);
    // Twilio reintenta ante 5xx: no se traga el fallo con un 200 mentiroso.
    return new NextResponse('Error', { status: 500 });
  }
}
