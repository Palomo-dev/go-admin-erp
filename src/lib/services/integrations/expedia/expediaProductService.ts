// ============================================================
// Servicio de Producto — Expedia Group Lodging API
// Room Types, Rate Plans, Property Info (JSON REST + Basic Auth)
// ============================================================

import { supabase } from '@/lib/supabase/config';
import { expediaAuthService } from './expediaAuthService';
import {
  EXPEDIA_ENDPOINTS,
  getApiUrlWithParams,
  getJsonHeaders,
  generateRequestId,
} from './expediaConfig';
import type {
  ExpediaRoomType,
  ExpediaRatePlan,
  ExpediaPropertyContent,
  ExpediaSyncType,
  ExpediaSyncDirection,
  ExpediaSyncStatus,
} from './expediaTypes';

/**
 * Servicio para gestionar producto en Expedia Group.
 * Consulta Room Types, Rate Plans y Property Info via JSON REST API.
 *
 * Diferencia con Booking.com: Expedia usa JSON REST (no XML OTA)
 * y Basic Auth para estas APIs.
 */
export const expediaProductService = {

  // ─── Property Info ────────────────────────────────────────

  /**
   * Obtener información de la propiedad desde Expedia Product API.
   * GET /properties/{propertyId}
   */
  async getPropertyInfo(
    connectionId: string,
  ): Promise<ExpediaPropertyContent | null> {
    try {
      const credentials = await expediaAuthService.getCredentials(connectionId);
      if (!credentials) return null;

      const url = getApiUrlWithParams(EXPEDIA_ENDPOINTS.PROPERTY_INFO, {
        propertyId: credentials.propertyId,
      });

      const response = await expediaAuthService.fetchWithRetry(url, {
        method: 'GET',
        headers: getJsonHeaders(credentials.eqcUsername, credentials.eqcPassword),
      });

      if (!response.ok) {
        console.error(`[ExpediaProduct] Error obteniendo property info (${response.status})`);
        return null;
      }

      const data = await response.json();
      return this.parsePropertyInfo(data, credentials.propertyId);
    } catch (err) {
      console.error('[ExpediaProduct] Error:', err);
      return null;
    }
  },

  /**
   * Parsear respuesta JSON de property info.
   */
  parsePropertyInfo(data: any, propertyId: string): ExpediaPropertyContent {
    const entity = data.entity || data;

    return {
      propertyId,
      name: entity.name || entity.propertyName || '',
      address: {
        street: entity.address?.line1 || entity.address?.addressLine || '',
        city: entity.address?.city || '',
        state: entity.address?.stateProvinceCode || entity.address?.state || undefined,
        postalCode: entity.address?.postalCode || '',
        country: entity.address?.countryCode || '',
      },
      coordinates: entity.geoLocation ? {
        latitude: entity.geoLocation.latitude || 0,
        longitude: entity.geoLocation.longitude || 0,
      } : undefined,
      currency: entity.currency || entity.currencyCode || 'USD',
      starRating: entity.starRating ? parseInt(String(entity.starRating), 10) : undefined,
      propertyType: entity.propertyType || undefined,
      structureType: entity.structureType || undefined,
    };
  },

  // ─── Room Types ───────────────────────────────────────────

  /**
   * Obtener room types configurados en Expedia.
   * GET /properties/{propertyId}/roomTypes
   */
  async getRoomTypes(
    connectionId: string,
  ): Promise<ExpediaRoomType[]> {
    try {
      const credentials = await expediaAuthService.getCredentials(connectionId);
      if (!credentials) return [];

      const url = getApiUrlWithParams(EXPEDIA_ENDPOINTS.PRODUCT_ROOM_TYPES, {
        propertyId: credentials.propertyId,
      });

      const response = await expediaAuthService.fetchWithRetry(url, {
        method: 'GET',
        headers: getJsonHeaders(credentials.eqcUsername, credentials.eqcPassword),
      });

      if (!response.ok) {
        console.error(`[ExpediaProduct] Error obteniendo room types (${response.status})`);
        return [];
      }

      const data = await response.json();
      const roomTypesRaw = data.entity || data.roomTypes || data;

      if (!Array.isArray(roomTypesRaw)) {
        console.warn('[ExpediaProduct] Respuesta de room types no es un array');
        return [];
      }

      return roomTypesRaw.map((rt: any) => this.parseRoomType(rt, connectionId));
    } catch (err) {
      console.error('[ExpediaProduct] Error obteniendo room types:', err);
      return [];
    }
  },

  /**
   * Parsear un room type individual desde JSON.
   */
  parseRoomType(data: any, connectionId: string): ExpediaRoomType {
    const ratePlans: ExpediaRatePlan[] = [];

    // Rate plans pueden venir anidados o hay que consultarlos aparte
    if (data.ratePlans && Array.isArray(data.ratePlans)) {
      for (const rp of data.ratePlans) {
        ratePlans.push(this.parseRatePlan(rp));
      }
    }

    return {
      roomTypeId: data.resourceId || data.roomTypeId || data.id || '',
      roomTypeName: data.name?.value || data.name || data.roomTypeName || '',
      maxOccupancy: data.maxOccupancy?.total
        || data.standardOccupancy
        || data.maxOccupancy
        || 2,
      ratePlans,
    };
  },

  // ─── Rate Plans ───────────────────────────────────────────

  /**
   * Obtener rate plans de un room type específico.
   * GET /properties/{propertyId}/roomTypes/{roomTypeId}/ratePlans
   */
  async getRatePlans(
    connectionId: string,
    roomTypeId: string,
  ): Promise<ExpediaRatePlan[]> {
    try {
      const credentials = await expediaAuthService.getCredentials(connectionId);
      if (!credentials) return [];

      const url = getApiUrlWithParams(EXPEDIA_ENDPOINTS.PRODUCT_RATE_PLANS, {
        propertyId: credentials.propertyId,
        roomTypeId,
      });

      const response = await expediaAuthService.fetchWithRetry(url, {
        method: 'GET',
        headers: getJsonHeaders(credentials.eqcUsername, credentials.eqcPassword),
      });

      if (!response.ok) {
        console.error(`[ExpediaProduct] Error obteniendo rate plans (${response.status})`);
        return [];
      }

      const data = await response.json();
      const ratePlansRaw = data.entity || data.ratePlans || data;

      if (!Array.isArray(ratePlansRaw)) {
        console.warn('[ExpediaProduct] Respuesta de rate plans no es un array');
        return [];
      }

      return ratePlansRaw.map((rp: any) => this.parseRatePlan(rp));
    } catch (err) {
      console.error('[ExpediaProduct] Error obteniendo rate plans:', err);
      return [];
    }
  },

  /**
   * Parsear un rate plan individual desde JSON.
   */
  parseRatePlan(data: any): ExpediaRatePlan {
    const distModel = data.distributionModel || data.distributionRules?.expediaCollect
      ? (data.distributionRules?.hotelCollect ? 'both' : 'ExpediaCollect')
      : 'HotelCollect';

    return {
      ratePlanId: data.resourceId || data.ratePlanId || data.id || '',
      ratePlanName: data.name?.value || data.name || data.ratePlanName || '',
      distributionModel: distModel as ExpediaRatePlan['distributionModel'],
      isActive: data.status === 'Active' || data.active !== false,
      pricingModel: data.pricingModel || data.pricing?.type || 'PerDayPricing',
    };
  },

  // ─── Consulta combinada ───────────────────────────────────

  /**
   * Obtener room types CON rate plans anidados (2 llamadas).
   * Si los rate plans no vienen en la respuesta de room types,
   * hace una llamada adicional por cada room type.
   */
  async getRoomTypesWithRatePlans(
    connectionId: string,
  ): Promise<ExpediaRoomType[]> {
    const roomTypes = await this.getRoomTypes(connectionId);

    // Si ya tienen rate plans, retornar directo
    if (roomTypes.every(rt => rt.ratePlans.length > 0)) {
      return roomTypes;
    }

    // Si no, consultar rate plans por separado
    for (const rt of roomTypes) {
      if (rt.ratePlans.length === 0) {
        rt.ratePlans = await this.getRatePlans(connectionId, rt.roomTypeId);
      }
    }

    await this.logSync(connectionId, 'product_sync', 'inbound',
      'getRoomTypesWithRatePlans', generateRequestId(), 'success', roomTypes.length);

    return roomTypes;
  },

  /**
   * Obtener resumen completo de la propiedad: info + room types + rate plans.
   */
  async getFullPropertySummary(connectionId: string): Promise<{
    property: ExpediaPropertyContent | null;
    roomTypes: ExpediaRoomType[];
  }> {
    const [property, roomTypes] = await Promise.all([
      this.getPropertyInfo(connectionId),
      this.getRoomTypesWithRatePlans(connectionId),
    ]);

    return { property, roomTypes };
  },

  // ─── Sync Log ─────────────────────────────────────────────

  async logSync(
    connectionId: string,
    syncType: ExpediaSyncType,
    direction: ExpediaSyncDirection,
    endpoint: string,
    requestId: string,
    status: ExpediaSyncStatus,
    itemsProcessed: number,
    errorMessage?: string,
  ): Promise<void> {
    try {
      await supabase
        .from('expedia_sync_logs')
        .insert({
          connection_id: connectionId,
          sync_type: syncType,
          direction,
          endpoint,
          request_id: requestId,
          status,
          items_processed: itemsProcessed,
          error_message: errorMessage,
        });
    } catch (err) {
      console.warn('[ExpediaProduct] Error guardando sync log:', err);
    }
  },
};
