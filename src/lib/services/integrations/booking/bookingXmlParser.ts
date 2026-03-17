// ============================================================
// Parser XML para Booking.com Connectivity API
// Convierte OTA XML ↔ objetos TypeScript
// ============================================================

import type {
  BookingReservation,
  BookingReservationRoom,
  BookingGuest,
  BookingMealPlan,
  BookingReservationStatus,
  BookingReservationAcknowledge,
  BookingAvailabilityUpdate,
  BookingRateUpdate,
} from './bookingTypes';
import { generateRuid } from './bookingConfig';

// ─── Helpers de parsing XML ─────────────────────────────────

/**
 * Extraer valor de un atributo XML.
 * Ej: getAttr('<Room RoomID="123">', 'RoomID') → '123'
 */
function getAttr(xml: string, attr: string): string | undefined {
  const regex = new RegExp(`${attr}="([^"]*)"`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : undefined;
}

/**
 * Extraer contenido de un tag XML simple.
 * Ej: getTag('<Name>John</Name>', 'Name') → 'John'
 */
function getTag(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : undefined;
}

/**
 * Extraer todos los bloques de un tag XML.
 * Ej: getAllBlocks(xml, 'RoomStay') → ['<RoomStay>...</RoomStay>', ...]
 */
function getAllBlocks(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, 'gi');
  return xml.match(regex) || [];
}

