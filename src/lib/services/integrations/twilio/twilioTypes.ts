/**
 * Twilio Integration — Tipos e Interfaces
 * GO Admin ERP
 */

// ─── Canales de comunicación ────────────────────────────
export type CommChannel = 'sms' | 'whatsapp' | 'voice';
export type MessageDirection = 'inbound' | 'outbound';
export type MessageStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'undelivered'
  | 'failed'
  | 'received'
  | 'read';

// ─── Envío de mensajes ─────────────────────────────────
export interface SendMessageParams {
  orgId: number;
  channel: CommChannel;
  to: string;
  body: string;
  module?: string;
  mediaUrl?: string[];
  metadata?: Record<string, unknown>;
}

export interface SendMessageResult {
  success: boolean;
  messageSid?: string;
  status?: string;
  error?: string;
  creditsUsed?: number;
}

// ─── Configuración de comunicaciones por org ────────────
export interface CommSettings {
  id: string;
  organization_id: number;
  sms_remaining: number | null;
  whatsapp_remaining: number | null;
  voice_minutes_remaining: number | null;
  twilio_subaccount_sid: string | null;
  twilio_subaccount_auth_token: string | null;
  phone_number: string | null;
  whatsapp_number: string | null;
  voice_agent_enabled: boolean;
  voice_agent_config: Record<string, unknown>;
  is_active: boolean;
  credits_reset_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Registro de uso ───────────────────────────────────
export interface CommUsageLog {
  id: string;
  organization_id: number;
  channel: CommChannel;
  credits_used: number;
  twilio_message_sid: string | null;
  recipient: string;
  status: string;
  direction: MessageDirection;
  module: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ─── Subcuentas Twilio ─────────────────────────────────
export interface TwilioSubaccount {
  sid: string;
  authToken: string;
  friendlyName: string;
  status: string;
}

// ─── Webhooks ──────────────────────────────────────────
export interface TwilioIncomingMessage {
  MessageSid: string;
  AccountSid: string;
  From: string;
  To: string;
  Body: string;
  NumMedia: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
}

export interface TwilioStatusCallback {
  MessageSid: string;
  MessageStatus: MessageStatus;
  AccountSid: string;
  From: string;
  To: string;
  ErrorCode?: string;
  ErrorMessage?: string;
}

export interface TwilioVoiceWebhook {
  CallSid: string;
  AccountSid: string;
  From: string;
  To: string;
  CallStatus: string;
  Direction: string;
}

// ─── Verify (OTP) ──────────────────────────────────────
export interface VerifySendParams {
  to: string;
  channel?: 'sms' | 'whatsapp' | 'call';
}

export interface VerifyCheckParams {
  to: string;
  code: string;
}

export interface VerifyResult {
  success: boolean;
  status?: string;
  sid?: string;
  error?: string;
}

// ─── Créditos ──────────────────────────────────────────
export interface CommCreditsStatus {
  sms_remaining: number | null;
  whatsapp_remaining: number | null;
  voice_minutes_remaining: number | null;
  voice_agent_enabled: boolean;
  is_active: boolean;
  credits_reset_at: string | null;
}

// ─── Errores personalizados ────────────────────────────
export class InsufficientCreditsError extends Error {
  channel: CommChannel;
  remaining: number | null;

  constructor(channel: CommChannel, remaining: number | null) {
    super(`Créditos insuficientes para ${channel}. Restantes: ${remaining ?? 'N/A'}`);
    this.name = 'InsufficientCreditsError';
    this.channel = channel;
    this.remaining = remaining;
  }
}

export class TwilioConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TwilioConfigError';
  }
}
