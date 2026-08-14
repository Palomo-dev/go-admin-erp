// ============================================================
// Mono (Bre-B) Colombia — Configuracion y constantes
// ============================================================

// URLs base de Mono
// Sandbox API: https://sandbox.api.cuentamono.com
// Production API: https://api.cuentamono.com

export type MonoEnvironment = 'sandbox' | 'production';

const MONO_BASE_URLS: Record<MonoEnvironment, string> = {
  sandbox: 'https://sandbox.api.cuentamono.com',
  production: 'https://api.cuentamono.com',
};

export function getMonoBaseUrl(environment: MonoEnvironment): string {
  return MONO_BASE_URLS[environment];
}

// Conector y provider codes en la BD
export const MONO_PROVIDER_CODE = 'breb';
export const MONO_CONNECTOR_CODE = 'breb_mono';

// Autenticacion: OAuth 2.0 Client Credentials
// POST /oauth/token con grant_type=client_credentials

// Eventos webhook de collections
export const MONO_COLLECTION_EVENTS = [
  'collection.ready',
  'collection.attempt_successful',
  'collection.attempt_unsuccessful',
  'collection.paid',
  'collection.minimum_paid',
  'collection.expired',
  'collection.cancelled',
] as const;
