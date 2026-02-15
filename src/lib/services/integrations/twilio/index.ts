/**
 * Twilio Integration — Exports
 * GO Admin ERP
 */

// Servicio principal
export { twilioService } from './twilioService';

// Subcuentas
export {
  getOrCreateSubaccount,
  getCommSettings,
  suspendSubaccount,
  reactivateSubaccount,
} from './twilioSubaccounts';

// Verificación OTP
export { twilioVerifyService } from './twilioVerifyService';

// Webhooks
export {
  validateTwilioSignature,
  handleIncomingMessage,
  handleStatusCallback,
  handleIncomingVoice,
} from './twilioWebhook';

// Configuración
export {
  getMasterClient,
  getSubaccountClient,
  getMasterPhoneNumber,
  getMasterWhatsAppNumber,
  getVerifyServiceSid,
  getWebhookBaseUrl,
  formatE164,
  formatWhatsApp,
} from './twilioConfig';

// Tipos
export type {
  CommChannel,
  MessageDirection,
  MessageStatus,
  SendMessageParams,
  SendMessageResult,
  CommSettings,
  CommUsageLog,
  TwilioSubaccount,
  TwilioIncomingMessage,
  TwilioStatusCallback,
  TwilioVoiceWebhook,
  VerifySendParams,
  VerifyCheckParams,
  VerifyResult,
  CommCreditsStatus,
} from './twilioTypes';

export { InsufficientCreditsError, TwilioConfigError } from './twilioTypes';
