// ============================================================
// Tipos TypeScript para la integración Expedia Group Lodging API
// Reservas, Tarifas, Disponibilidad, Producto, Contenido
// ============================================================

// --- IDs de BD existentes ---

/** Provider ID de Expedia Group en integration_providers */
export const EXPEDIA_PROVIDER_ID = '11d341a0-bf31-4288-abba-9033050061dc';

/** Connector ID de Expedia OTA (Channel Manager) en integration_connectors */
export const EXPEDIA_OTA_CONNECTOR_ID = 'c189e389-12c7-4384-9a2d-e35a90316daa';

/** Connector ID de Expedia iCal en integration_connectors */
export const EXPEDIA_ICAL_CONNECTOR_ID = 'b448f1a3-18b4-418e-98e4-a8b3df6a37f1';

// --- Credenciales ---

export interface ExpediaCredentials {
  eqcUsername: string;
  eqcPassword: string;
  propertyId: string;
  accessToken?: string;
  tokenExpiresAt?: number; // Unix timestamp
}

// --- Token OAuth2 (para GraphQL) ---

export interface ExpediaTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number; // segundos
  scope?: string;
}

export interface ExpediaTokenInfo {
  accessToken: string;
  expiresAt: number; // Unix timestamp
  isValid: boolean;
}

// --- Conexiones ---

export type ExpediaConnectionStatus = 'pending' | 'connected' | 'error' | 'inactive';

export interface ExpediaConnection {
  propertyId: string;
  propertyName?: string;
  status: ExpediaConnectionStatus;
  connectedAt?: string; // ISO date
}

// --- Reservas ---

export type ExpediaReservationStatus = 'new' | 'modified' | 'cancelled';

export interface ExpediaGuest {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string; // ISO 3166-1 alpha-2
  };
}

export interface ExpediaReservationRoom {
  roomTypeId: string;
  roomTypeName?: string;
  ratePlanId: string;
  ratePlanName?: string;
  adults: number;
  children: number;
  childrenAges?: number[];
  pricePerNight: number[];
  totalPrice: number;
  currency: string;
  smokingPreference?: 'smoking' | 'non-smoking' | 'no_preference';
  specialRequests?: string;
}

export interface ExpediaReservation {
  confirmationId: string;    // Expedia confirmation number
  propertyId: string;
  status: ExpediaReservationStatus;
  createdAt: string;         // ISO date
  modifiedAt?: string;       // ISO date
  checkin: string;           // YYYY-MM-DD
  checkout: string;          // YYYY-MM-DD
  nights: number;
  guest: ExpediaGuest;
  rooms: ExpediaReservationRoom[];
  totalPrice: number;
  currency: string;
  paymentInfo?: ExpediaPaymentInfo;
  specialRequests?: string;
  pointOfSale?: string;      // expedia, hotels.com, vrbo, etc.
}

export interface ExpediaPaymentInfo {
  cardType?: string;
  cardNumber?: string;       // Masked
  expiryDate?: string;
  cardholderName?: string;
  // PCI: datos completos requieren PCI compliance
}

// --- Tarifas y Disponibilidad (AR API) ---

export interface ExpediaAvailabilityUpdate {
  propertyId: string;
  roomTypeId: string;
  ratePlanId: string;
  dates: ExpediaDateAvailability[];
}

export interface ExpediaDateAvailability {
  date: string;              // YYYY-MM-DD
  price?: number;
  totalInventoryAvailable?: number;
  closed?: boolean;          // Stop sell
  minimumStay?: number;
  maximumStay?: number;
  closedToArrival?: boolean;
  closedToDeparture?: boolean;
}

// --- Producto (Product API) ---

export interface ExpediaRoomType {
  roomTypeId: string;
  roomTypeName: string;
  maxOccupancy: number;
  ratePlans: ExpediaRatePlan[];
}

export interface ExpediaRatePlan {
  ratePlanId: string;
  ratePlanName: string;
  distributionModel: 'ExpediaCollect' | 'HotelCollect' | 'both';
  isActive: boolean;
  pricingModel: 'PerDayPricing' | 'OccupancyBasedPricing';
}

// --- Contenido (Property API) ---

export interface ExpediaPropertyContent {
  propertyId: string;
  name: string;
  address: {
    street: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  };
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  currency: string;
  starRating?: number;
  propertyType?: string;
  structureType?: string;
}

// --- Health Check ---

export interface ExpediaHealthCheckResult {
  connected: boolean;
  message: string;
  propertyId?: string;
  propertyName?: string;
  tokenValid?: boolean;
  tokenExpiresAt?: number;
}

// --- Sync Logs ---

export type ExpediaSyncType =
  | 'reservation_pull'
  | 'reservation_notification'
  | 'availability_push'
  | 'rate_push'
  | 'product_sync'
  | 'content_sync'
  | 'connection_check';

export type ExpediaSyncDirection = 'inbound' | 'outbound';
export type ExpediaSyncStatus = 'success' | 'error' | 'partial';

// --- Respuestas de API ---

export interface ExpediaApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// --- Puntos de venta ---

export const EXPEDIA_POINTS_OF_SALE = [
  'expedia',
  'hotels.com',
  'vrbo',
  'orbitz',
  'travelocity',
  'wotif',
  'ebookers',
  'hotwire',
] as const;

export type ExpediaPointOfSale = typeof EXPEDIA_POINTS_OF_SALE[number];
