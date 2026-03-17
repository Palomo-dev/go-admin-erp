// ============================================================
// Servicio de Contenido — TripAdvisor Content API
// Location Details, Photos, Reviews, Search, Nearby Search
// ============================================================

import {
  TRIPADVISOR_ENDPOINTS,
  TRIPADVISOR_RATE_LIMITS,
  getTripAdvisorUrl,
  buildQueryParams,
  getTripAdvisorHeaders,
  getDefaultLanguage,
  getDefaultCurrency,
  getApiKeyFromEnv,
} from './tripadvisorConfig';
import type {
  TripAdvisorLocationDetails,
  TripAdvisorPhoto,
  TripAdvisorReview,
  TripAdvisorSearchResult,
  TripAdvisorSearchParams,
  TripAdvisorNearbySearchParams,
  TripAdvisorListResponse,
  TripAdvisorHealthCheckResult,
  TripAdvisorApiResponse,
} from './tripadvisorTypes';

/**
 * Fetch con exponential backoff para manejar rate limiting (HTTP 429).
 */
async function fetchWithRetry<T>(
  url: string,
  retries: number = TRIPADVISOR_RATE_LIMITS.MAX_RETRIES,
): Promise<TripAdvisorApiResponse<T>> {
  const headers = getTripAdvisorHeaders();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      // Rate limit — esperar y reintentar
      if (response.status === 429 && attempt < retries) {
        const delay = TRIPADVISOR_RATE_LIMITS.BACKOFF_BASE_MS * Math.pow(2, attempt);
        console.warn(`[TripAdvisor] Rate limited (429). Reintentando en ${delay}ms (intento ${attempt + 1}/${retries})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorBody = await response.json();
          errorMessage = errorBody?.message || errorBody?.error?.message || errorMessage;
        } catch {
          // No se pudo parsear el body de error
        }

        return {
          success: false,
          error: { code: response.status, message: errorMessage },
        };
      }

      const data = await response.json() as T;
      return { success: true, data };
    } catch (err) {
      if (attempt < retries) {
        const delay = TRIPADVISOR_RATE_LIMITS.BACKOFF_BASE_MS * Math.pow(2, attempt);
        console.warn(`[TripAdvisor] Error de red. Reintentando en ${delay}ms (intento ${attempt + 1}/${retries})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      return {
        success: false,
        error: {
          code: 0,
          message: `Error de red: ${err instanceof Error ? err.message : String(err)}`,
        },
      };
    }
  }

  return {
    success: false,
    error: { code: 0, message: 'Máximo de reintentos alcanzado' },
  };
}

/**
 * Servicio para consumir la TripAdvisor Content API.
 * Todos los métodos son server-side (API Key no se expone al cliente).
 */
