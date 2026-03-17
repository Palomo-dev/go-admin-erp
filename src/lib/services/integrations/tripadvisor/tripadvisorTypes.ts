// ============================================================
// Tipos TypeScript para la integración TripAdvisor Content API
// Detalles, Fotos, Reseñas, Búsqueda y Conexiones
// ============================================================

// --- IDs de BD existentes ---

/** Provider ID de TripAdvisor en integration_providers */
export const TRIPADVISOR_PROVIDER_ID = '7a497612-d4a0-4314-8fd6-effc49c99661';

/** Connector ID de TripAdvisor iCal en integration_connectors */
export const TRIPADVISOR_ICAL_CONNECTOR_ID = 'fae058a4-5065-4086-a5ef-ae0eb112d4b7';

// --- Credenciales ---

export interface TripAdvisorCredentials {
  apiKey: string;
}

// --- Location Details ---

export interface TripAdvisorAddressObj {
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalcode?: string;
  address_string?: string;
}

export interface TripAdvisorRankingData {
  geo_location_id?: string;
  ranking_string?: string;
  geo_location_name?: string;
  ranking_out_of?: string;
  ranking?: string;
}

export interface TripAdvisorCategory {
  key: string;
  name: string;
}

export interface TripAdvisorAncestor {
  level: string;
  name: string;
  location_id: string;
}

export interface TripAdvisorTripType {
  name: string;
  localized_name: string;
  value: string;
}

export interface TripAdvisorLocationDetails {
  location_id: string;
  name: string;
  description?: string;
  web_url?: string;
  address_obj?: TripAdvisorAddressObj;
  ancestors?: TripAdvisorAncestor[];
  latitude?: string;
  longitude?: string;
  timezone?: string;
  phone?: string;
  website?: string;
  email?: string;
  rating?: string;
  rating_image_url?: string;
  num_reviews?: string;
  ranking_data?: TripAdvisorRankingData;
  price_level?: string;
  category?: TripAdvisorCategory;
  subcategory?: TripAdvisorCategory[];
  hours?: Record<string, unknown>;
  amenities?: string[];
  cuisine?: TripAdvisorCategory[];
  trip_types?: TripAdvisorTripType[];
  awards?: Record<string, unknown>[];
  write_review?: string;
  // Campos extra que pueda devolver la API
  [key: string]: unknown;
}

// --- Location Photos ---

export interface TripAdvisorImageSize {
  height: number;
  width: number;
  url: string;
}

export interface TripAdvisorPhotoImages {
  thumbnail?: TripAdvisorImageSize;
  small?: TripAdvisorImageSize;
  medium?: TripAdvisorImageSize;
  large?: TripAdvisorImageSize;
  original?: TripAdvisorImageSize;
}

export interface TripAdvisorPhotoSource {
  name: string;
  localized_name?: string;
}

export interface TripAdvisorPhoto {
  id: number;
  is_blessed: boolean;
  caption?: string;
  published_date?: string;
  images: TripAdvisorPhotoImages;
  album?: string;
  source?: TripAdvisorPhotoSource;
  user?: {
    username?: string;
  };
}

// --- Location Reviews ---

export interface TripAdvisorSubrating {
  name: string;
  localized_name: string;
  rating_image_url?: string;
  value: string;
}

export interface TripAdvisorReviewUser {
  username?: string;
  user_location?: {
    name?: string;
    id?: string;
  };
  avatar?: {
    thumbnail?: string;
    small?: string;
    large?: string;
  };
}

export interface TripAdvisorReview {
  id: number;
  lang?: string;
  location_id?: string;
  published_date?: string;
  rating: number;
  helpful_votes?: string;
  rating_image_url?: string;
  url?: string;
  title?: string;
  text?: string;
  trip_type?: string;
  travel_date?: string;
  user?: TripAdvisorReviewUser;
  subratings?: Record<string, TripAdvisorSubrating>;
}

// --- Location Search ---

export type TripAdvisorSearchCategory = 'hotels' | 'attractions' | 'restaurants' | 'geos';
export type TripAdvisorRadiusUnit = 'km' | 'mi' | 'm';

export interface TripAdvisorSearchParams {
  searchQuery: string;
  category?: TripAdvisorSearchCategory;
  phone?: string;
  address?: string;
  latLong?: string;
  radius?: number;
  radiusUnit?: TripAdvisorRadiusUnit;
  language?: string;
}

export interface TripAdvisorNearbySearchParams {
  latLong: string;
  category?: TripAdvisorSearchCategory;
  phone?: string;
  address?: string;
  radius?: number;
  radiusUnit?: TripAdvisorRadiusUnit;
  language?: string;
}

export interface TripAdvisorSearchResult {
  location_id: string;
  name: string;
  address_obj?: TripAdvisorAddressObj;
}

// --- Respuestas de API ---

export interface TripAdvisorListResponse<T> {
  data: T[];
}

export interface TripAdvisorApiError {
  code: number;
  message: string;
  type?: string;
}

// --- Health Check ---

export interface TripAdvisorHealthCheckResult {
  connected: boolean;
  message: string;
  apiKeyValid?: boolean;
  testLocationId?: string;
  testLocationName?: string;
}

// --- Respuesta genérica interna ---

export interface TripAdvisorApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: number;
    message: string;
  };
}

// --- Sync / API Log ---

export type TripAdvisorSyncType =
  | 'location_details'
  | 'location_photos'
  | 'location_reviews'
  | 'location_search'
  | 'nearby_search'
  | 'health_check';

export type TripAdvisorSyncStatus = 'success' | 'error';

export interface TripAdvisorApiLog {
  id?: string;
  connectionId?: string;
  organizationId: string;
  syncType: TripAdvisorSyncType;
  endpoint: string;
  status: TripAdvisorSyncStatus;
  responseCode?: number;
  errorMessage?: string;
  createdAt?: string;
}

// --- Location Mapping (propiedad GO Admin ↔ TripAdvisor) ---

export interface TripAdvisorLocationMapping {
  id?: string;
  organizationId: string;
  connectionId?: string;
  locationId: string;        // TripAdvisor location_id
  locationName: string;
  spaceId?: string;          // space o propiedad en GO Admin (opcional)
  branchId?: number;         // branch en GO Admin (opcional)
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}
