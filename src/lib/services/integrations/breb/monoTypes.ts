// ============================================================
// Mono (Bre-B) Colombia — Tipos TypeScript
// ============================================================

// --- Configuracion y credenciales ---

export type { MonoEnvironment } from './monoConfig';

export interface MonoCredentials {
  clientId: string;
  clientSecret: string;
  environment: 'sandbox' | 'production';
}

// --- OAuth token ---

export interface MonoTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

// --- Collections ---

export type MonoCollectionKeyType = 'PHONE' | 'EMAIL' | 'ID' | 'ALPHA' | 'BCODE';

export interface MonoCollectionRequest {
  amount: number;
  currency: string;
  key_type: MonoCollectionKeyType;
  key_value: string;
  description: string;
  expires_in: number;
  metadata?: Record<string, unknown>;
}

export type MonoCollectionStatus = 'ready' | 'paid' | 'expired' | 'cancelled';

export interface MonoCollectionResponse {
  id: string;
  status: MonoCollectionStatus;
  qr?: string;
  qr_image?: string;
  expires_at: string;
  amount: {
    amount: number;
    currency: string;
  };
  metadata?: Record<string, unknown>;
}

// --- Simulate payment (sandbox) ---

export interface MonoSimulatePaymentRequest {
  creditor_key_value: string;
  amount: {
    amount: number;
    currency: string;
  };
  error?: string;
}

// --- Webhook ---

export interface MonoWebhookPayload {
  event: string;
  data: {
    id: string;
    status: string;
    amount?: {
      amount: number;
      currency: string;
    };
    metadata?: Record<string, unknown>;
  };
}

// --- Health check ---

export interface MonoHealthCheckResult {
  valid: boolean;
  message: string;
}
