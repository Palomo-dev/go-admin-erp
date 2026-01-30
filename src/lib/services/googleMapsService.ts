/**
 * Google Maps Service
 * Servicio para integración con Google Maps Platform
 * 
 * APIs utilizadas:
 * - Directions API: Cálculo de rutas
 * - Geocoding API: Conversión dirección <-> coordenadas
 * - Places API: Autocompletado y detalles de lugares
 * - Distance Matrix API: Distancias entre múltiples puntos
 */

// Tipos para Google Maps
export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteWaypoint {
  location: LatLng | string;
  stopover?: boolean;
}

export interface DirectionsRequest {
  origin: LatLng | string;
  destination: LatLng | string;
  waypoints?: RouteWaypoint[];
  travelMode?: 'DRIVING' | 'WALKING' | 'BICYCLING' | 'TRANSIT';
  avoidTolls?: boolean;
  avoidHighways?: boolean;
  optimizeWaypoints?: boolean;
  departureTime?: Date;
}

export interface DirectionsResult {
  distance: {
    text: string;
    value: number; // metros
  };
  duration: {
    text: string;
    value: number; // segundos
  };
  polyline: string;
  steps: DirectionsStep[];
  waypointOrder?: number[];
  bounds: {
    northeast: LatLng;
    southwest: LatLng;
  };
}

export interface DirectionsStep {
  distance: { text: string; value: number };
  duration: { text: string; value: number };
  startLocation: LatLng;
  endLocation: LatLng;
  instructions: string;
  polyline: string;
}

export interface GeocodingResult {
  formattedAddress: string;
  location: LatLng;
  placeId: string;
  addressComponents: {
    longName: string;
    shortName: string;
    types: string[];
  }[];
}

export interface PlaceAutocompleteResult {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
  types: string[];
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  formattedAddress: string;
  location: LatLng;
  formattedPhoneNumber?: string;
  website?: string;
  openingHours?: {
    weekdayText: string[];
    isOpen: boolean;
  };
  addressComponents: {
    longName: string;
    shortName: string;
    types: string[];
  }[];
}

export interface DistanceMatrixResult {
  originAddresses: string[];
  destinationAddresses: string[];
  rows: {
    elements: {
      status: string;
      distance?: { text: string; value: number };
      duration?: { text: string; value: number };
      durationInTraffic?: { text: string; value: number };
    }[];
  }[];
}

class GoogleMapsService {
  private apiKey: string;
  private baseUrl = 'https://maps.googleapis.com/maps/api';

  constructor() {
    this.apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
    
    if (!this.apiKey) {
      console.warn('Google Maps API key not configured. Some features will be unavailable.');
    }
  }

  /**
   * Verifica si el servicio está configurado
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Calcula la ruta entre dos puntos
   */
  async getDirections(request: DirectionsRequest): Promise<DirectionsResult | null> {
    if (!this.isConfigured()) {
      console.error('Google Maps API key not configured');
      return null;
    }

    try {
      const origin = typeof request.origin === 'string' 
        ? request.origin 
        : `${request.origin.lat},${request.origin.lng}`;
      
      const destination = typeof request.destination === 'string'
        ? request.destination
        : `${request.destination.lat},${request.destination.lng}`;

      const params = new URLSearchParams({
        origin,
        destination,
        mode: (request.travelMode || 'DRIVING').toLowerCase(),
        key: this.apiKey,
      });

      if (request.waypoints && request.waypoints.length > 0) {
        const waypointsStr = request.waypoints.map(wp => {
          const loc = typeof wp.location === 'string' 
            ? wp.location 
            : `${wp.location.lat},${wp.location.lng}`;
          return wp.stopover !== false ? loc : `via:${loc}`;
        }).join('|');
        
        if (request.optimizeWaypoints) {
          params.append('waypoints', `optimize:true|${waypointsStr}`);
        } else {
          params.append('waypoints', waypointsStr);
        }
      }

      if (request.avoidTolls) params.append('avoid', 'tolls');
      if (request.avoidHighways) params.append('avoid', 'highways');
      if (request.departureTime) {
        params.append('departure_time', Math.floor(request.departureTime.getTime() / 1000).toString());
      }

      const response = await fetch(`${this.baseUrl}/directions/json?${params.toString()}`);
      const data = await response.json();

      if (data.status !== 'OK') {
        console.error('Directions API error:', data.status, data.error_message);
        return null;
      }

      const route = data.routes[0];
      const leg = route.legs[0];

      // Si hay múltiples legs (waypoints), sumar distancias y duraciones
      let totalDistance = 0;
      let totalDuration = 0;
      const allSteps: DirectionsStep[] = [];

      for (const l of route.legs) {
        totalDistance += l.distance.value;
        totalDuration += l.duration.value;
        
        for (const step of l.steps) {
          allSteps.push({
            distance: step.distance,
            duration: step.duration,
            startLocation: step.start_location,
            endLocation: step.end_location,
            instructions: step.html_instructions,
            polyline: step.polyline.points,
          });
        }
      }

      return {
        distance: {
          text: this.formatDistance(totalDistance),
          value: totalDistance,
        },
        duration: {
          text: this.formatDuration(totalDuration),
          value: totalDuration,
        },
        polyline: route.overview_polyline.points,
        steps: allSteps,
        waypointOrder: route.waypoint_order,
        bounds: {
          northeast: route.bounds.northeast,
          southwest: route.bounds.southwest,
        },
      };
    } catch (error) {
      console.error('Error getting directions:', error);
      return null;
    }
  }

