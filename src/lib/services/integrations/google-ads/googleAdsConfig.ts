// ============================================================
// Configuración de Google Ads API para GO Admin ERP
// ============================================================

/** URL base de Google Ads API REST */
export const GOOGLE_ADS_API_URL = 'https://googleads.googleapis.com' as const;

/** Versión de la API */
export const GOOGLE_ADS_API_VERSION = 'v18' as const;

/** URL completa base */
export function getGoogleAdsApiUrl(): string {
  return `${GOOGLE_ADS_API_URL}/${GOOGLE_ADS_API_VERSION}`;
}

/** URL de Google OAuth 2.0 */
export const GOOGLE_OAUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth' as const;

/** URL para intercambiar tokens */
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token' as const;

/** Scope requerido para Google Ads API */
export const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords' as const;

/** Mapeo de propósitos de credenciales en integration_credentials */
export const GOOGLE_ADS_CREDENTIAL_PURPOSES = {
  REFRESH_TOKEN: 'refresh_token',
  CUSTOMER_ID: 'customer_id',
  CONVERSION_ACTION_ID: 'conversion_action_id',
  CONVERSION_ID: 'conversion_id',
  CONVERSION_LABEL: 'conversion_label',
} as const;

/** Código del connector en integration_connectors */
export const GOOGLE_ADS_CONNECTOR_CODE = 'google_ads' as const;

/** Construir URL de autorización OAuth de Google */
export function buildGoogleOAuthUrl(state: string): string {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google-ads/oauth/callback`;

  return (
    `${GOOGLE_OAUTH_URL}` +
    `?client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(GOOGLE_ADS_SCOPE)}` +
    `&state=${encodeURIComponent(state)}` +
    `&response_type=code` +
    `&access_type=offline` +
    `&prompt=consent`
  );
}

/** Categorías de conversión disponibles para GO Admin */
export const GOOGLE_ADS_CONVERSION_CATEGORIES = [
  { value: 'PURCHASE', label: 'Compra', description: 'Ventas POS o e-commerce' },
  { value: 'BOOK_APPOINTMENT', label: 'Reserva', description: 'Reservas PMS o citas' },
  { value: 'LEAD', label: 'Lead', description: 'Formularios de contacto, cotizaciones' },
  { value: 'SIGNUP', label: 'Registro', description: 'Registros de usuario' },
] as const;
