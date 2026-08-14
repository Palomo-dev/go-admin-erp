// ============================================================
// Redeban Colombia — Tipos TypeScript
// ============================================================

// --- Configuracion y credenciales ---

export type { RedebanEnvironment } from './redebanConfig';

export interface RedebanCredentials {
  serverAppCode: string;
  serverAppKey: string;
  environment: 'sandbox' | 'production';
}

// --- Generacion de QR ---

export interface RedebanQrRequest {
  amount: number;
  currency: string;
  reference: string;
  description: string;
  expiresAt: string;
  terminalId?: string;
  merchantName?: string;
}

export interface RedebanQrResponse {
  id: string;
  qr_string: string;
  qr_image_base64?: string;
  status: string;
  expires_at: string;
  reference: string;
}

// --- Estado de transaccion ---

export type RedebanTransactionStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'cancelled';

export interface RedebanTransactionResponse {
  id: string;
  status: RedebanTransactionStatus;
  amount: number;
  currency: string;
  reference: string;
  authorization_code?: string;
  created_at: string;
  paid_at?: string;
}

// --- Webhook ---

export interface RedebanWebhookPayload {
  transaction_id: string;
  status: RedebanTransactionStatus;
  amount: number;
  currency: string;
  reference: string;
  authorization_code?: string;
  timestamp: string;
  signature?: string;
}

// --- Health check ---

export interface RedebanHealthCheckResult {
  valid: boolean;
  message: string;
  merchantName?: string;
}
