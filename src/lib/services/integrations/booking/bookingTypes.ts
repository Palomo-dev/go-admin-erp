// ============================================================
// Tipos TypeScript para la integración Booking.com Connectivity API
// Reservas, Tarifas, Disponibilidad, Contenido, Conexiones
// ============================================================

// --- IDs de BD existentes ---

/** Provider ID de Booking.com en integration_providers */
export const BOOKING_PROVIDER_ID = 'd379fcab-12ad-41c7-80f9-91c66373d72f';

/** Connector ID de Booking.com OTA (Channel Manager) en integration_connectors */
export const BOOKING_OTA_CONNECTOR_ID = 'eabc8169-3c24-46e9-94ee-8efac2d2d43e';

/** Connector ID de Booking.com iCal en integration_connectors */
export const BOOKING_ICAL_CONNECTOR_ID = 'd5c764da-5ee7-4df0-8837-28b04302db9f';

// --- Credenciales ---

export interface BookingCredentials {
  machineClientId: string;
  machineClientSecret: string;
  hotelId: string;
  accessToken?: string;
  tokenExpiresAt?: number; // Unix timestamp
}

// --- Token OAuth2 ---

export interface BookingTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number; // segundos (~599)
}

export interface BookingTokenInfo {
  accessToken: string;
  expiresAt: number; // Unix timestamp
  isValid: boolean;
}

// --- Conexiones (Connections API) ---

export type BookingConnectionType =
  | 'reservations'
  | 'rates_availability'
  | 'content'
  | 'photos'
  | 'guest_reviews'
  | 'reporting'
  | 'promotions'
  | 'messaging'
  | 'performance'
  | 'payments';

export type BookingConnectionState = 'pending' | 'connected' | 'not_found';

export interface BookingConnection {
  hotelId: string;
  hotelName: string;
  state: BookingConnectionState;
  connectionTypes: BookingConnectionType[];
  connectedAt?: string; // ISO date
}

export interface BookingConnectionRequest {
  hotelId: string;
  hotelName: string;
  requestedTypes: BookingConnectionType[];
  state: 'pending';
  requestedAt: string; // ISO date
}

// --- Reservas (Reservations API) ---

export type BookingReservationStatus = 'new' | 'modified' | 'cancelled';

export type BookingMealPlan =
  | 'RO'   // Room Only
  | 'BB'   // Bed & Breakfast
  | 'HB'   // Half Board
  | 'FB'   // Full Board
  | 'AI';  // All Inclusive

