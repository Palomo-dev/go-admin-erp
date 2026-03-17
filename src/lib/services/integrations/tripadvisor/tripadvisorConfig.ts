// ============================================================
// Configuración de TripAdvisor Content API
// URLs base, endpoints, constantes y utilidades
// ============================================================

// --- URL Base ---

/** Servidor único de TripAdvisor Content API (no hay sandbox) */
export const TRIPADVISOR_API_BASE_URL = 'https://api.content.tripadvisor.com/api/v1' as const;

// --- Endpoints ---

export const TRIPADVISOR_ENDPOINTS = {
  /** Detalles de una ubicación */
  LOCATION_DETAILS: '/location/{locationId}/details',

  /** Fotos de una ubicación (hasta 5) */
  LOCATION_PHOTOS: '/location/{locationId}/photos',

  /** Reseñas de una ubicación (hasta 5) */
  LOCATION_REVIEWS: '/location/{locationId}/reviews',

  /** Búsqueda de ubicaciones por texto */
  LOCATION_SEARCH: '/location/search',

  /** Búsqueda de ubicaciones cercanas por coordenadas */
  NEARBY_SEARCH: '/location/nearby_search',
} as const;

// --- Credenciales (propósitos en integration_credentials) ---

export const TRIPADVISOR_CREDENTIAL_PURPOSES = {
  API_KEY: 'api_key',
} as const;

// --- Rate Limiting ---

export const TRIPADVISOR_RATE_LIMITS = {
  /** Queries por segundo */
  QPS: 50,
  /** Llamadas diarias para Search APIs */
  SEARCH_DAILY_LIMIT: 10_000,
  /** Delay base para exponential backoff (ms) */
  BACKOFF_BASE_MS: 500,
  /** Máximo de reintentos */
  MAX_RETRIES: 3,
} as const;

// --- Idiomas soportados (parcial, los más usados) ---

export const TRIPADVISOR_LANGUAGES = {
  SPANISH_COLOMBIA: 'es_CO',
  SPANISH: 'es',
  ENGLISH: 'en',
  FRENCH: 'fr',
  PORTUGUESE_BRAZIL: 'pt',
  GERMAN: 'de',
  ITALIAN: 'it',
} as const;

// --- Monedas ---

export const TRIPADVISOR_CURRENCIES = {
  COP: 'COP',
  USD: 'USD',
  EUR: 'EUR',
} as const;

// --- Categorías de búsqueda ---

export const TRIPADVISOR_CATEGORIES = {
  HOTELS: 'hotels',
  RESTAURANTS: 'restaurants',
  ATTRACTIONS: 'attractions',
  GEOS: 'geos',
} as const;

// --- Display Requirements ---

export const TRIPADVISOR_DISPLAY = {
  /** Color verde principal de TripAdvisor */
  BRAND_COLOR: '#00AA6C',
  /** Color verde claro para dark mode */
  BRAND_COLOR_DARK: '#84E9BD',
  /** Tamaño mínimo del Ollie logo (px) */
  MIN_LOGO_HEIGHT: 20,
  /** Ancho mínimo del bubble rating (px) */
  MIN_BUBBLE_WIDTH: 55,
  /** URL base para assets de TripAdvisor */
  ASSETS_BASE_URL: 'https://www.tripadvisor.com/img/cdsi/img2',
} as const;

// --- Helpers ---

/** Construir URL completa para un endpoint */
export function getTripAdvisorUrl(
  endpoint: string,
  locationId?: string,
): string {
  let path = endpoint;
  if (locationId) {
    path = path.replace('{locationId}', locationId);
  }
  return `${TRIPADVISOR_API_BASE_URL}${path}`;
}

/** Construir query params incluyendo API Key */
export function buildQueryParams(
  apiKey: string,
  params?: Record<string, string | number | undefined>,
): string {
  const queryParams = new URLSearchParams();
  queryParams.set('key', apiKey);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.set(key, String(value));
      }
    }
  }

  return queryParams.toString();
}

/** Headers estándar para requests JSON a TripAdvisor */
export function getTripAdvisorHeaders(): Record<string, string> {
  return {
    'Accept': 'application/json',
    'Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://app.goadmin.io',
  };
}

/** Idioma por defecto para Colombia */
export function getDefaultLanguage(): string {
  return TRIPADVISOR_LANGUAGES.SPANISH_COLOMBIA;
}

/** Moneda por defecto para Colombia */
export function getDefaultCurrency(): string {
  return TRIPADVISOR_CURRENCIES.COP;
}

/** Obtener API Key desde variable de entorno */
export function getApiKeyFromEnv(): string | undefined {
  return process.env.TRIPADVISOR_API_KEY;
}

/** Subrating keys para hoteles */
export const HOTEL_SUBRATING_LABELS: Record<string, string> = {
  RATE_VALUE: 'Relación calidad-precio',
  RATE_ROOM: 'Habitaciones',
  RATE_SERVICE: 'Servicio',
  RATE_LOCATION: 'Ubicación',
  RATE_CLEANLINESS: 'Limpieza',
  RATE_SLEEP: 'Calidad del sueño',
};

/** Categorías de búsqueda: código → nombre legible */
export const CATEGORY_LABELS: Record<string, string> = {
  hotels: 'Hoteles',
  restaurants: 'Restaurantes',
  attractions: 'Atracciones',
  geos: 'Destinos',
};
