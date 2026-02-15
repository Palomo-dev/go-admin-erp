/**
 * Twilio Verify Service — Verificación OTP
 * GO Admin ERP
 *
 * Envía y verifica códigos OTP via SMS, WhatsApp o llamada.
 * Usa Twilio Verify API (no consume créditos de comunicación).
 */

import { getMasterClient, getVerifyServiceSid, formatE164 } from './twilioConfig';
import type { VerifySendParams, VerifyCheckParams, VerifyResult } from './twilioTypes';

class TwilioVerifyService {
  /**
   * Envía un código OTP al número proporcionado.
   */
  async sendCode(params: VerifySendParams): Promise<VerifyResult> {
    try {
      const client = getMasterClient();
      const serviceSid = getVerifyServiceSid();
      const to = formatE164(params.to);

      const verification = await client.verify.v2
        .services(serviceSid)
        .verifications.create({
          to,
          channel: params.channel || 'sms',
        });

      return {
        success: true,
        status: verification.status,
        sid: verification.sid,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Error enviando código OTP';
      console.error('[TwilioVerify] Error enviando código:', errMsg);
      return { success: false, error: errMsg };
    }
  }

  /**
   * Verifica un código OTP proporcionado por el usuario.
   */
  async checkCode(params: VerifyCheckParams): Promise<VerifyResult> {
    try {
      const client = getMasterClient();
      const serviceSid = getVerifyServiceSid();
      const to = formatE164(params.to);

      const verificationCheck = await client.verify.v2
        .services(serviceSid)
        .verificationChecks.create({
          to,
          code: params.code,
        });

      return {
        success: verificationCheck.status === 'approved',
        status: verificationCheck.status,
        sid: verificationCheck.sid,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Error verificando código OTP';
      console.error('[TwilioVerify] Error verificando código:', errMsg);
      return { success: false, error: errMsg };
    }
  }
}

export const twilioVerifyService = new TwilioVerifyService();
export default TwilioVerifyService;
