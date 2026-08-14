// ============================================================
// Bancolombia API Directa — Configuracion y constantes
// ============================================================

// URLs base de Bancolombia
// Sandbox API: https://gw-sandbox-qa.apps.ambientesbc.com
// Production API: https://gw.apps.ambientesbc.com

export type BancolombiaEnvironment = 'sandbox' | 'production';

const BANCOLOMBIA_BASE_URLS: Record<BancolombiaEnvironment, string> = {
  sandbox: 'https://gw-sandbox-qa.apps.ambientesbc.com',
  production: 'https://gw.apps.ambientesbc.com',
};

export function getBancolombiaBaseUrl(environment: BancolombiaEnvironment): string {
  return BANCOLOMBIA_BASE_URLS[environment];
}

// Conector y provider codes en la BD
export const BANCOLOMBIA_PROVIDER_CODE = 'bancolombia';
export const BANCOLOMBIA_QR_CONNECTOR_CODE = 'bancolombia_qr';

// Scopes requeridos para Payments Button
export const BANCOLOMBIA_SCOPES = 'Transfer-Intention:write:app Transfer-Intention:read:app Refund:write:app';

// Estados de transferencia callback
export const BANCOLOMBIA_TRANSFER_STATUSES = ['pending', 'approved', 'rejected'] as const;
