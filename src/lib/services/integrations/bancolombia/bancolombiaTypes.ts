// ============================================================
// Bancolombia API Directa — Tipos TypeScript
// ============================================================

// --- Configuracion y credenciales ---

export type { BancolombiaEnvironment } from './bancolombiaConfig';

export interface BancolombiaCredentials {
  clientId: string;
  clientSecret: string;
  commerceTransferButtonId: string;
  environment: 'sandbox' | 'production';
}

// --- OAuth token ---

export interface BancolombiaTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

// --- Registro de intencion de transferencia ---

export interface BancolombiaTransferRegistryRequest {
  commerceTransferButtonId?: string;
  transferReference: string;
  transferDescription: string;
  transferAmount: number;
  commerceUrl: string;
  confirmationURL: string;
}

export interface BancolombiaTransferRegistryResponse {
  transferCode: string;
  redirectURL: string;
  transferState: string;
  transferReference: string;
  transferAmount: number;
}

// --- Validacion de transferencia ---

export interface BancolombiaTransferValidateResponse {
  transferCode: string;
  transferState: string;
  transferReference: string;
  transferAmount: number;
  transactionId?: string;
}

// --- Reembolso (refund) ---

export interface BancolombiaRefundRequest {
  transferCode: string;
  refundAmount: number;
  refundReason: string;
}

export interface BancolombiaRefundResponse {
  refundCode: string;
  refundState: string;
  refundAmount: number;
}

// --- Webhook / notificacion callback ---

export interface BancolombiaWebhookPayload {
  transferCode: string;
  transferState: 'pending' | 'approved' | 'rejected';
  transferReference: string;
  transferAmount: number;
  transactionId?: string;
}

// --- Health check ---

export interface BancolombiaHealthCheckResult {
  valid: boolean;
  message: string;
}
