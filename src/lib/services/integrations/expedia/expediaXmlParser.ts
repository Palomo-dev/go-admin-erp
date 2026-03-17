// ============================================================
// Parser XML para Expedia Group Lodging API
// Convierte Expedia XML (BR/AR) ↔ objetos TypeScript
// ============================================================

import type {
  ExpediaReservation,
  ExpediaReservationRoom,
  ExpediaGuest,
  ExpediaReservationStatus,
  ExpediaAvailabilityUpdate,
} from './expediaTypes';
import { generateRequestId } from './expediaConfig';

// ─── Helpers de parsing XML ─────────────────────────────────

/**
 * Extraer valor de un atributo XML.
 * Ej: getAttr('<Hotel id="123">', 'id') → '123'
 */
function getAttr(xml: string, attr: string): string | undefined {
  const regex = new RegExp(`${attr}="([^"]*)"`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : undefined;
}

/**
 * Extraer contenido de un tag XML simple.
 * Ej: getTag('<Name>Hotel Sol</Name>', 'Name') → 'Hotel Sol'
 */
function getTag(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : undefined;
}

/**
 * Extraer todos los bloques de un tag XML.
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

// ─── Parser de Reservas (Booking Retrieval - BR API) ─────────

export const expediaXmlParser = {

  /**
   * Parsear respuesta de Booking Retrieval API (GET /eqc/br).
   * Expedia BR retorna <BookingRetrievalRS> con <HotelReservation> blocks.
   */
  parseBookingRetrievalResponse(xml: string): ExpediaReservation[] {
    const reservations: ExpediaReservation[] = [];

    const hotelResBlocks = getAllBlocks(xml, 'HotelReservation');

    for (const block of hotelResBlocks) {
      try {
        const reservation = this.parseHotelReservation(block);
        if (reservation) {
          reservations.push(reservation);
        }
      } catch (err) {
        console.error('[ExpediaXmlParser] Error parseando reserva:', err);
      }
    }

    return reservations;
  },

  /**
   * Parsear un bloque <HotelReservation> individual de Expedia.
   * Formato Expedia BR:
   * <HotelReservation createDateTime="..." source="Expedia" status="confirmed">
   *   <Hotel id="12345" name="Mi Hotel" />
   *   <RoomStay roomTypeID="..." ratePlanID="...">
   *     <StayDate arrival="2026-05-01" departure="2026-05-03" />
   *     <GuestCount adult="2" child="0" />
   *     <PerDayRates currency="COP">
   *       <PerDayRate stayDate="2026-05-01" baseRate="200000" />
   *       ...
   *     </PerDayRates>
   *     <Total amountAfterTaxes="420000" currency="COP" />
   *   </RoomStay>
   *   <PrimaryGuest>
   *     <Name givenName="John" surname="Doe" />
   *     <Phone>+573001234567</Phone>
   *     <Email>john@example.com</Email>
   *   </PrimaryGuest>
   *   <ReservationIDs>
   *     <ReservationID source="Expedia" id="EXP-123456" />
   *   </ReservationIDs>
   *   <SpecialRequest code="1.14">Non-smoking room</SpecialRequest>
   * </HotelReservation>
   */
  parseHotelReservation(xml: string): ExpediaReservation | null {
    // Confirmation ID
    const resIdBlock = getAllBlocks(xml, 'ReservationID')[0] || '';
    const confirmationId = getAttr(resIdBlock, 'id')
      || getAttr(xml, 'id')
      || getAttr(xml, 'confirmNumber');

    if (!confirmationId) {
      console.warn('[ExpediaXmlParser] Reserva sin ID de confirmación');
      return null;
    }

    // Hotel/Property
    const hotelBlock = getAllBlocks(xml, 'Hotel')[0] || xml;
    const propertyId = getAttr(hotelBlock, 'id') || '';

    if (!propertyId) {
      console.warn('[ExpediaXmlParser] Reserva sin Property ID');
      return null;
    }

    // Status
    const rawStatus = getAttr(xml, 'status') || 'confirmed';
    const status = this.parseReservationStatus(rawStatus);

    // Source / Point of Sale
    const pointOfSale = getAttr(xml, 'source') || getAttr(resIdBlock, 'source') || 'expedia';

    // Guest
    const guest = this.parseGuest(xml);

    // Rooms
    const rooms = this.parseRoomStays(xml);

    // Fechas globales (del primer RoomStay)
    const stayDateBlock = getAllBlocks(xml, 'StayDate')[0] || xml;
    const checkin = getAttr(stayDateBlock, 'arrival') || '';
    const checkout = getAttr(stayDateBlock, 'departure') || '';

    // Calcular noches
    const nights = checkin && checkout
      ? Math.ceil(
          (new Date(checkout + 'T00:00:00').getTime() - new Date(checkin + 'T00:00:00').getTime())
          / (1000 * 60 * 60 * 24)
        )
      : 0;

    // Totales
    const totalBlock = getAllBlocks(xml, 'Total')[0] || xml;
    const totalPrice = parseFloat(
      getAttr(totalBlock, 'amountAfterTaxes')
      || getAttr(totalBlock, 'amountBeforeTaxes')
      || '0'
    );
    const currency = getAttr(totalBlock, 'currency') || 'USD';

    // Special requests
    const specialRequestBlocks = getAllBlocks(xml, 'SpecialRequest');
    const specialRequests = specialRequestBlocks.length > 0
      ? specialRequestBlocks.map(b => getTag(b, 'SpecialRequest') || '').filter(Boolean).join('; ')
      : getTag(xml, 'SpecialRequest') || undefined;

    // Timestamps
    const createdAt = getAttr(xml, 'createDateTime') || new Date().toISOString();
    const modifiedAt = getAttr(xml, 'modifyDateTime') || undefined;

    return {
      confirmationId,
      propertyId,
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
      specialRequests,
      pointOfSale: pointOfSale.toLowerCase(),
    };
  },

  /**
   * Parsear datos del huésped de Expedia.
   */
  parseGuest(xml: string): ExpediaGuest {
    const guestBlock = getAllBlocks(xml, 'PrimaryGuest')[0]
      || getAllBlocks(xml, 'Guest')[0]
      || xml;

    const nameBlock = getAllBlocks(guestBlock, 'Name')[0] || guestBlock;

    return {
      firstName: getAttr(nameBlock, 'givenName') || getTag(guestBlock, 'GivenName') || '',
      lastName: getAttr(nameBlock, 'surname') || getTag(guestBlock, 'Surname') || '',
      email: getTag(guestBlock, 'Email') || undefined,
      phone: getTag(guestBlock, 'Phone') || undefined,
      address: {
        street: getTag(guestBlock, 'Address') || getTag(guestBlock, 'AddressLine') || undefined,
        city: getTag(guestBlock, 'City') || undefined,
        state: getTag(guestBlock, 'StateProvinceCode') || undefined,
        postalCode: getTag(guestBlock, 'PostalCode') || undefined,
        country: getTag(guestBlock, 'CountryCode') || getAttr(guestBlock, 'countryCode') || undefined,
      },
    };
  },

  /**
   * Parsear <RoomStay> blocks de Expedia.
   */
  parseRoomStays(xml: string): ExpediaReservationRoom[] {
    const rooms: ExpediaReservationRoom[] = [];
    const roomBlocks = getAllBlocks(xml, 'RoomStay');

    for (const block of roomBlocks) {
      const roomTypeId = getAttr(block, 'roomTypeID') || '';
      const roomTypeName = getAttr(block, 'roomTypeName') || '';
      const ratePlanId = getAttr(block, 'ratePlanID') || '';
      const ratePlanName = getAttr(block, 'ratePlanName') || '';

      // Occupancy
      const guestCountBlock = getAllBlocks(block, 'GuestCount')[0] || block;
      const adults = parseInt(getAttr(guestCountBlock, 'adult') || '1', 10);
      const children = parseInt(getAttr(guestCountBlock, 'child') || '0', 10);

      // Smoking preference
      const smokingRaw = getAttr(block, 'smokingPreference') || 'no_preference';
      const smokingPreference = smokingRaw === 'smoking' ? 'smoking' as const
        : smokingRaw === 'non-smoking' ? 'non-smoking' as const
        : 'no_preference' as const;

      // Per day rates
      const rateBlocks = getAllBlocks(block, 'PerDayRate');
      const pricePerNight = rateBlocks.map(r =>
        parseFloat(getAttr(r, 'baseRate') || getAttr(r, 'rate') || '0')
      );

      // Total
      const totalBlock = getAllBlocks(block, 'Total')[0] || block;
      const totalPrice = parseFloat(getAttr(totalBlock, 'amountAfterTaxes') || '0');
      const currency = getAttr(totalBlock, 'currency')
        || getAttr(getAllBlocks(block, 'PerDayRates')[0] || '', 'currency')
        || 'USD';

      // Special requests per room
      const specialRequests = getTag(block, 'SpecialRequest') || undefined;

      rooms.push({
        roomTypeId,
        roomTypeName: roomTypeName || undefined,
        ratePlanId,
        ratePlanName: ratePlanName || undefined,
        adults,
        children,
        pricePerNight,
        totalPrice,
        currency,
        smokingPreference,
        specialRequests,
      });
    }

    return rooms;
  },

  /**
   * Parsear status de reserva Expedia.
   */
  parseReservationStatus(raw: string): ExpediaReservationStatus {
    const lower = raw.toLowerCase();
    if (lower === 'cancelled' || lower === 'canceled') return 'cancelled';
    if (lower === 'modified') return 'modified';
    return 'new';
  },

  // ─── Builders XML ─────────────────────────────────────────

  /**
   * Construir XML de confirmación para BR API (PUT /eqc/br).
   * Expedia espera un BookingConfirmRQ con el confirmation number del hotel.
   */
  buildBookingConfirmXml(params: {
    propertyId: string;
    expediaConfirmationId: string;
    hotelConfirmationId: string;
  }): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<BookingConfirmRQ xmlns="http://www.expediaconnect.com/EQC/BR/2014/01">
  <Hotel id="${escapeXml(params.propertyId)}" />
  <BookingConfirmNumbers>
    <BookingConfirmNumber>
      <ExpediaID>${escapeXml(params.expediaConfirmationId)}</ExpediaID>
      <HotelID>${escapeXml(params.hotelConfirmationId)}</HotelID>
    </BookingConfirmNumber>
  </BookingConfirmNumbers>
</BookingConfirmRQ>`;
  },

  /**
   * Construir XML para AR API (PUT /eqc/ar) — Actualizar disponibilidad y tarifas.
   * Formato Expedia AR:
   * <AvailRateUpdateRQ>
   *   <Hotel id="..." />
   *   <AvailRateUpdate>
   *     <DateRange from="2026-05-01" to="2026-05-03" />
   *     <RoomType id="..." closed="false">
   *       <Inventory totalInventoryAvailable="5" />
   *       <RatePlan id="..." closed="false">
   *         <Rate currency="COP">
   *           <PerDay rate="200000" />
   *         </Rate>
   *         <Restrictions minLOS="1" maxLOS="28" closedToArrival="false" closedToDeparture="false" />
   *       </RatePlan>
   *     </RoomType>
   *   </AvailRateUpdate>
   * </AvailRateUpdateRQ>
   */
  buildAvailabilityUpdateXml(update: ExpediaAvailabilityUpdate): string {
    const dateEntries = update.dates.map(d => {
      const restrictions: string[] = [];
      if (d.minimumStay !== undefined) restrictions.push(`minLOS="${d.minimumStay}"`);
      if (d.maximumStay !== undefined) restrictions.push(`maxLOS="${d.maximumStay}"`);
      if (d.closedToArrival !== undefined) restrictions.push(`closedToArrival="${d.closedToArrival}"`);
      if (d.closedToDeparture !== undefined) restrictions.push(`closedToDeparture="${d.closedToDeparture}"`);

      const restrictionsTag = restrictions.length > 0
        ? `\n          <Restrictions ${restrictions.join(' ')} />`
        : '';

      const priceTag = d.price !== undefined
        ? `\n          <RatePlan id="${escapeXml(update.ratePlanId)}" closed="${d.closed || false}">
            <Rate currency="USD">
              <PerDay rate="${d.price}" />
            </Rate>${restrictionsTag}
          </RatePlan>`
        : '';

      const inventoryTag = d.totalInventoryAvailable !== undefined
        ? `\n        <Inventory totalInventoryAvailable="${d.totalInventoryAvailable}" />`
        : '';

      return `
    <AvailRateUpdate>
      <DateRange from="${d.date}" to="${d.date}" />
      <RoomType id="${escapeXml(update.roomTypeId)}" closed="${d.closed || false}">${inventoryTag}${priceTag}
      </RoomType>
    </AvailRateUpdate>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<AvailRateUpdateRQ xmlns="http://www.expediaconnect.com/EQC/AR/2011/06">
  <Authentication username="" password="" />
  <Hotel id="${escapeXml(update.propertyId)}" />${dateEntries}
</AvailRateUpdateRQ>`;
  },

  /**
   * Parsear respuesta de error XML de Expedia.
   */
  parseErrorResponse(xml: string): { code: string; message: string } | null {
    const errorBlock = getAllBlocks(xml, 'Error')[0];
    if (!errorBlock) return null;

    return {
      code: getAttr(errorBlock, 'code') || getAttr(errorBlock, 'Code') || 'UNKNOWN',
      message: getTag(errorBlock, 'Error')
        || getAttr(errorBlock, 'message')
        || getAttr(errorBlock, 'ShortText')
        || 'Unknown error',
    };
  },

  /**
   * Verificar si la respuesta XML indica éxito.
   */
  isSuccessResponse(xml: string): boolean {
    return xml.includes('<Success') || xml.includes('<Success/>')
      || xml.includes('success="true"') || xml.includes('status="Success"');
  },
};
