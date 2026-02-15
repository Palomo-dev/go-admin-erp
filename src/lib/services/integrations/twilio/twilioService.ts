/**
 * Twilio Service — Servicio principal de envío de mensajes
 * GO Admin ERP
 *
 * Punto de entrada único para enviar SMS, WhatsApp y realizar llamadas.
 * Gestiona créditos, subcuentas y logging automáticamente.
 */

import { supabase } from '@/lib/supabase/config';
import {
  getMasterClient,
  getSubaccountClient,
  getMasterPhoneNumber,
  getMasterWhatsAppNumber,
  formatE164,
  formatWhatsApp,
} from './twilioConfig';
import { getCommSettings } from './twilioSubaccounts';
import type {
  SendMessageParams,
  SendMessageResult,
  CommSettings,
} from './twilioTypes';
import { InsufficientCreditsError, TwilioConfigError } from './twilioTypes';

class TwilioService {
  /**
   * Envía un mensaje (SMS o WhatsApp) a un destinatario.
   * Verifica créditos, usa subcuenta si existe, y registra el uso.
   */
  async send(params: SendMessageParams): Promise<SendMessageResult> {
    const { orgId, channel, to, body, module, mediaUrl, metadata } = params;

    try {
      // 1. Obtener configuración de la organización
      const settings = await getCommSettings(orgId);
      if (!settings || !settings.is_active) {
        return { success: false, error: 'Comunicaciones no activas para esta organización' };
      }

      // 2. Verificar y descontar créditos
      const hasCredits = await this.deductCredits(orgId, channel);
      if (!hasCredits) {
        const remaining = channel === 'sms'
          ? settings.sms_remaining
          : channel === 'whatsapp'
            ? settings.whatsapp_remaining
            : settings.voice_minutes_remaining;
        throw new InsufficientCreditsError(channel, remaining);
      }

      // 3. Determinar cliente Twilio (subcuenta o master)
      const client = settings.twilio_subaccount_sid && settings.twilio_subaccount_auth_token
        ? getSubaccountClient(settings.twilio_subaccount_sid, settings.twilio_subaccount_auth_token)
        : getMasterClient();

      // 4. Determinar números de origen
      const from = this.getFromNumber(channel, settings);
      const formattedTo = channel === 'whatsapp' ? formatWhatsApp(to) : formatE164(to);

      // 5. Enviar mensaje
      const message = await client.messages.create({
        body,
        from,
        to: formattedTo,
        ...(mediaUrl && mediaUrl.length > 0 ? { mediaUrl } : {}),
        statusCallback: `${process.env.TWILIO_WEBHOOK_BASE_URL}/status-callback`,
      });

      // 6. Registrar en comm_usage_logs
      await this.logUsage({
        orgId,
        channel,
        recipient: to,
        messageSid: message.sid,
        status: message.status,
        module,
        metadata,
      });

      return {
        success: true,
        messageSid: message.sid,
        status: message.status,
        creditsUsed: 1,
      };
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        return { success: false, error: error.message };
      }
      if (error instanceof TwilioConfigError) {
        return { success: false, error: error.message };
      }

      const errMsg = error instanceof Error ? error.message : 'Error desconocido';
      console.error(`[TwilioService] Error enviando ${channel}:`, errMsg);
      return { success: false, error: errMsg };
    }
  }

  /**
   * Envía un SMS.
   */
  async sendSMS(
    orgId: number,
    to: string,
    body: string,
    module?: string
  ): Promise<SendMessageResult> {
    return this.send({ orgId, channel: 'sms', to, body, module });
  }

  /**
   * Envía un mensaje de WhatsApp.
   */
  async sendWhatsApp(
    orgId: number,
    to: string,
    body: string,
    module?: string,
    mediaUrl?: string[]
  ): Promise<SendMessageResult> {
    return this.send({ orgId, channel: 'whatsapp', to, body, module, mediaUrl });
  }

  /**
   * Obtiene el número de origen según el canal y la configuración de la org.
   */
  private getFromNumber(channel: string, settings: CommSettings): string {
    if (channel === 'whatsapp') {
      // Usar número de WhatsApp de la org o el maestro
      const waNumber = settings.whatsapp_number || process.env.TWILIO_WHATSAPP_NUMBER;
      if (!waNumber) throw new TwilioConfigError('No hay número de WhatsApp configurado');
      return waNumber.startsWith('whatsapp:') ? waNumber : `whatsapp:${waNumber}`;
    }

    // SMS: usar número de la org o el maestro
    return settings.phone_number || getMasterPhoneNumber();
  }

  /**
   * Descuenta créditos de comunicación de la organización.
   * Retorna true si hay créditos suficientes (o ilimitados).
   */
  private async deductCredits(orgId: number, channel: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('deduct_comm_credits', {
      p_org_id: orgId,
      p_channel: channel,
      p_amount: 1,
    });

    if (error) {
      console.error('[TwilioService] Error descontando créditos:', error);
      return false;
    }

    return data === true;
  }

  /**
   * Registra el uso de comunicaciones en comm_usage_logs.
   */
  private async logUsage(params: {
    orgId: number;
    channel: string;
    recipient: string;
    messageSid: string;
    status: string;
    module?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await supabase.from('comm_usage_logs').insert({
      organization_id: params.orgId,
      channel: params.channel,
      credits_used: 1,
      twilio_message_sid: params.messageSid,
      recipient: params.recipient,
      status: params.status,
      direction: 'outbound',
      module: params.module || null,
      metadata: params.metadata || {},
    });

    if (error) {
      console.error('[TwilioService] Error registrando uso:', error);
    }
  }
}

export const twilioService = new TwilioService();
export default TwilioService;
