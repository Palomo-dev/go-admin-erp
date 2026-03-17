// ============================================================
// Configuración de Expedia Group Lodging Connectivity API
// URLs base, endpoints, constantes y utilidades
// ============================================================

// --- URLs Base ---

/** Servidor principal de APIs REST/XML (non-PCI) */
export const EXPEDIA_API_URL = 'https://services.expediapartnercentral.com' as const;

/** Servidor sandbox para pruebas */
export const EXPEDIA_SANDBOX_URL = 'https://services.expediapartnercentral.com' as const;

/** Servidor GraphQL */
export const EXPEDIA_GRAPHQL_URL = 'https://api.expediagroup.com/supply/lodging/graphql' as const;

/** Servidor OAuth2 para tokens (usado por GraphQL) */
export const EXPEDIA_OAUTH_URL = 'https://api.expediagroup.com/identity/oauth2/v3/token' as const;

// --- Endpoints ---

export const EXPEDIA_ENDPOINTS = {
  // OAuth2 (para GraphQL APIs)
  TOKEN: '/token',

  // Availability and Rates API (XML)
  AR_SET: '/eqc/ar',               // PUT: set availability/rates
  AR_GET: '/eqc/ar',               // GET: retrieve availability/rates

  // Booking Retrieval API (XML) — Pull model
  BR_GET: '/eqc/br',               // GET: retrieve bookings
  BR_CONFIRM: '/eqc/br',           // PUT: confirm booking

  // Booking Notification API (XML) — Push model (Expedia pushes to us)
  BN_ENDPOINT: '/eqc/bn',          // Webhook receiver

  // Product API (JSON REST)
  PRODUCT_ROOM_TYPES: '/properties/{propertyId}/roomTypes',
  PRODUCT_RATE_PLANS: '/properties/{propertyId}/roomTypes/{roomTypeId}/ratePlans',

  // Property API (JSON REST)
  PROPERTY_INFO: '/properties/{propertyId}',

  // Image API (JSON REST)
  IMAGES: '/properties/{propertyId}/images',

  // GraphQL — Reservation Management
  GRAPHQL: '/graphql',
} as const;

// --- Mapeo de propósitos de credenciales en integration_credentials ---

export const EXPEDIA_CREDENTIAL_PURPOSES = {
  EQC_USERNAME: 'eqc_username',
  EQC_PASSWORD: 'eqc_password',
  PROPERTY_ID: 'property_id',
  ACCESS_TOKEN: 'access_token',
} as const;

// --- Configuración de polling ---

/** Intervalo de polling de reservas en milisegundos (recomendado: no más de cada 5 min) */
export const EXPEDIA_POLL_INTERVAL_MS = 5 * 60 * 1_000;

/** Meses mínimos de disponibilidad a cargar (Expedia soporta hasta 2 años) */
export const EXPEDIA_MIN_AVAILABILITY_MONTHS = 12;

/** Máximo de días por request AR (365) */
export const EXPEDIA_MAX_AR_DAYS = 365;

// --- Rate Limiting ---

export const EXPEDIA_RATE_LIMITS = {
  /** Requests por segundo general */
  DEFAULT_RPS: 20,
  /** AR: máx requests/segundo */
  AR_RPS: 50,
  /** BR: máx requests/segundo */
  BR_RPS: 50,
  /** Delay base para exponential backoff (ms) */
  BACKOFF_BASE_MS: 1_000,
  /** Máximo de reintentos */
  MAX_RETRIES: 3,
} as const;

// --- Token ---

/** Margen de seguridad para renovar token antes de expiración (seg) */
export const EXPEDIA_TOKEN_REFRESH_MARGIN_SEC = 60;

/** Duración típica del token OAuth2 (seg) — ~30 min */
export const EXPEDIA_TOKEN_DEFAULT_EXPIRY_SEC = 1_800;

// --- Helpers ---

/** Construir URL completa para endpoint de API */
export function getApiUrl(endpoint: string): string {
  const env = getExpediaEnvironment();
  const base = env === 'production' ? EXPEDIA_API_URL : EXPEDIA_SANDBOX_URL;
  return `${base}${endpoint}`;
}

/** Construir URL de endpoint con path params */
export function getApiUrlWithParams(endpoint: string, params: Record<string, string>): string {
  let url = endpoint;
  for (const [key, value] of Object.entries(params)) {
    url = url.replace(`{${key}}`, encodeURIComponent(value));
  }
  return getApiUrl(url);
}

/** Obtener ambiente actual */
export function getExpediaEnvironment(): 'test' | 'production' {
  const env = process.env.EXPEDIA_ENVIRONMENT || 'test';
  return env === 'production' ? 'production' : 'test';
}

/** Generar Basic Auth header value */
export function getBasicAuthHeader(username: string, password: string): string {
  const encoded = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${encoded}`;
}

/** Headers estándar para requests XML (Basic Auth) */
export function getXmlHeaders(username: string, password: string): Record<string, string> {
  return {
    'Authorization': getBasicAuthHeader(username, password),
    'Content-Type': 'application/xml; charset=utf-8',
    'Accept': 'application/xml',
  };
}

/** Headers estándar para requests JSON (Basic Auth) */
export function getJsonHeaders(username: string, password: string): Record<string, string> {
  return {
    'Authorization': getBasicAuthHeader(username, password),
    'Content-Type': 'application/json; charset=utf-8',
    'Accept': 'application/json',
  };
}

/** Headers para GraphQL (OAuth2 Bearer token) */
export function getGraphqlHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}

/** Generar request ID para debugging/trazabilidad */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `goadmin-exp-${timestamp}-${random}`;
}

/** Modelos de distribución Expedia */
export const DISTRIBUTION_MODELS: Record<string, string> = {
  ExpediaCollect: 'Expedia Cobra (VCC)',
  HotelCollect: 'Hotel Cobra',
  both: 'Ambos Modelos',
};

/** Puntos de venta Expedia → nombre legible */
export const POS_LABELS: Record<string, string> = {
  'expedia': 'Expedia.com',
  'hotels.com': 'Hotels.com',
  'vrbo': 'Vrbo',
  'orbitz': 'Orbitz',
  'travelocity': 'Travelocity',
  'wotif': 'Wotif',
  'ebookers': 'Ebookers',
  'hotwire': 'Hotwire',
};
