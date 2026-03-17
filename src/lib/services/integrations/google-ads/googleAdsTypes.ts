// ============================================================
// Tipos e interfaces para la integración con Google Ads API
// ============================================================

/** Credenciales almacenadas en integration_credentials */
export interface GoogleAdsCredentials {
  refreshToken: string;
  customerId: string;
  conversionActionId?: string;
  conversionId?: string;       // AW-XXXXXXX (para gtag.js)
  conversionLabel?: string;    // Label para gtag.js
}

/** Respuesta del token OAuth de Google */
export interface GoogleOAuthTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

/** Cuenta accesible vía listAccessibleCustomers */
export interface GoogleAdsAccessibleCustomer {
  resourceName: string;
  customerId: string;
}

/** Info de una cuenta de Google Ads */
export interface GoogleAdsCustomerInfo {
  id: string;
  descriptiveName: string;
  currencyCode: string;
  timeZone: string;
  manager: boolean;
}

/** Resultado de un query GAQL */
export interface GoogleAdsQueryResult {
  results: Record<string, unknown>[];
  fieldMask: string;
  requestId: string;
}

/** Acción de conversión */
export interface GoogleAdsConversionAction {
  resourceName: string;
  id: string;
  name: string;
  category: string;
  type: string;
  status: string;
}

/** Conversión offline para subir */
export interface GoogleAdsOfflineConversion {
  conversionAction: string;
  conversionDateTime: string;
  conversionValue: number;
  currencyCode: string;
  gclid?: string;
  orderId?: string;
  userIdentifiers?: Array<{
    hashedEmail?: string;
    hashedPhoneNumber?: string;
  }>;
}

/** Resultado de subir conversiones */
export interface GoogleAdsUploadConversionResult {
  partialFailureError?: {
    code: number;
    message: string;
    details: unknown[];
  };
  results: Array<{
    conversionAction: string;
    conversionDateTime: string;
    orderId?: string;
  }>;
}

/** Resultado de health check */
export interface GoogleAdsHealthCheckResult {
  valid: boolean;
  message: string;
  customerIds?: string[];
}

/** Categorías de conversión soportadas */
export type GoogleAdsConversionCategory =
  | 'PURCHASE'
  | 'LEAD'
  | 'BOOK_APPOINTMENT'
  | 'SIGNUP'
  | 'PAGE_VIEW'
  | 'ADD_TO_CART'
  | 'BEGIN_CHECKOUT';

/** Métricas de campaña devueltas por GAQL */
export interface GoogleAdsCampaignMetrics {
  campaignId: string;
  campaignName: string;
  status: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  conversionsValue: number;
  ctr: number;
  averageCpc: number;
}

/** Estado de OAuth para el flujo de autorización */
export interface GoogleAdsOAuthState {
  organization_id: number;
  connection_id: string;
  user_id: string;
  ts: number;
}
