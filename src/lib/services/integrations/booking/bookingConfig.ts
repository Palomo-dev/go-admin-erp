// ============================================================
// Configuración de Booking.com Connectivity API
// URLs base, endpoints, constantes y utilidades
// ============================================================

// --- URLs Base ---

/** Servidor non-PCI (tarifas, disponibilidad, contenido) */
export const BOOKING_SUPPLY_URL = 'https://supply-xml.booking.com' as const;

/** Servidor PCI (reservas y datos sensibles) */
export const BOOKING_SECURE_URL = 'https://secure-supply-xml.booking.com' as const;

/** Servidor OAuth2 para tokens */
export const BOOKING_OAUTH_URL = 'https://account.booking.com' as const;

// --- Endpoints ---

export const BOOKING_ENDPOINTS = {
  // OAuth2
  TOKEN: '/oauth2/token',

  // Reservations API (OTA XML) — servidor PCI
  RESERVATIONS_NEW: '/hotels/ota/OTA_HotelResNotif',
  RESERVATIONS_MODIFIED: '/hotels/ota/OTA_HotelResModifyNotif',

  // Reservations API (B.XML)
  RESERVATIONS_BXML: '/xml/reservations',
  RESERVATIONS_SUMMARY: '/xml/reservationssummary',

  // Rates & Availability API (OTA XML) — servidor non-PCI
  AVAILABILITY: '/hotels/ota/OTA_HotelAvailNotif',
  RATES: '/hotels/ota/OTA_HotelRateAmountNotif',
  INVENTORY: '/hotels/ota/OTA_HotelInvNotif',

  // Rates & Availability (B.XML)
  AVAILABILITY_BXML: '/xml/availability',

  // Content API (OTA XML)
  CONTENT_UPDATE: '/hotels/ota/OTA_HotelDescriptiveContentNotif',
  CONTENT_READ: '/hotels/ota/OTA_HotelDescriptiveInfo',

  // Property API (JSON)
  PROPERTY_PRODUCT: '/hotels/ota/OTA_HotelProductNotif',
  PROPERTY_SUMMARY: '/hotels/ota/OTA_HotelSummaryNotif',

  // Connections API (JSON)
  CONNECTIONS: '/properties/connections',
} as const;

// --- Mapeo de propósitos de credenciales en integration_credentials ---

export const BOOKING_CREDENTIAL_PURPOSES = {
  MACHINE_CLIENT_ID: 'machine_client_id',
  MACHINE_CLIENT_SECRET: 'machine_client_secret',
  HOTEL_ID: 'hotel_id',
  ACCESS_TOKEN: 'access_token',
} as const;

// --- Configuración de polling ---

/** Intervalo de polling de reservas en milisegundos (20 seg recomendado) */
export const BOOKING_POLL_INTERVAL_MS = 20_000;

/** Espera entre acknowledge y siguiente GET (5 seg) */
export const BOOKING_ACK_DELAY_MS = 5_000;

/** Timeout para fallback email de Booking.com (30 min) */
export const BOOKING_FALLBACK_TIMEOUT_MS = 30 * 60 * 1_000;

/** Meses mínimos de disponibilidad a cargar */
export const BOOKING_MIN_AVAILABILITY_MONTHS = 12;

// --- Rate Limiting ---

export const BOOKING_RATE_LIMITS = {
  /** Requests por minuto general */
  DEFAULT_RPM: 60,
  /** Delay base para exponential backoff (ms) */
  BACKOFF_BASE_MS: 1_000,
  /** Máximo de reintentos */
  MAX_RETRIES: 3,
} as const;

// --- Token ---

/** Margen de seguridad para renovar token antes de expiración (seg) */
export const BOOKING_TOKEN_REFRESH_MARGIN_SEC = 60;

/** Duración típica del token (seg) */
export const BOOKING_TOKEN_DEFAULT_EXPIRY_SEC = 599;

// --- Helpers ---

/** Construir URL completa para endpoint non-PCI */
export function getSupplyUrl(endpoint: string): string {
  return `${BOOKING_SUPPLY_URL}${endpoint}`;
}

/** Construir URL completa para endpoint PCI (reservas) */
export function getSecureUrl(endpoint: string): string {
  return `${BOOKING_SECURE_URL}${endpoint}`;
}

/** Construir URL OAuth2 */
export function getOAuthUrl(endpoint: string): string {
  return `${BOOKING_OAUTH_URL}${endpoint}`;
}

/** Obtener ambiente actual */
export function getBookingEnvironment(): 'test' | 'production' {
  const env = process.env.BOOKING_ENVIRONMENT || 'test';
  return env === 'production' ? 'production' : 'test';
}

/** Headers estándar para requests XML */
export function getXmlHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/xml; charset=utf-8',
    'Accept': 'application/xml',
    'Accept-Encoding': 'gzip',
  };
}

/** Headers estándar para requests JSON */
export function getJsonHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json; charset=utf-8',
    'Accept': 'application/json',
  };
}

/** Generar RUID (Request Unique ID) para debugging */
export function generateRuid(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `goadmin-${timestamp}-${random}`;
}

/** Planes de comida: código → nombre legible */
export const MEAL_PLAN_LABELS: Record<string, string> = {
  RO: 'Solo Alojamiento',
  BB: 'Desayuno Incluido',
  HB: 'Media Pensión',
  FB: 'Pensión Completa',
  AI: 'Todo Incluido',
};

/** Connection types: código → nombre legible */
export const CONNECTION_TYPE_LABELS: Record<string, string> = {
  reservations: 'Reservas',
  rates_availability: 'Tarifas y Disponibilidad',
  content: 'Contenido',
  photos: 'Fotos',
  guest_reviews: 'Reseñas de Huéspedes',
  reporting: 'Reportes',
  promotions: 'Promociones',
  messaging: 'Mensajería',
  performance: 'Datos de Rendimiento',
  payments: 'Pagos',
};
