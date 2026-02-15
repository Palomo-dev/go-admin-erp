/**
 * Voice Agent Service — Orquestador del agente de voz IA
 * GO Admin ERP
 *
 * Conecta Twilio Media Stream con OpenAI Realtime API.
 * Maneja el ciclo de vida completo de una llamada con IA.
 */

import WebSocket from 'ws';
import { supabase } from '@/lib/supabase/config';
import { getCommSettings } from '../twilioSubaccounts';
import { RealtimeSession, type RealtimeSessionConfig } from './realtimeSession';
import type { VoiceAgentContext } from './voiceAgentPrompts';
import { commCreditsService } from '@/lib/services/commCreditsService';

// ─── Tipos ──────────────────────────────────────────────

export interface VoiceAgentCallConfig {
  orgId: number;
  callSid: string;
  callerNumber: string;
  twilioStreamWs: WebSocket;
  streamSid?: string;
}

interface ActiveSession {
  realtimeSession: RealtimeSession;
  callSid: string;
  orgId: number;
  startedAt: Date;
  streamSid: string;
}

// ─── Sesiones activas ───────────────────────────────────

const activeSessions = new Map<string, ActiveSession>();

class VoiceAgentService {
  /**
   * Inicia una sesión de Voice Agent para una llamada entrante.
   */
  async startSession(config: VoiceAgentCallConfig): Promise<boolean> {
    const { orgId, callSid, callerNumber, twilioStreamWs } = config;

    try {
      // 1. Verificar que Voice Agent esté habilitado
      const hasVoice = await commCreditsService.hasVoiceAgent(orgId);
      if (!hasVoice) {
        console.warn(`[VoiceAgent] Voice Agent no habilitado para org ${orgId}`);
        return false;
      }

      // 2. Verificar créditos de voz
      const hasCredits = await commCreditsService.hasCredits(orgId, 'voice');
      if (!hasCredits) {
        console.warn(`[VoiceAgent] Sin créditos de voz para org ${orgId}`);
        return false;
      }

      // 3. Obtener contexto de la organización
      const agentContext = await this.buildAgentContext(orgId);

      // 4. Crear sesión de OpenAI Realtime
      let streamSid = config.streamSid || '';

      const sessionConfig: RealtimeSessionConfig = {
        orgId,
        callSid,
        agentContext,
        onAudioDelta: (audioBase64) => {
          // Enviar audio de vuelta a Twilio Media Stream
          if (twilioStreamWs.readyState === WebSocket.OPEN && streamSid) {
            twilioStreamWs.send(
              JSON.stringify({
                event: 'media',
                streamSid,
                media: { payload: audioBase64 },
              })
            );
          }
        },
        onTranscript: (text, role) => {
          console.log(`[VoiceAgent] [${role}]: ${text}`);
        },
        onError: (error) => {
          console.error(`[VoiceAgent] Error en sesión ${callSid}:`, error.message);
        },
        onEnd: () => {
          this.endSession(callSid);
        },
      };

      const realtimeSession = new RealtimeSession(sessionConfig);
      await realtimeSession.connect();

      // 5. Manejar mensajes de Twilio Media Stream
      twilioStreamWs.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());

          switch (msg.event) {
            case 'start':
              streamSid = msg.start.streamSid;
              console.log(`[VoiceAgent] Stream iniciado: ${streamSid}`);
              break;

            case 'media':
              // Audio del llamante → OpenAI
              realtimeSession.sendAudio(msg.media.payload);
              break;

            case 'stop':
              console.log(`[VoiceAgent] Stream detenido: ${callSid}`);
              realtimeSession.disconnect();
              break;
          }
        } catch (error) {
          console.error('[VoiceAgent] Error procesando mensaje de Twilio:', error);
        }
      });

      twilioStreamWs.on('close', () => {
        console.log(`[VoiceAgent] WebSocket de Twilio cerrado: ${callSid}`);
        realtimeSession.disconnect();
        this.endSession(callSid);
      });

      // 6. Registrar sesión activa
      activeSessions.set(callSid, {
        realtimeSession,
        callSid,
        orgId,
        startedAt: new Date(),
        streamSid,
      });

      // 7. Registrar inicio en logs
      await supabase.from('comm_usage_logs').insert({
        organization_id: orgId,
        channel: 'voice',
        credits_used: 0,
        twilio_message_sid: callSid,
        recipient: callerNumber,
        status: 'in_progress',
        direction: 'inbound',
        module: 'voice_agent',
        metadata: { type: 'voice_agent_session', startedAt: new Date().toISOString() },
      });

      return true;
    } catch (error) {
      console.error(`[VoiceAgent] Error iniciando sesión ${callSid}:`, error);
      return false;
    }
  }

  /**
   * Finaliza una sesión de Voice Agent.
   */
  async endSession(callSid: string): Promise<void> {
    const session = activeSessions.get(callSid);
    if (!session) return;

    const duration = Math.ceil(
      (Date.now() - session.startedAt.getTime()) / 60000
    ); // minutos

    // Descontar créditos de voz por minutos usados
    if (duration > 0) {
      await supabase.rpc('deduct_comm_credits', {
        p_org_id: session.orgId,
        p_channel: 'voice',
        p_amount: duration,
      });
    }

    // Actualizar log
    await supabase
      .from('comm_usage_logs')
      .update({
        status: 'completed',
        credits_used: duration,
        metadata: {
          type: 'voice_agent_session',
          startedAt: session.startedAt.toISOString(),
          endedAt: new Date().toISOString(),
          durationMinutes: duration,
        },
      })
      .eq('twilio_message_sid', callSid)
      .eq('module', 'voice_agent');

    // Desconectar y limpiar
    session.realtimeSession.disconnect();
    activeSessions.delete(callSid);

    console.log(
      `[VoiceAgent] Sesión finalizada: ${callSid} (${duration} min)`
    );
  }

  /**
   * Construye el contexto del agente a partir de la org.
   */
  private async buildAgentContext(orgId: number): Promise<VoiceAgentContext> {
    const { data: org } = await supabase
      .from('organizations')
      .select('name, business_type')
      .eq('id', orgId)
      .single();

    const settings = await getCommSettings(orgId);
    const voiceConfig = (settings?.voice_agent_config || {}) as Record<string, string>;

    return {
      organizationName: org?.name || 'Negocio',
      organizationType: org?.business_type || 'hotel',
      language: voiceConfig.language || 'es',
      tone: voiceConfig.tone || 'profesional',
      customRules: voiceConfig.customRules || '',
      enabledModules: voiceConfig.enabledModules
        ? (voiceConfig.enabledModules as unknown as string[])
        : ['pms'],
    };
  }

  /**
   * Obtiene las sesiones activas.
   */
  getActiveSessions(): { callSid: string; orgId: number; duration: number }[] {
    return Array.from(activeSessions.values()).map((s) => ({
      callSid: s.callSid,
      orgId: s.orgId,
      duration: Math.ceil((Date.now() - s.startedAt.getTime()) / 60000),
    }));
  }

  /**
   * Genera TwiML para conectar una llamada con Media Stream.
   */
  getMediaStreamTwiml(webhookBaseUrl: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="es-MX">Conectando con nuestro asistente virtual. Un momento por favor.</Say>
  <Connect>
    <Stream url="wss://${new URL(webhookBaseUrl).host}/api/integrations/twilio/voice/media-stream" />
  </Connect>
</Response>`;
  }
}

export const voiceAgentService = new VoiceAgentService();
export default VoiceAgentService;