  /**
   * Geocodifica una dirección a coordenadas
   */
  async geocode(address: string): Promise<GeocodingResult | null> {
    if (!this.isConfigured()) {
      console.error('Google Maps API key not configured');
      return null;
    }

    try {
      const params = new URLSearchParams({
        address,
        key: this.apiKey,
        region: 'co', // Colombia por defecto
      });

      const response = await fetch(`${this.baseUrl}/geocode/json?${params.toString()}`);
      const data = await response.json();

      if (data.status !== 'OK' || !data.results.length) {
        console.error('Geocoding error:', data.status);
        return null;
      }

      const result = data.results[0];
      return {
        formattedAddress: result.formatted_address,
        location: result.geometry.location,
        placeId: result.place_id,
        addressComponents: result.address_components.map((c: any) => ({
          longName: c.long_name,
          shortName: c.short_name,
          types: c.types,
        })),
      };
    } catch (error) {
      console.error('Error geocoding address:', error);
      return null;
    }
  }

  /**
   * Geocodificación inversa: coordenadas a dirección
   */
  async reverseGeocode(location: LatLng): Promise<GeocodingResult | null> {
    if (!this.isConfigured()) {
      console.error('Google Maps API key not configured');
      return null;
    }

    try {
      const params = new URLSearchParams({
        latlng: `${location.lat},${location.lng}`,
        key: this.apiKey,
      });

      const response = await fetch(`${this.baseUrl}/geocode/json?${params.toString()}`);
      const data = await response.json();

      if (data.status !== 'OK' || !data.results.length) {
        console.error('Reverse geocoding error:', data.status);
        return null;
      }

      const result = data.results[0];
      return {
        formattedAddress: result.formatted_address,
        location: result.geometry.location,
        placeId: result.place_id,
        addressComponents: result.address_components.map((c: any) => ({
          longName: c.long_name,
          shortName: c.short_name,
          types: c.types,
        })),
      };
    } catch (error) {
      console.error('Error reverse geocoding:', error);
      return null;
    }
  }

