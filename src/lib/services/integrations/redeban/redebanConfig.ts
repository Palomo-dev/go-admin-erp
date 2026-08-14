// ============================================================
// Redeban Colombia — Configuracion y constantes
// ============================================================

// URLs base de Redeban
// Sandbox no-card API: https://noccapi-stg.redeban.com
// Production no-card API: https://noccapi.redeban.com
// Sandbox dashboard: https://dashboard-stg.redeban.com
// Production dashboard: https://dashboard.redeban.com

export type RedebanEnvironment = 'sandbox' | 'production';

const REDEBAN_BASE_URLS: Record<RedebanEnvironment, string> = {
  sandbox: 'https://noccapi-stg.redeban.com',
  production: 'https://noccapi.redeban.com',
};

export function getRedebanBaseUrl(environment: RedebanEnvironment): string {
  return REDEBAN_BASE_URLS[environment];
}

// Conector y provider codes en la BD
export const REDEBAN_PROVIDER_CODE = 'redeban';
export const REDEBAN_QR_CONNECTOR_CODE = 'redeban_qr';

// Auth-Token generation: Base64(APP_CODE;TIMESTAMP;SHA256(APP_KEY+TIMESTAMP))
// TIMESTAMP format: Unix epoch seconds
