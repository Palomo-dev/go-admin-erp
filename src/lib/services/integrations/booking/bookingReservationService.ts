// ============================================================
// Servicio de Reservas — Booking.com Connectivity API
// Poll, parse, acknowledge y mapeo a reservas GO Admin
// ============================================================

import { supabase } from '@/lib/supabase/config';
import { bookingAuthService } from './bookingAuthService';
import { bookingXmlParser } from './bookingXmlParser';
import {
  BOOKING_ENDPOINTS,
  BOOKING_ACK_DELAY_MS,
  getSecureUrl,
  getXmlHeaders,
  generateRuid,
} from './bookingConfig';
import type {
  BookingReservation,
  BookingReservationAcknowledge,
  BookingSyncLog,
  BookingReservationDetail,
} from './bookingTypes';

/**
 * Servicio para gestionar reservas de Booking.com.
 * Implementa el flujo OTA: GET → parse → save → POST acknowledge.
 */
export const bookingReservationService = {

  // ─── Poll de Reservas Nuevas ──────────────────────────────

  /**
   * Poll de reservas nuevas desde Booking.com (OTA_HotelResNotif).
   * 1. GET para obtener reservas pendientes
   * 2. Parse XML → objetos
   * 3. Guardar en Supabase
   * 4. POST acknowledge
   */
  async pollNewReservations(connectionId: string): Promise<{
    processed: number;
    errors: number;
    reservations: BookingReservation[];
  }> {
    const ruid = generateRuid();
    let processed = 0;
    let errors = 0;
    const allReservations: BookingReservation[] = [];

    try {
      // 1. Obtener token válido
      const token = await bookingAuthService.getValidToken(connectionId);
      if (!token) {
        await this.logSync(connectionId, 'reservation_poll', 'inbound',
          BOOKING_ENDPOINTS.RESERVATIONS_NEW, ruid, 'error', 0, 'No se pudo obtener token');
        return { processed: 0, errors: 1, reservations: [] };
      }

      // 2. GET reservas nuevas
      const url = getSecureUrl(BOOKING_ENDPOINTS.RESERVATIONS_NEW);
      const response = await bookingAuthService.fetchWithRetry(url, {
        method: 'GET',
        headers: getXmlHeaders(token),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[BookingReservations] Error poll (${response.status}):`, errorText);
        await this.logSync(connectionId, 'reservation_poll', 'inbound',
          url, ruid, 'error', 0, `HTTP ${response.status}: ${errorText.substring(0, 200)}`);
        return { processed: 0, errors: 1, reservations: [] };
      }

      const xml = await response.text();

      // 3. Parsear reservas
      const reservations = bookingXmlParser.parseReservationsResponse(xml);

      if (reservations.length === 0) {
        // Sin reservas pendientes — normal
        return { processed: 0, errors: 0, reservations: [] };
      }

      console.log(`[BookingReservations] ${reservations.length} reserva(s) recibida(s). RUID: ${ruid}`);

      // 4. Procesar cada reserva
      const acknowledges: BookingReservationAcknowledge[] = [];

      for (const reservation of reservations) {
        try {
          await this.processReservation(connectionId, reservation);
          acknowledges.push({ reservationId: reservation.reservationId, success: true });
          processed++;
          allReservations.push(reservation);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[BookingReservations] Error procesando reserva ${reservation.reservationId}:`, msg);
          acknowledges.push({
            reservationId: reservation.reservationId,
            success: false,
            errorMessage: msg,
          });
          errors++;
        }
      }

      // 5. Acknowledge (esperar delay recomendado)
      if (acknowledges.length > 0) {
        await new Promise(resolve => setTimeout(resolve, BOOKING_ACK_DELAY_MS));
        await this.acknowledgeReservations(connectionId, token, acknowledges);
      }

      // 6. Log
      await this.logSync(connectionId, 'reservation_poll', 'inbound',
        url, ruid, errors > 0 ? 'partial' : 'success', processed,
        errors > 0 ? `${errors} error(es) en procesamiento` : undefined);

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[BookingReservations] Error general en poll:', msg);
      await this.logSync(connectionId, 'reservation_poll', 'inbound',
        BOOKING_ENDPOINTS.RESERVATIONS_NEW, ruid, 'error', 0, msg);
      errors++;
    }

    return { processed, errors, reservations: allReservations };
  },

  // ─── Poll de Modificaciones/Cancelaciones ─────────────────

  /**
   * Poll de reservas modificadas/canceladas (OTA_HotelResModifyNotif).
   */
  async pollModifiedReservations(connectionId: string): Promise<{
    processed: number;
    errors: number;
  }> {
    const ruid = generateRuid();
    let processed = 0;
    let errors = 0;

    try {
      const token = await bookingAuthService.getValidToken(connectionId);
      if (!token) return { processed: 0, errors: 1 };

      const url = getSecureUrl(BOOKING_ENDPOINTS.RESERVATIONS_MODIFIED);
      const response = await bookingAuthService.fetchWithRetry(url, {
        method: 'GET',
        headers: getXmlHeaders(token),
      });

      if (!response.ok) {
        await this.logSync(connectionId, 'reservation_poll', 'inbound',
          url, ruid, 'error', 0, `HTTP ${response.status}`);
        return { processed: 0, errors: 1 };
      }

      const xml = await response.text();
      const reservations = bookingXmlParser.parseReservationsResponse(xml);

      if (reservations.length === 0) {
        return { processed: 0, errors: 0 };
      }

      const acknowledges: BookingReservationAcknowledge[] = [];

      for (const reservation of reservations) {
        try {
          if (reservation.status === 'cancelled') {
            await this.processCancellation(connectionId, reservation);
          } else {
            await this.processModification(connectionId, reservation);
          }
          acknowledges.push({ reservationId: reservation.reservationId, success: true });
          processed++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          acknowledges.push({ reservationId: reservation.reservationId, success: false, errorMessage: msg });
          errors++;
        }
      }

      // Acknowledge modificaciones
      if (acknowledges.length > 0) {
        await new Promise(resolve => setTimeout(resolve, BOOKING_ACK_DELAY_MS));
        await this.acknowledgeModifications(connectionId, token, acknowledges);
      }

      await this.logSync(connectionId, 'reservation_poll', 'inbound',
        url, ruid, errors > 0 ? 'partial' : 'success', processed);

    } catch (err) {
      errors++;
    }

    return { processed, errors };
  },

  // ─── Procesamiento de Reservas ────────────────────────────

  /**
   * Procesar una reserva nueva: crear en Supabase.
   */
  async processReservation(connectionId: string, booking: BookingReservation): Promise<string> {
    // 1. Obtener organización de la conexión
    const { data: connData } = await supabase
      .from('channel_connections')
      .select('organization_id, space_id')
      .eq('external_property_id', booking.hotelId)
      .eq('channel', 'booking')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!connData) {
      throw new Error(`No hay channel_connection activa para hotel ${booking.hotelId}`);
    }

    // 2. Verificar si la reserva ya existe (evitar duplicados)
    const { data: existing } = await supabase
      .from('booking_reservation_details')
      .select('id, reservation_id')
      .eq('booking_reservation_id', booking.reservationId)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`[BookingReservations] Reserva ${booking.reservationId} ya existe. Omitiendo.`);
      return existing[0].reservation_id;
    }

    // 3. Buscar o crear customer
    const customerId = await this.findOrCreateCustomer(
      connData.organization_id,
      booking.guest,
    );

    // 4. Crear reserva en GO Admin
    const code = booking.reservationId.substring(0, 8).toUpperCase();
    const { data: newRes, error: resErr } = await supabase
      .from('reservations')
      .insert({
        organization_id: connData.organization_id,
        code,
        status: 'confirmed',
        checkin: booking.checkin,
        checkout: booking.checkout,
        nights: booking.nights,
        channel: 'booking',
        total_estimated: booking.totalPrice,
        occupant_count: booking.rooms.reduce((sum, r) => sum + r.adults + r.children, 0),
        notes: booking.specialRequests || `Reserva Booking.com #${booking.reservationId}`,
      })
      .select('id')
      .single();

    if (resErr || !newRes) {
      throw new Error(`Error creando reserva: ${resErr?.message}`);
    }

    // 5. Vincular customer
    await supabase
      .from('reservation_customers')
      .insert({
        reservation_id: newRes.id,
        customer_id: customerId,
        role: 'primary',
      });

    // 6. Asignar espacio si hay mapeo de room type
    if (connData.space_id) {
      await supabase
        .from('reservation_spaces')
        .insert({
          reservation_id: newRes.id,
          space_id: connData.space_id,
        });
    }

    // 7. Guardar detalles específicos de Booking.com
    await supabase
      .from('booking_reservation_details')
      .insert({
        reservation_id: newRes.id,
        booking_reservation_id: booking.reservationId,
        booking_hotel_id: booking.hotelId,
        guest_requests: booking.specialRequests,
        meal_plan: booking.rooms[0]?.mealPlan || 'RO',
        commission_amount: booking.commissionAmount,
        booking_status: booking.status,
        acknowledged_at: new Date().toISOString(),
        raw_data: booking as unknown as Record<string, unknown>,
      });

    console.log(`[BookingReservations] Reserva ${booking.reservationId} creada → ${newRes.id}`);
    return newRes.id;
  },

  /**
   * Procesar modificación de reserva existente.
   */
  async processModification(connectionId: string, booking: BookingReservation): Promise<void> {
    const { data: detail } = await supabase
      .from('booking_reservation_details')
      .select('reservation_id')
      .eq('booking_reservation_id', booking.reservationId)
      .single();

    if (!detail) {
      // Si no existe, tratarla como nueva
      await this.processReservation(connectionId, booking);
      return;
    }

    // Actualizar reserva
    await supabase
      .from('reservations')
      .update({
        checkin: booking.checkin,
        checkout: booking.checkout,
        nights: booking.nights,
        total_estimated: booking.totalPrice,
        occupant_count: booking.rooms.reduce((sum, r) => sum + r.adults + r.children, 0),
        notes: booking.specialRequests || undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', detail.reservation_id);

    // Actualizar detalles
    await supabase
      .from('booking_reservation_details')
      .update({
        booking_status: 'modified',
        guest_requests: booking.specialRequests,
        meal_plan: booking.rooms[0]?.mealPlan || 'RO',
        commission_amount: booking.commissionAmount,
        raw_data: booking as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })
      .eq('booking_reservation_id', booking.reservationId);

    console.log(`[BookingReservations] Reserva ${booking.reservationId} modificada`);
  },

  /**
   * Procesar cancelación de reserva.
   */
  async processCancellation(connectionId: string, booking: BookingReservation): Promise<void> {
    const { data: detail } = await supabase
      .from('booking_reservation_details')
      .select('reservation_id')
      .eq('booking_reservation_id', booking.reservationId)
      .single();

    if (!detail) {
      console.warn(`[BookingReservations] Cancelación de reserva inexistente: ${booking.reservationId}`);
      return;
    }

    await supabase
      .from('reservations')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', detail.reservation_id);

    await supabase
      .from('booking_reservation_details')
      .update({
        booking_status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('booking_reservation_id', booking.reservationId);

    console.log(`[BookingReservations] Reserva ${booking.reservationId} cancelada`);
  },

  // ─── Acknowledge ──────────────────────────────────────────

  /**
   * Enviar acknowledge de reservas nuevas (POST OTA_HotelResNotif).
   */
  async acknowledgeReservations(
    connectionId: string,
    token: string,
    acknowledges: BookingReservationAcknowledge[],
  ): Promise<boolean> {
    try {
      const xml = bookingXmlParser.buildAcknowledgeXml(acknowledges);
      const url = getSecureUrl(BOOKING_ENDPOINTS.RESERVATIONS_NEW);

      const response = await bookingAuthService.fetchWithRetry(url, {
        method: 'POST',
        headers: getXmlHeaders(token),
        body: xml,
      });

      if (!response.ok) {
        console.error(`[BookingReservations] Error acknowledge (${response.status})`);
        return false;
      }

      const responseXml = await response.text();
      return bookingXmlParser.isSuccessResponse(responseXml);
    } catch (err) {
      console.error('[BookingReservations] Error en acknowledge:', err);
      return false;
    }
  },

  /**
   * Enviar acknowledge de modificaciones/cancelaciones.
   */
  async acknowledgeModifications(
    connectionId: string,
    token: string,
    acknowledges: BookingReservationAcknowledge[],
  ): Promise<boolean> {
    try {
      const xml = bookingXmlParser.buildAcknowledgeXml(acknowledges);
      const url = getSecureUrl(BOOKING_ENDPOINTS.RESERVATIONS_MODIFIED);

      const response = await bookingAuthService.fetchWithRetry(url, {
        method: 'POST',
        headers: getXmlHeaders(token),
        body: xml,
      });

      return response.ok;
    } catch (err) {
      console.error('[BookingReservations] Error acknowledge mods:', err);
      return false;
    }
  },

  // ─── Customer Management ──────────────────────────────────

  /**
   * Buscar customer existente o crear uno nuevo.
   */
  async findOrCreateCustomer(
    organizationId: number,
    guest: BookingReservation['guest'],
  ): Promise<string> {
    const fullName = `${guest.firstName} ${guest.lastName}`.trim();

    // Buscar por email primero
    if (guest.email) {
      const { data: byEmail } = await supabase
        .from('customers')
        .select('id')
        .eq('organization_id', organizationId)
        .ilike('email', guest.email)
        .limit(1);

      if (byEmail && byEmail.length > 0) return byEmail[0].id;
    }

    // Buscar por nombre
    if (fullName) {
      const { data: byName } = await supabase
        .from('customers')
        .select('id')
        .eq('organization_id', organizationId)
        .ilike('full_name', fullName)
        .limit(1);

      if (byName && byName.length > 0) return byName[0].id;
    }

    // Crear nuevo
    const { data: newCustomer, error } = await supabase
      .from('customers')
      .insert({
        organization_id: organizationId,
        full_name: fullName || 'Huésped Booking.com',
        email: guest.email || null,
        phone: guest.phone || null,
        source: 'booking',
        metadata: {
          address: guest.address,
          created_from: 'booking_api',
        },
      })
      .select('id')
      .single();

    if (error || !newCustomer) {
      throw new Error(`Error creando customer: ${error?.message}`);
    }

    return newCustomer.id;
  },

  // ─── Sync Logs ────────────────────────────────────────────

  /**
   * Registrar log de sincronización.
   */
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
      console.warn('[BookingReservations] Error guardando sync log:', err);
    }
  },
};
