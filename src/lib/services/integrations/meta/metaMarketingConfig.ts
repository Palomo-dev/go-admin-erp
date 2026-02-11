// ============================================================
// Configuración de Meta Marketing para clientes de GO Admin ERP
// ============================================================

/** URL base del Graph API */
export const META_GRAPH_API_URL = 'https://graph.facebook.com' as const;

/** Versión del Graph API */
export const META_API_VERSION = 'v19.0' as const;

/** URL completa base */
export function getMetaApiUrl(): string {
  return `${META_GRAPH_API_URL}/${META_API_VERSION}`;
}

/** Mapeo de propósitos de credenciales en integration_credentials */
export const META_CREDENTIAL_PURPOSES = {
  ACCESS_TOKEN: 'access_token',
  APP_SECRET: 'app_secret',
  BUSINESS_ID: 'business_id',
  PIXEL_ID: 'pixel_id',
  CATALOG_ID: 'catalog_id',
} as const;

/** Permisos requeridos del token */
export const META_REQUIRED_SCOPES = [
  'catalog_management',
  'business_management',
  'ads_management',
] as const;

/** URL de Facebook OAuth Dialog */
export const META_OAUTH_DIALOG_URL = 'https://www.facebook.com' as const;

/** Construir URL de autorización OAuth */
export function buildMetaOAuthUrl(state: string): string {
  const appId = process.env.META_APP_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/meta/oauth/callback`;
  const scopes = META_REQUIRED_SCOPES.join(',');

  return (
    `${META_OAUTH_DIALOG_URL}/${META_API_VERSION}/dialog/oauth` +
    `?client_id=${appId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${scopes}` +
    `&state=${encodeURIComponent(state)}` +
    `&response_type=code`
  );
}

/** Eventos estándar del Pixel */
export const META_PIXEL_EVENTS = [
  'PageView',
  'ViewContent',
  'AddToCart',
  'InitiateCheckout',
  'Purchase',
  'Search',
  'Lead',
  'CompleteRegistration',
  'Subscribe',
  'Schedule',
] as const;

/** Mapeo de status de producto GO Admin → Facebook availability */
export function mapProductAvailability(
  status: string | null
): 'in stock' | 'out of stock' {
  if (!status) return 'out of stock';
  const active = ['active', 'activo', 'available', 'disponible'];
  return active.includes(status.toLowerCase()) ? 'in stock' : 'out of stock';
}

/** Formatear precio para Facebook: "50000 COP" */
export function formatFacebookPrice(
  price: number | null,
  currency: string = 'COP'
): string {
  if (!price || price <= 0) return `0 ${currency}`;
  return `${Math.round(price)} ${currency}`;
}

/** Eventos de webhook relevantes */
export const META_WEBHOOK_EVENTS = [
  'catalog_updates',
  'feed_alerts',
] as const;