export const tripadvisorContentService = {

  // ─── Location Details ───────────────────────────────────

  /**
   * Obtener detalles completos de una ubicación.
   */
  async getLocationDetails(
    locationId: string,
    options?: { language?: string; currency?: string; apiKey?: string },
  ): Promise<TripAdvisorApiResponse<TripAdvisorLocationDetails>> {
    const apiKey = options?.apiKey || getApiKeyFromEnv();
    if (!apiKey) {
      return { success: false, error: { code: 401, message: 'API Key no configurada' } };
    }

    const url = getTripAdvisorUrl(TRIPADVISOR_ENDPOINTS.LOCATION_DETAILS, locationId);
    const query = buildQueryParams(apiKey, {
      language: options?.language || getDefaultLanguage(),
      currency: options?.currency || getDefaultCurrency(),
    });

    return fetchWithRetry<TripAdvisorLocationDetails>(`${url}?${query}`);
  },

  // ─── Location Photos ────────────────────────────────────

  /**
   * Obtener fotos de una ubicación (hasta 5).
   */
  async getLocationPhotos(
    locationId: string,
    options?: { language?: string; apiKey?: string },
  ): Promise<TripAdvisorApiResponse<TripAdvisorPhoto[]>> {
    const apiKey = options?.apiKey || getApiKeyFromEnv();
    if (!apiKey) {
      return { success: false, error: { code: 401, message: 'API Key no configurada' } };
    }

    const url = getTripAdvisorUrl(TRIPADVISOR_ENDPOINTS.LOCATION_PHOTOS, locationId);
    const query = buildQueryParams(apiKey, {
      language: options?.language || getDefaultLanguage(),
    });

    const result = await fetchWithRetry<TripAdvisorListResponse<TripAdvisorPhoto>>(`${url}?${query}`);

    if (result.success && result.data) {
      return { success: true, data: result.data.data || [] };
    }

    return { success: false, error: result.error };
  },

  // ─── Location Reviews ───────────────────────────────────

  /**
   * Obtener reseñas de una ubicación (hasta 5 más recientes).
   */
  async getLocationReviews(
    locationId: string,
    options?: { language?: string; apiKey?: string },
  ): Promise<TripAdvisorApiResponse<TripAdvisorReview[]>> {
    const apiKey = options?.apiKey || getApiKeyFromEnv();
    if (!apiKey) {
      return { success: false, error: { code: 401, message: 'API Key no configurada' } };
    }

    const url = getTripAdvisorUrl(TRIPADVISOR_ENDPOINTS.LOCATION_REVIEWS, locationId);
    const query = buildQueryParams(apiKey, {
      language: options?.language || getDefaultLanguage(),
    });

    const result = await fetchWithRetry<TripAdvisorListResponse<TripAdvisorReview>>(`${url}?${query}`);

    if (result.success && result.data) {
      return { success: true, data: result.data.data || [] };
    }

    return { success: false, error: result.error };
  },

  // ─── Location Search ────────────────────────────────────

  /**
   * Buscar ubicaciones por texto.
   */
  async searchLocations(
    params: TripAdvisorSearchParams,
    apiKey?: string,
  ): Promise<TripAdvisorApiResponse<TripAdvisorSearchResult[]>> {
    const key = apiKey || getApiKeyFromEnv();
    if (!key) {
      return { success: false, error: { code: 401, message: 'API Key no configurada' } };
    }

    const url = getTripAdvisorUrl(TRIPADVISOR_ENDPOINTS.LOCATION_SEARCH);
    const query = buildQueryParams(key, {
      searchQuery: params.searchQuery,
      category: params.category,
      phone: params.phone,
      address: params.address,
      latLong: params.latLong,
      radius: params.radius,
      radiusUnit: params.radiusUnit,
      language: params.language || getDefaultLanguage(),
    });

    const result = await fetchWithRetry<TripAdvisorListResponse<TripAdvisorSearchResult>>(`${url}?${query}`);

    if (result.success && result.data) {
      return { success: true, data: result.data.data || [] };
    }

    return { success: false, error: result.error };
  },

  // ─── Nearby Location Search ─────────────────────────────

  /**
   * Buscar ubicaciones cercanas por coordenadas.
   */
  async searchNearbyLocations(
    params: TripAdvisorNearbySearchParams,
    apiKey?: string,
  ): Promise<TripAdvisorApiResponse<TripAdvisorSearchResult[]>> {
    const key = apiKey || getApiKeyFromEnv();
    if (!key) {
      return { success: false, error: { code: 401, message: 'API Key no configurada' } };
    }

    const url = getTripAdvisorUrl(TRIPADVISOR_ENDPOINTS.NEARBY_SEARCH);
    const query = buildQueryParams(key, {
      latLong: params.latLong,
      category: params.category,
      phone: params.phone,
      address: params.address,
      radius: params.radius,
      radiusUnit: params.radiusUnit,
      language: params.language || getDefaultLanguage(),
    });

    const result = await fetchWithRetry<TripAdvisorListResponse<TripAdvisorSearchResult>>(`${url}?${query}`);

    if (result.success && result.data) {
      return { success: true, data: result.data.data || [] };
    }

    return { success: false, error: result.error };
  },

  // ─── Health Check ───────────────────────────────────────

  /**
   * Verificar que la API Key es válida haciendo una búsqueda de prueba.
   */
  async healthCheck(
    apiKey?: string,
  ): Promise<TripAdvisorHealthCheckResult> {
    const key = apiKey || getApiKeyFromEnv();
    if (!key) {
      return {
        connected: false,
        message: 'API Key no configurada. Configurar TRIPADVISOR_API_KEY en variables de entorno.',
        apiKeyValid: false,
      };
    }

    try {
      // Hacemos una búsqueda simple para verificar la key
      const result = await tripadvisorContentService.searchLocations(
        { searchQuery: 'Bogota Hotel', category: 'hotels', language: 'es_CO' },
        key,
      );

      if (result.success && result.data && result.data.length > 0) {
        const first = result.data[0];
        return {
          connected: true,
          message: `Conexión exitosa con TripAdvisor Content API. Test: "${first.name}"`,
          apiKeyValid: true,
          testLocationId: first.location_id,
          testLocationName: first.name,
        };
      }

      if (result.error) {
        return {
          connected: false,
          message: `Error de API: ${result.error.message} (código ${result.error.code})`,
          apiKeyValid: result.error.code !== 401 && result.error.code !== 403,
        };
      }

      return {
        connected: true,
        message: 'API Key válida pero la búsqueda de prueba no retornó resultados.',
        apiKeyValid: true,
      };
    } catch (err) {
      return {
        connected: false,
        message: `Error de red: ${err instanceof Error ? err.message : String(err)}`,
        apiKeyValid: false,
      };
    }
  },

};
