// ============================================================
// SendGrid Email — Configuración y constantes
// ============================================================

export const SENDGRID_BASE_URL = 'https://api.sendgrid.com/v3';

// Mapeo de credential_type y purpose para integration_credentials
export const SENDGRID_CREDENTIAL_PURPOSES = {
  API_KEY: { credential_type: 'api_key', purpose: 'api_key' },
  FROM_EMAIL: { credential_type: 'config', purpose: 'from_email' },
  FROM_NAME: { credential_type: 'config', purpose: 'from_name' },
} as const;

// Conector y provider codes en la BD
export const SENDGRID_CONNECTOR_CODE = 'sendgrid_email';
export const SENDGRID_PROVIDER_CODE = 'sendgrid';

// Prefijo esperado para API Key
export const SENDGRID_API_KEY_PREFIX = 'SG.';

// Límites de la API
export const SENDGRID_LIMITS = {
  MAX_PERSONALIZATIONS: 1000,
  MAX_RECIPIENTS_PER_PERSONALIZATION: 1000,
  MAX_ATTACHMENT_SIZE_MB: 30,
  MAX_CATEGORIES: 10,
  MAX_CATEGORY_LENGTH: 255,
} as const;

// Scopes mínimos requeridos para el servicio
export const SENDGRID_REQUIRED_SCOPES = [
  'mail.send',
] as const;
