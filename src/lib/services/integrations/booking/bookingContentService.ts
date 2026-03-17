// ============================================================
// Servicio de Contenido — Booking.com Connectivity API
// Sync de descripción, fotos, facilidades y políticas
// ============================================================

import { supabase } from '@/lib/supabase/config';
import { bookingAuthService } from './bookingAuthService';
import { bookingXmlParser } from './bookingXmlParser';
import {
  BOOKING_ENDPOINTS,
  getSupplyUrl,
  getXmlHeaders,
  getJsonHeaders,
  generateRuid,
} from './bookingConfig';
import type {
  BookingPropertyContent,
  BookingRoomType,
  BookingRatePlan,
  BookingPhoto,
  BookingSyncLog,
} from './bookingTypes';

/**
 * Servicio para gestionar contenido de propiedades en Booking.com.
 * Lectura y actualización de descripción, fotos, rooms y facilidades.
 */
export const bookingContentService = {

  // ─── Obtener Información de Propiedad ─────────────────────

  /**
   * Obtener contenido actual de la propiedad desde Booking.com.
   * Usa OTA_HotelDescriptiveInfo (GET).
   */
  async getPropertyContent(
    connectionId: string,
    hotelId: string,
  ): Promise<BookingPropertyContent | null> {
    const ruid = generateRuid();

    try {
      const token = await bookingAuthService.getValidToken(connectionId);
      if (!token) return null;

      const url = getSupplyUrl(BOOKING_ENDPOINTS.CONTENT_READ);
      const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<OTA_HotelDescriptiveInfoRQ xmlns="http://www.opentravel.org/OTA/2003/05"
  Version="1.0"
  TimeStamp="${new Date().toISOString()}"
  EchoToken="${ruid}">
  <HotelDescriptiveInfos>
    <HotelDescriptiveInfo HotelCode="${hotelId}">
      <HotelInfo SendData="true" />
      <FacilityInfo SendData="true" />
      <Policies SendData="true" />
      <AreaInfo SendData="true" />
      <ContactInfo SendData="true" />
    </HotelDescriptiveInfo>
  </HotelDescriptiveInfos>
</OTA_HotelDescriptiveInfoRQ>`;

      const response = await bookingAuthService.fetchWithRetry(url, {
        method: 'POST',
        headers: getXmlHeaders(token),
        body: xmlBody,
      });

      if (!response.ok) {
        console.error(`[BookingContent] Error obteniendo contenido (${response.status})`);
        return null;
      }

      const xml = await response.text();
      return this.parsePropertyContent(xml, hotelId);
    } catch (err) {
      console.error('[BookingContent] Error:', err);
      return null;
    }
  },

  /**
   * Parsear respuesta XML de contenido de propiedad.
   */
  parsePropertyContent(xml: string, hotelId: string): BookingPropertyContent {
    const getAttr = (str: string, attr: string): string | undefined => {
      const regex = new RegExp(`${attr}="([^"]*)"`, 'i');
      const match = str.match(regex);
      return match ? match[1] : undefined;
    };

    const getTag = (str: string, tag: string): string | undefined => {
      const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
      const match = str.match(regex);
      return match ? match[1].trim() : undefined;
    };

    return {
      hotelId,
      name: getAttr(xml, 'HotelName') || '',
      address: {
        street: getTag(xml, 'AddressLine') || '',
        city: getTag(xml, 'CityName') || '',
        state: getTag(xml, 'StateProv') || undefined,
        postalCode: getTag(xml, 'PostalCode') || '',
        country: getAttr(xml, 'CountryName') || getTag(xml, 'CountryName') || '',
      },
      coordinates: (() => {
        const lat = getAttr(xml, 'Latitude');
        const lng = getAttr(xml, 'Longitude');
        if (lat && lng) return { latitude: parseFloat(lat), longitude: parseFloat(lng) };
        return undefined;
      })(),
      description: getTag(xml, 'Description') || getTag(xml, 'Text') || undefined,
      checkInTime: getAttr(xml, 'CheckInTime') || getTag(xml, 'CheckInTime') || undefined,
      checkOutTime: getAttr(xml, 'CheckOutTime') || getTag(xml, 'CheckOutTime') || undefined,
      currency: getAttr(xml, 'CurrencyCode') || 'COP',
      starRating: (() => {
        const rating = getAttr(xml, 'Rating');
        return rating ? parseInt(rating, 10) : undefined;
      })(),
    };
  },

  // ─── Obtener Room Types y Rate Plans ──────────────────────

  /**
   * Obtener room types y rate plans configurados en Booking.com.
   * Útil para el mapeo con space_types de GO Admin.
   */
  async getRoomTypes(
    connectionId: string,
    hotelId: string,
  ): Promise<BookingRoomType[]> {
    const ruid = generateRuid();

    try {
      const token = await bookingAuthService.getValidToken(connectionId);
      if (!token) return [];

      const url = getSupplyUrl(BOOKING_ENDPOINTS.CONTENT_READ);
      const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<OTA_HotelDescriptiveInfoRQ xmlns="http://www.opentravel.org/OTA/2003/05"
  Version="1.0"
  TimeStamp="${new Date().toISOString()}"
  EchoToken="${ruid}">
  <HotelDescriptiveInfos>
    <HotelDescriptiveInfo HotelCode="${hotelId}">
      <GuestRoomInfo SendData="true" />
    </HotelDescriptiveInfo>
  </HotelDescriptiveInfos>
</OTA_HotelDescriptiveInfoRQ>`;

      const response = await bookingAuthService.fetchWithRetry(url, {
        method: 'POST',
        headers: getXmlHeaders(token),
        body: xmlBody,
      });

      if (!response.ok) return [];

      const xml = await response.text();
      return this.parseRoomTypes(xml);
    } catch (err) {
      console.error('[BookingContent] Error obteniendo room types:', err);
      return [];
    }
  },

  /**
   * Parsear room types desde XML.
   */
  parseRoomTypes(xml: string): BookingRoomType[] {
    const rooms: BookingRoomType[] = [];

    // Buscar bloques GuestRoom
    const guestRoomRegex = /<GuestRoom[^>]*>[\s\S]*?<\/GuestRoom>/gi;
    const guestRoomBlocks = xml.match(guestRoomRegex) || [];

    for (const block of guestRoomBlocks) {
      const roomIdMatch = block.match(/RoomTypeCode="([^"]*)"/i);
      const roomNameMatch = block.match(/RoomTypeName="([^"]*)"/i) || block.match(/RoomID="([^"]*)"/i);
      const maxOccMatch = block.match(/MaxOccupancy="([^"]*)"/i);

      if (!roomIdMatch) continue;

      const roomId = roomIdMatch[1];
      const roomName = roomNameMatch ? roomNameMatch[1] : roomId;
      const maxOccupancy = maxOccMatch ? parseInt(maxOccMatch[1], 10) : 2;

      // Buscar rate plans dentro del room
      const ratePlanRegex = /<RatePlan[^>]*>/gi;
      const ratePlanBlocks = block.match(ratePlanRegex) || [];
      const ratePlans: BookingRatePlan[] = [];

      for (const rpBlock of ratePlanBlocks) {
        const rpIdMatch = rpBlock.match(/RatePlanCode="([^"]*)"/i);
        const rpNameMatch = rpBlock.match(/RatePlanName="([^"]*)"/i);
        const mealMatch = rpBlock.match(/MealPlanCode="([^"]*)"/i);

        if (rpIdMatch) {
          ratePlans.push({
            ratePlanId: rpIdMatch[1],
            ratePlanName: rpNameMatch ? rpNameMatch[1] : rpIdMatch[1],
            mealPlan: bookingXmlParser.parseMealPlan(mealMatch ? mealMatch[1] : 'RO'),
            isActive: true,
          });
        }
      }

      rooms.push({
        roomId,
        roomName,
        maxOccupancy,
        ratePlans,
      });
    }

    return rooms;
  },

  // ─── Actualizar Contenido ─────────────────────────────────

  /**
   * Actualizar descripción de la propiedad en Booking.com.
   */
  async updatePropertyDescription(
    connectionId: string,
    hotelId: string,
    description: string,
  ): Promise<{ success: boolean; message: string }> {
    const ruid = generateRuid();

    try {
      const token = await bookingAuthService.getValidToken(connectionId);
      if (!token) return { success: false, message: 'Sin token de autenticación' };

      const escapedDesc = description
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      const url = getSupplyUrl(BOOKING_ENDPOINTS.CONTENT_UPDATE);
      const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<OTA_HotelDescriptiveContentNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05"
  Version="1.0"
  TimeStamp="${new Date().toISOString()}"
  EchoToken="${ruid}">
  <HotelDescriptiveContents>
    <HotelDescriptiveContent HotelCode="${hotelId}">
      <HotelInfo>
        <Descriptions>
          <MultimediaDescription>
            <TextItems>
              <TextItem>
                <Description>${escapedDesc}</Description>
              </TextItem>
            </TextItems>
          </MultimediaDescription>
        </Descriptions>
      </HotelInfo>
    </HotelDescriptiveContent>
  </HotelDescriptiveContents>
</OTA_HotelDescriptiveContentNotifRQ>`;

      const response = await bookingAuthService.fetchWithRetry(url, {
        method: 'POST',
        headers: getXmlHeaders(token),
        body: xmlBody,
      });

      const responseText = await response.text();

      if (!response.ok || !bookingXmlParser.isSuccessResponse(responseText)) {
        const error = bookingXmlParser.parseErrorResponse(responseText);
        return { success: false, message: error?.message || `HTTP ${response.status}` };
      }

      await this.logSync(connectionId, 'content_sync', 'outbound', url, ruid, 'success', 1);
      return { success: true, message: 'Descripción actualizada correctamente' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: msg };
    }
  },

  // ─── Fotos ────────────────────────────────────────────────

  /**
   * Obtener fotos de la propiedad desde Booking.com.
   */
  async getPhotos(
    connectionId: string,
    hotelId: string,
  ): Promise<BookingPhoto[]> {
    try {
      const token = await bookingAuthService.getValidToken(connectionId);
      if (!token) return [];

      // Photo API usa JSON
      const url = `${getSupplyUrl('')}/properties/${hotelId}/photos`;
      const response = await bookingAuthService.fetchWithRetry(url, {
        method: 'GET',
        headers: getJsonHeaders(token),
      });

      if (!response.ok) return [];

      const data = await response.json();

      if (!Array.isArray(data)) return [];

      return data.map((photo: any, idx: number) => ({
        photoId: photo.id || photo.photo_id || String(idx),
        url: photo.url || photo.photo_url || '',
        sortOrder: photo.sort_order || photo.position || idx,
        tags: photo.tags || [],
        roomId: photo.room_id || undefined,
      }));
    } catch (err) {
      console.error('[BookingContent] Error obteniendo fotos:', err);
      return [];
    }
  },

  // ─── Sync Log ─────────────────────────────────────────────

  async logSync(
    connectionId: string,
    syncType: BookingSyncLog['syncType'],
    direction: BookingSyncLog['direction'],
    endpoint: string,
    ruid: string,
    status: BookingSyncLog['status'],
    itemsProcessed: number,
    errorMessage?: string,
  ): Promise<void> {
    try {
      await supabase
        .from('booking_sync_logs')
        .insert({
          connection_id: connectionId,
          sync_type: syncType,
          direction,
          endpoint,
          request_ruid: ruid,
          status,
          items_processed: itemsProcessed,
          error_message: errorMessage,
        });
    } catch (err) {
      console.warn('[BookingContent] Error guardando sync log:', err);
    }
  },
};