/**
 * Escapar caracteres especiales XML.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─── Parsers de Reservas (OTA_HotelResNotif) ────────────────

export const bookingXmlParser = {

  /**
   * Parsear respuesta OTA_HotelResNotifRQ (reservas nuevas).
   * Retorna array de reservas parseadas.
   */
  parseReservationsResponse(xml: string): BookingReservation[] {
    const reservations: BookingReservation[] = [];

    // Extraer cada HotelReservation
    const hotelResBlocks = getAllBlocks(xml, 'HotelReservation');

    for (const block of hotelResBlocks) {
      try {
        const reservation = this.parseHotelReservation(block);
        if (reservation) {
          reservations.push(reservation);
        }
      } catch (err) {
        console.error('[BookingXmlParser] Error parseando reserva:', err);
      }
    }

    return reservations;
  },

  /**
   * Parsear un bloque <HotelReservation> individual.
   */
  parseHotelReservation(xml: string): BookingReservation | null {
    const reservationId = getAttr(xml, 'ResID_Value') || getAttr(xml, 'ID');
    const hotelId = getAttr(xml, 'HotelCode');

    if (!reservationId || !hotelId) {
      console.warn('[BookingXmlParser] Reserva sin ID o HotelCode');
      return null;
    }

    // Status
    const resStatus = getAttr(xml, 'ResStatus');
    let status: BookingReservationStatus = 'new';
    if (resStatus === 'Cancel' || resStatus === 'Cancelled') status = 'cancelled';
    else if (resStatus === 'Modify' || resStatus === 'Modified') status = 'modified';

    // Guest
    const guest = this.parseGuest(xml);

    // Rooms
    const rooms = this.parseRoomStays(xml);

    // Fechas del primer room (check-in/check-out global)
    const checkin = rooms.length > 0
      ? this.extractDate(xml, 'Start') || ''
      : '';
    const checkout = rooms.length > 0
      ? this.extractDate(xml, 'End') || ''
      : '';

    // Calcular noches
    const nights = checkin && checkout
      ? Math.ceil((new Date(checkout + 'T00:00:00').getTime() - new Date(checkin + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // Totales
    const totalPrice = parseFloat(getAttr(xml, 'AmountAfterTax') || '0');
    const currency = getAttr(xml, 'CurrencyCode') || 'EUR';
    const commissionAmount = parseFloat(getAttr(xml, 'Commission') || '0') || undefined;

    // Special requests
    const specialRequests = getTag(xml, 'Text') || getTag(xml, 'SpecialRequest');

    // Timestamps
    const createdAt = getAttr(xml, 'CreateDateTime') || new Date().toISOString();
    const modifiedAt = getAttr(xml, 'LastModifyDateTime');

    return {
      reservationId,
      hotelId,
      status,
      createdAt,
      modifiedAt,
      checkin,
      checkout,
      nights,
      guest,
      rooms,
      totalPrice,
      currency,
      commissionAmount,
      specialRequests,
    };
  },

  /**
   * Parsear datos del huésped desde XML.
   */
  parseGuest(xml: string): BookingGuest {
    const profileBlock = getAllBlocks(xml, 'Customer')[0] || getAllBlocks(xml, 'Profile')[0] || xml;

    return {
      firstName: getTag(profileBlock, 'GivenName') || '',
      lastName: getTag(profileBlock, 'Surname') || '',
      email: getTag(profileBlock, 'Email') || undefined,
      phone: getAttr(profileBlock, 'PhoneNumber') || getTag(profileBlock, 'Telephone') || undefined,
      address: {
        street: getTag(profileBlock, 'AddressLine') || undefined,
        city: getTag(profileBlock, 'CityName') || undefined,
        state: getTag(profileBlock, 'StateProv') || undefined,
        postalCode: getTag(profileBlock, 'PostalCode') || undefined,
        country: getAttr(profileBlock, 'CountryName') || getTag(profileBlock, 'CountryName') || undefined,
      },
    };
  },

  /**
   * Parsear <RoomStay> blocks.
   */
  parseRoomStays(xml: string): BookingReservationRoom[] {
    const rooms: BookingReservationRoom[] = [];
    const roomBlocks = getAllBlocks(xml, 'RoomStay');

    for (const block of roomBlocks) {
      const roomId = getAttr(block, 'RoomTypeCode') || getAttr(block, 'InvCode') || '';
      const roomName = getAttr(block, 'RoomTypeName') || getTag(block, 'RoomDescription') || '';
      const ratePlanId = getAttr(block, 'RatePlanCode') || '';
      const ratePlanName = getAttr(block, 'RatePlanName') || '';

      // Meal plan
      const mealCode = getAttr(block, 'MealPlanCode') || 'RO';
      const mealPlan = this.parseMealPlan(mealCode);

      // Occupancy
      const adults = parseInt(getAttr(block, 'AgeQualifyingCode') === '10'
        ? getAttr(block, 'Count') || '1'
        : '1', 10);
      const children = parseInt(getTag(block, 'ChildCount') || '0', 10);

      // Price
      const totalPrice = parseFloat(getAttr(block, 'AmountAfterTax') || '0');
      const currency = getAttr(block, 'CurrencyCode') || 'EUR';

      // Price per night
      const rateBlocks = getAllBlocks(block, 'Rate');
      const pricePerNight = rateBlocks.map(r =>
        parseFloat(getAttr(r, 'AmountAfterTax') || '0')
      );

      // Guest name for this room
      const guestName = getTag(block, 'GivenName')
        ? `${getTag(block, 'GivenName')} ${getTag(block, 'Surname') || ''}`
        : '';

      const specialRequests = getTag(block, 'SpecialRequest') || getTag(block, 'Text');

      rooms.push({
        roomId,
        roomName,
        ratePlanId,
        ratePlanName: ratePlanName || undefined,
        mealPlan,
        adults,
        children,
        pricePerNight,
        totalPrice,
        currency,
        guestName: guestName.trim(),
        specialRequests,
      });
    }

    return rooms;
  },

  /**
   * Parsear código de meal plan a enum.
   */
  parseMealPlan(code: string): BookingMealPlan {
    const map: Record<string, BookingMealPlan> = {
      '1': 'AI', '2': 'BB', '3': 'FB', '4': 'HB',
      '14': 'RO', 'RO': 'RO', 'BB': 'BB', 'HB': 'HB',
      'FB': 'FB', 'AI': 'AI',
    };
    return map[code.toUpperCase()] || 'RO';
  },

  /**
   * Extraer fecha de un atributo (Start, End, etc.).
   */
  extractDate(xml: string, attr: string): string | undefined {
    const val = getAttr(xml, attr);
    if (!val) return undefined;
    // Puede venir como "2026-04-15" o "2026-04-15T14:00:00"
    return val.substring(0, 10);
  },

  // ─── Builders XML ─────────────────────────────────────────

  /**
   * Construir XML de acknowledge para OTA_HotelResNotifRS.
   */
  buildAcknowledgeXml(acknowledges: BookingReservationAcknowledge[]): string {
    const ruid = generateRuid();

    const resItems = acknowledges.map(ack => {
      if (ack.success) {
        return `
      <HotelReservation ResStatus="Commit">
        <UniqueID Type="14" ID="${escapeXml(ack.reservationId)}" />
      </HotelReservation>`;
      }
      return `
      <HotelReservation ResStatus="Error">
        <UniqueID Type="14" ID="${escapeXml(ack.reservationId)}" />
        <Errors>
          <Error Type="1" Code="450">${escapeXml(ack.errorMessage || 'Processing error')}</Error>
        </Errors>
      </HotelReservation>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<OTA_HotelResNotifRS xmlns="http://www.opentravel.org/OTA/2003/05"
  Version="1.0"
  TimeStamp="${new Date().toISOString()}"
  EchoToken="${ruid}">
  <Success />
  <HotelReservations>${resItems}
  </HotelReservations>
</OTA_HotelResNotifRS>`;
  },

  /**
   * Construir XML B.XML para actualizar disponibilidad.
   */
  buildAvailabilityXml(update: BookingAvailabilityUpdate): string {
    const dateEntries = update.dates.map(d => {
      const parts: string[] = [];
      if (d.price !== undefined) parts.push(`<price>${d.price}</price>`);
      if (d.roomsToSell !== undefined) parts.push(`<rooms_to_sell>${d.roomsToSell}</rooms_to_sell>`);
      parts.push(`<closed>${d.closed ? 1 : 0}</closed>`);
      if (d.minimumStay !== undefined) parts.push(`<minimumstay>${d.minimumStay}</minimumstay>`);
      if (d.maximumStay !== undefined) parts.push(`<maximumstay>${d.maximumStay}</maximumstay>`);
      if (d.closedOnArrival !== undefined) parts.push(`<closedonarrival>${d.closedOnArrival ? 1 : 0}</closedonarrival>`);
      if (d.closedOnDeparture !== undefined) parts.push(`<closedondeparture>${d.closedOnDeparture ? 1 : 0}</closedondeparture>`);

      return `
      <date value="${d.date}">
        <rate id="${escapeXml(update.ratePlanId)}">
          ${parts.join('\n          ')}
        </rate>
      </date>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<request>
  <hotel_id>${escapeXml(update.hotelId)}</hotel_id>
  <room id="${escapeXml(update.roomId)}">${dateEntries}
  </room>
</request>`;
  },

  /**
   * Construir XML OTA para actualizar tarifas (OTA_HotelRateAmountNotif).
   */
  buildRateUpdateXml(update: BookingRateUpdate): string {
    const ruid = generateRuid();

    const rateAmounts = update.dates.map(d => {
      const attrs = [`AmountAfterTax="${d.price}"`];
      if (d.extraAdultPrice) attrs.push(`AdditionalGuestAmountAdult="${d.extraAdultPrice}"`);
      if (d.extraChildPrice) attrs.push(`AdditionalGuestAmountChild="${d.extraChildPrice}"`);

      return `
        <Rate Start="${d.date}" End="${d.date}" ${attrs.join(' ')} />`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<OTA_HotelRateAmountNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05"
  Version="1.0"
  TimeStamp="${new Date().toISOString()}"
  EchoToken="${ruid}">
  <RateAmountMessages HotelCode="${escapeXml(update.hotelId)}">
    <RateAmountMessage>
      <StatusApplicationControl
        InvTypeCode="${escapeXml(update.roomId)}"
        RatePlanCode="${escapeXml(update.ratePlanId)}" />
      <Rates>${rateAmounts}
      </Rates>
    </RateAmountMessage>
  </RateAmountMessages>
</OTA_HotelRateAmountNotifRQ>`;
  },

  /**
   * Parsear respuesta de error XML genérica.
   */
  parseErrorResponse(xml: string): { code: string; message: string } | null {
    const errorBlock = getAllBlocks(xml, 'Error')[0];
    if (!errorBlock) return null;

    return {
      code: getAttr(errorBlock, 'Code') || 'UNKNOWN',
      message: getTag(errorBlock, 'Error') || getAttr(errorBlock, 'ShortText') || 'Unknown error',
    };
  },

  /**
   * Verificar si la respuesta XML indica éxito.
   */
  isSuccessResponse(xml: string): boolean {
    return xml.includes('<Success') || xml.includes('<Success/>');
  },
};
