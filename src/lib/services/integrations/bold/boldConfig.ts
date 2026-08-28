// ============================================================
// Bold Colombia — Configuracion y constantes
// ============================================================

// URL base API Link e Integrations (datáfono)
const BOLD_INTEGRATIONS_BASE_URL = 'https://integrations.api.bold.co';

// URL base consulta transacciones
const BOLD_PAYMENTS_BASE_URL = 'https://payments.api.bold.co';

/**
 * Retorna la URL base de integraciones segun el ambiente.
 * Bold usa la misma URL para sandbox y production; el ambiente se
 * determina por la llave de identidad utilizada.
 */
export function getBoldIntegrationsBaseUrl(): string {
  return BOLD_INTEGRATIONS_BASE_URL;
}

/**
 * Retorna la URL base de consulta de transacciones.
 */
export function getBoldPaymentsBaseUrl(): string {
  return BOLD_PAYMENTS_BASE_URL;
}

// Mapeo de credential_type y purpose para integration_credentials
export const BOLD_CREDENTIAL_PURPOSES = {
  IDENTITY_KEY: { credential_type: 'api_key', purpose: 'identity_key' },
  SECRET_KEY: { credential_type: 'secret', purpose: 'secret_key' },
} as const;

// Codigos del provider y conectores en la BD
export const BOLD_PROVIDER_CODE = 'bold';
export const BOLD_CONNECTOR_LINK = 'bold_link';
export const BOLD_CONNECTOR_POS = 'bold_pos';

// IDs fijos del provider y conectores Bold en Supabase
export const BOLD_PROVIDER_ID = '67e3749b-d8e5-4c0a-ab23-309e46064cad';
export const BOLD_CONNECTOR_LINK_ID = '6d732ae3-e9ff-41be-9d75-aa29ba86d927';
export const BOLD_CONNECTOR_POS_ID = '5ddaf08b-cd11-41b8-b772-350ca176239a';