export interface BookingGuest {
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

export interface BookingReservationRoom {
  roomId: string;           // Room type ID en Booking.com
  roomName: string;
  ratePlanId: string;
  ratePlanName?: string;
  mealPlan: BookingMealPlan;
  adults: number;
  children: number;
  childrenAges?: number[];
  pricePerNight: number[];  // Array de precios por noche
  totalPrice: number;
  currency: string;
  guestName: string;
  specialRequests?: string;
}

export interface BookingReservation {
  reservationId: string;    // ID único en Booking.com
  hotelId: string;
  status: BookingReservationStatus;
  createdAt: string;        // ISO date
  modifiedAt?: string;      // ISO date
  checkin: string;          // YYYY-MM-DD
  checkout: string;         // YYYY-MM-DD
  nights: number;
  guest: BookingGuest;
  rooms: BookingReservationRoom[];
  totalPrice: number;
  currency: string;
  commissionAmount?: number;
  paymentInfo?: BookingPaymentInfo;
  specialRequests?: string;
  ruid?: string;            // Request Unique ID para debugging
}

export interface BookingPaymentInfo {
  cardType?: string;        // Visa, Mastercard, etc.
  cardNumber?: string;      // Masked: XXXX-XXXX-XXXX-1234
  expiryDate?: string;      // MM/YY
  cardholderName?: string;
  // PCI: Los datos completos solo se obtienen con PCI compliance
}

export interface BookingReservationAcknowledge {
  reservationId: string;
  success: boolean;
  errorMessage?: string;
}

// --- Tarifas y Disponibilidad (Rates & Availability API) ---

export type BookingPricingType =
  | 'standard'
  | 'derived'    // Rate-Level Occupancy (RLO)
  | 'obp'        // Occupancy-Based Pricing
  | 'los';       // Length of Stay

export interface BookingAvailabilityUpdate {
  hotelId: string;
  roomId: string;
  ratePlanId: string;
  dates: BookingDateAvailability[];
}

export interface BookingDateAvailability {
  date: string;             // YYYY-MM-DD
  price?: number;           // En moneda de la propiedad
  roomsToSell?: number;     // Cantidad de habitaciones disponibles
  closed?: boolean;         // Stop sell
  minimumStay?: number;     // Min noches
  maximumStay?: number;     // Max noches
  closedOnArrival?: boolean;
  closedOnDeparture?: boolean;
}

export interface BookingRateUpdate {
  hotelId: string;
  roomId: string;
  ratePlanId: string;
  dates: BookingDateRate[];
}

export interface BookingDateRate {
  date: string;             // YYYY-MM-DD
  price: number;            // En moneda de la propiedad
  extraAdultPrice?: number;
  extraChildPrice?: number;
  singleUsePrice?: number;  // Precio por uso individual (derived pricing)
}

// --- Room Mapping ---

export interface BookingRoomType {
  roomId: string;
  roomName: string;
  maxOccupancy: number;
  ratePlans: BookingRatePlan[];
}

export interface BookingRatePlan {
  ratePlanId: string;
  ratePlanName: string;
  mealPlan: BookingMealPlan;
  isActive: boolean;
}

export interface BookingRoomMapping {
  id?: string;              // UUID
  connectionId: string;     // channel_connections.id
  bookingRoomId: string;
  bookingRoomName: string;
  bookingRatePlanId: string;
  spaceTypeId: string;      // space_types.id en GO Admin
  ratePlanConfig: Record<string, unknown>;
  isActive: boolean;
}

// --- Content API ---

export interface BookingPropertyContent {
  hotelId: string;
  name: string;
  address: {
    street: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string; // ISO 3166-1 alpha-2
  };
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  description?: string;
  checkInTime?: string;     // HH:MM
  checkOutTime?: string;    // HH:MM
  currency: string;
  starRating?: number;
  propertyType?: string;
  facilities?: string[];
}

// --- Photo API ---

export interface BookingPhoto {
  photoId: string;
  url: string;
  sortOrder: number;
  tags?: string[];          // room, bathroom, view, etc.
  roomId?: string;          // Si es de una habitación específica
}

// --- Sync Logs ---

export type BookingSyncType =
  | 'reservation_poll'
  | 'availability_push'
  | 'rate_push'
  | 'content_sync'
  | 'photo_sync'
  | 'connection_check';

export type BookingSyncDirection = 'inbound' | 'outbound';
export type BookingSyncStatus = 'success' | 'error' | 'partial';

export interface BookingSyncLog {
  id?: string;
  connectionId: string;
  syncType: BookingSyncType;
  direction: BookingSyncDirection;
  endpoint: string;
  requestRuid?: string;
  status: BookingSyncStatus;
  itemsProcessed: number;
  errorMessage?: string;
  createdAt?: string;
}

// --- Health Check ---

export interface BookingHealthCheckResult {
  connected: boolean;
  message: string;
  hotelId?: string;
  hotelName?: string;
  connectionTypes?: BookingConnectionType[];
  tokenValid?: boolean;
  tokenExpiresAt?: number;
  lastSyncAt?: string;
}

// --- Respuestas de API ---

export interface BookingApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    ruid?: string;
  };
}

// --- Reservation Details (datos extra para BD) ---

export interface BookingReservationDetail {
  id?: string;
  reservationId: string;      // FK a reservations.id (GO Admin)
  bookingReservationId: string; // ID en Booking.com
  bookingHotelId: string;
  guestRequests?: string;
  mealPlan?: BookingMealPlan;
  paymentInfo?: Record<string, unknown>;
  commissionAmount?: number;
  bookingStatus: BookingReservationStatus;
  acknowledgedAt?: string;
  rawData?: Record<string, unknown>;
}
