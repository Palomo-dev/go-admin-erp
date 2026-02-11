// ============================================================
// Configuración y constantes para TikTok Marketing
// ============================================================

/** URL base de la API de TikTok for Business */
export const TIKTOK_API_BASE_URL = 'https://business-api.tiktok.com';

/** Versión de la API */
export const TIKTOK_API_VERSION = 'v1.3' as const;

/** URL completa base */
export function getTikTokApiUrl(): string {
  return `${TIKTOK_API_BASE_URL}/open_api/${TIKTOK_API_VERSION}`;
}

/** Mapeo de propósitos de credenciales en integration_credentials */
export const TIKTOK_CREDENTIAL_PURPOSES = {
  ACCESS_TOKEN: 'access_token',
  APP_SECRET: 'app_secret',
  ADVERTISER_ID: 'advertiser_id',
  PIXEL_CODE: 'pixel_code',
  CATALOG_ID: 'catalog_id',
} as const;

/** Permisos requeridos de la app */
export const TIKTOK_REQUIRED_SCOPES = [
  'Pixel Management',
  'Catalog Management',
  'Ad Account Management',
] as const;

/** Eventos estándar del Pixel */
export const TIKTOK_PIXEL_EVENTS = [
  'ViewContent',
  'AddToCart',
  'AddToWishlist',
  'InitiateCheckout',
  'AddPaymentInfo',
  'PlaceAnOrder',
  'CompletePayment',
  'Contact',
  'SubmitForm',
  'Subscribe',
  'Search',
  'ClickButton',
] as const;

/** Mapeo de estado de producto GO Admin → TikTok availability */
export function mapTikTokAvailability(status: string): 'IN_STOCK' | 'OUT_OF_STOCK' | 'PREORDER' {
  switch (status) {
    case 'active':
      return 'IN_STOCK';
    case 'preorder':
      return 'PREORDER';
    default:
      return 'OUT_OF_STOCK';
  }
}

// ──────────────────────────────────────────────
// OAuth para TikTok Business API
// ──────────────────────────────────────────────

/** URL base del portal de autorización TikTok */
export const TIKTOK_AUTH_URL = 'https://business-api.tiktok.com/portal/auth';

/** Redirect URI para el callback OAuth */
export function getTikTokOAuthRedirectUri(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.goadmin.io';
  return `${baseUrl}/api/integrations/tiktok/oauth/callback`;
}

/** Construir URL completa de autorización OAuth de TikTok */
export function buildTikTokOAuthUrl(state: string): string {
  const appId = process.env.TIKTOK_APP_ID;
  if (!appId) throw new Error('TIKTOK_APP_ID no configurado');

  const redirectUri = getTikTokOAuthRedirectUri();
  const params = new URLSearchParams({
    app_id: appId,
    redirect_uri: redirectUri,
    state,
  });

  return `${TIKTOK_AUTH_URL}?${params.toString()}`;
}

/** Formatear precio para TikTok (string con centavos) */
export function formatTikTokPrice(price: number | null, currency: string = 'COP'): string {
  if (!price) return '0';
  // TikTok espera precio como string en la unidad base de la moneda
  return Math.round(price).toString();
}