  /**
   * Autocompletado de lugares
   */
  async placesAutocomplete(
    input: string, 
    options?: { 
      types?: string; 
      componentRestrictions?: { country: string } 
    }
  ): Promise<PlaceAutocompleteResult[]> {
    if (!this.isConfigured()) {
      console.error('Google Maps API key not configured');
      return [];
    }

    try {
      const params = new URLSearchParams({
        input,
        key: this.apiKey,
        language: 'es',
      });

      if (options?.types) {
        params.append('types', options.types);
      }
      
      if (options?.componentRestrictions?.country) {
        params.append('components', `country:${options.componentRestrictions.country}`);
      } else {
        params.append('components', 'country:co'); // Colombia por defecto
      }

      const response = await fetch(`${this.baseUrl}/place/autocomplete/json?${params.toString()}`);
      const data = await response.json();

      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        console.error('Places Autocomplete error:', data.status);
        return [];
      }

      return (data.predictions || []).map((p: any) => ({
        placeId: p.place_id,
        description: p.description,
        mainText: p.structured_formatting.main_text,
        secondaryText: p.structured_formatting.secondary_text,
        types: p.types,
      }));
    } catch (error) {
      console.error('Error in places autocomplete:', error);
      return [];
    }
  }

  /**
   * Obtiene detalles de un lugar por su Place ID
   */
  async getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
    if (!this.isConfigured()) {
      console.error('Google Maps API key not configured');
      return null;
    }

    try {
      const params = new URLSearchParams({
        place_id: placeId,
        key: this.apiKey,
        language: 'es',
        fields: 'place_id,name,formatted_address,geometry,formatted_phone_number,website,opening_hours,address_components',
      });

      const response = await fetch(`${this.baseUrl}/place/details/json?${params.toString()}`);
      const data = await response.json();

      if (data.status !== 'OK') {
        console.error('Place Details error:', data.status);
        return null;
      }

      const result = data.result;
      return {
        placeId: result.place_id,
        name: result.name,
        formattedAddress: result.formatted_address,
        location: result.geometry.location,
        formattedPhoneNumber: result.formatted_phone_number,
        website: result.website,
        openingHours: result.opening_hours ? {
          weekdayText: result.opening_hours.weekday_text,
          isOpen: result.opening_hours.open_now,
        } : undefined,
        addressComponents: (result.address_components || []).map((c: any) => ({
          longName: c.long_name,
          shortName: c.short_name,
          types: c.types,
        })),
      };
    } catch (error) {
      console.error('Error getting place details:', error);
      return null;
    }
  }

  /**
   * Calcula matriz de distancias entre múltiples orígenes y destinos
   */
  async getDistanceMatrix(
    origins: (LatLng | string)[],
    destinations: (LatLng | string)[],
    options?: { mode?: string; departureTime?: Date }
  ): Promise<DistanceMatrixResult | null> {
    if (!this.isConfigured()) {
      console.error('Google Maps API key not configured');
      return null;
    }

    try {
      const formatLocations = (locs: (LatLng | string)[]) => 
        locs.map(loc => typeof loc === 'string' ? loc : `${loc.lat},${loc.lng}`).join('|');

      const params = new URLSearchParams({
        origins: formatLocations(origins),
        destinations: formatLocations(destinations),
        mode: options?.mode || 'driving',
        key: this.apiKey,
        language: 'es',
      });

      if (options?.departureTime) {
        params.append('departure_time', Math.floor(options.departureTime.getTime() / 1000).toString());
      }

      const response = await fetch(`${this.baseUrl}/distancematrix/json?${params.toString()}`);
      const data = await response.json();

      if (data.status !== 'OK') {
        console.error('Distance Matrix error:', data.status);
        return null;
      }

      return {
        originAddresses: data.origin_addresses,
        destinationAddresses: data.destination_addresses,
        rows: data.rows.map((row: any) => ({
          elements: row.elements.map((el: any) => ({
            status: el.status,
            distance: el.distance,
            duration: el.duration,
            durationInTraffic: el.duration_in_traffic,
          })),
        })),
      };
    } catch (error) {
      console.error('Error getting distance matrix:', error);
      return null;
    }
  }

  /**
   * Optimiza el orden de paradas para minimizar tiempo/distancia
   */
  async optimizeRoute(
    origin: LatLng | string,
    destination: LatLng | string,
    waypoints: (LatLng | string)[]
  ): Promise<{ optimizedOrder: number[]; result: DirectionsResult } | null> {
    const result = await this.getDirections({
      origin,
      destination,
      waypoints: waypoints.map(wp => ({ location: wp, stopover: true })),
      optimizeWaypoints: true,
      travelMode: 'DRIVING',
    });

    if (!result) return null;

    return {
      optimizedOrder: result.waypointOrder || [],
      result,
    };
  }

  /**
   * Decodifica un polyline encoded de Google
   */
  decodePolyline(encoded: string): LatLng[] {
    const points: LatLng[] = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
      let b;
      let shift = 0;
      let result = 0;

      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);

      const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;

      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);

      const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      points.push({
        lat: lat / 1e5,
        lng: lng / 1e5,
      });
    }

    return points;
  }

  /**
   * Calcula la distancia Haversine entre dos puntos (sin API)
   */
  calculateHaversineDistance(point1: LatLng, point2: LatLng): number {
    const R = 6371; // Radio de la Tierra en km
    const dLat = this.toRad(point2.lat - point1.lat);
    const dLng = this.toRad(point2.lng - point1.lng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(point1.lat)) *
        Math.cos(this.toRad(point2.lat)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  private formatDistance(meters: number): string {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${meters} m`;
  }

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours} h ${minutes} min`;
    }
    return `${minutes} min`;
  }
}

// Singleton
export const googleMapsService = new GoogleMapsService();
export default googleMapsService;
