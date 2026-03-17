// ============================================================
// Servicio de Reservas — Expedia Group Lodging API
// Pull (BR API), parse, confirm y mapeo a reservas GO Admin
// ============================================================

import { supabase } from '@/lib/supabase/config';
import { expediaAuthService } from './expediaAuthService';
import { expediaXmlParser } from './expediaXmlParser';
import {
  EXPEDIA_ENDPOINTS,
  EXPEDIA_CREDENTIAL_PURPOSES,
  getApiUrl,
  getXmlHeaders,
  generateRequestId,
} from './expediaConfig';
import type {
  ExpediaReservation,
  ExpediaSyncType,
  ExpediaSyncDirection,
  ExpediaSyncStatus,
} from './expediaTypes';
import { EXPEDIA_OTA_CONNECTOR_ID } from './expediaTypes';

/**
 * Servicio para gestionar reservas de Expedia Group.
 * Implementa el flujo Booking Retrieval (BR):
 * GET (pull) → parse → save → PUT (confirm)
 */
export const expediaReservationService = {

  // ─── Poll de Reservas (BR API - Pull) ──────────────────────

  /**
   * Poll de reservas desde Expedia (Booking Retrieval API).
   * 1. GET /eqc/br para obtener reservas pendientes
   * 2. Parse XML → objetos
   * 3. Guardar en Supabase
   * 4. PUT /eqc/br para confirmar
   */
  async pollReservations(connectionId: string): Promise<{
    processed: number;
    errors: number;
    reservations: ExpediaReservation[];
  }> {
    const requestId = generateRequestId();
    let processed = 0;
    let errors = 0;
    const allReservations: ExpediaReservation[] = [];

    try {
      // 1. Obtener credenciales
      const credentials = await expediaAuthService.getCredentials(connectionId);
      if (!credentials) {
        await this.logSync(connectionId, 'reservation_pull', 'inbound',
          EXPEDIA_ENDPOINTS.BR_GET, requestId, 'error', 0, 'No se pudieron obtener credenciales');
        return { processed: 0, errors: 1, reservations: [] };
      }

      // 2. GET reservas (BR API usa Basic Auth)
      const url = `${getApiUrl(EXPEDIA_ENDPOINTS.BR_GET)}?hotel_id=${credentials.propertyId}`;
      const response = await expediaAuthService.fetchWithRetry(url, {
        method: 'GET',
        headers: getXmlHeaders(credentials.eqcUsername, credentials.eqcPassword),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[ExpediaReservations] Error poll (${response.status}):`, errorText);
        await this.logSync(connectionId, 'reservation_pull', 'inbound',
          url, requestId, 'error', 0, `HTTP ${response.status}: ${errorText.substring(0, 200)}`);
        return { processed: 0, errors: 1, reservations: [] };
      }

      const xml = await response.text();

      // 3. Parsear reservas
      const reservations = expediaXmlParser.parseBookingRetrievalResponse(xml);

      if (reservations.length === 0) {
        return { processed: 0, errors: 0, reservations: [] };
      }

      console.log(`[ExpediaReservations] ${reservations.length} reserva(s) recibida(s). ReqID: ${requestId}`);

      // 4. Procesar cada reserva
      for (const reservation of reservations) {
        try {
          const reservationId = await this.processReservation(connectionId, reservation);
          processed++;
          allReservations.push(reservation);

          // 5. Confirmar reserva (PUT /eqc/br)
          await this.confirmReservation(credentials, reservation, reservationId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[ExpediaReservations] Error procesando reserva ${reservation.confirmationId}:`, msg);
          errors++;
        }
      }

      // 6. Log
      await this.logSync(connectionId, 'reservation_pull', 'inbound',
        url, requestId, errors > 0 ? 'partial' : 'success', processed,
        errors > 0 ? `${errors} error(es) en procesamiento` : undefined);

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ExpediaReservations] Error general en poll:', msg);
      await this.logSync(connectionId, 'reservation_pull', 'inbound',
        EXPEDIA_ENDPOINTS.BR_GET, requestId, 'error', 0, msg);
      errors++;
    }

    return { processed, errors, reservations: allReservations };
  },

  // ─── Procesamiento de Reservas ────────────────────────────

  /**
   * Procesar una reserva de Expedia: crear en Supabase.
   * Retorna el ID de la reserva creada en GO Admin.
   */
  async processReservation(connectionId: string, expediaRes: ExpediaReservation): Promise<string> {
    // 1. Obtener organización de la conexión
    const { data: connData } = await supabase
      .from('channel_connections')
      .select('organization_id, space_id')
      .eq('external_property_id', expediaRes.propertyId)
      .eq('channel', 'expedia')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!connData) {
      throw new Error(`No hay channel_connection activa para propiedad Expedia ${expediaRes.propertyId}`);
    }

    // 2. Verificar si la reserva ya existe (evitar duplicados)
    const { data: existing } = await supabase
      .from('expedia_reservation_details')
      .select('id, reservation_id')
      .eq('expedia_confirmation_id', expediaRes.confirmationId)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`[ExpediaReservations] Reserva ${expediaRes.confirmationId} ya existe. Omitiendo.`);
      return existing[0].reservation_id;
    }

    // 3. Buscar o crear customer
    const customerId = await this.findOrCreateCustomer(
      connData.organization_id,
      expediaRes.guest,
    );

    // 4. Crear reserva en GO Admin
    const { data: newRes, error: resErr } = await supabase
      .from('reservations')
      .insert({
        organization_id: connData.organization_id,
        customer_id: customerId,
        space_id: connData.space_id || null,
        start_date: new Date(expediaRes.checkin + 'T14:00:00').toISOString(),
        end_date: new Date(expediaRes.checkout + 'T12:00:00').toISOString(),
        checkin: expediaRes.checkin,
        checkout: expediaRes.checkout,
        status: expediaRes.status === 'cancelled' ? 'cancelled' : 'confirmed',
        channel: 'expedia',
        total_estimated: expediaRes.totalPrice,
        occupant_count: expediaRes.rooms.reduce((sum, r) => sum + r.adults + r.children, 0),
        notes: expediaRes.specialRequests
          || `Reserva Expedia #${expediaRes.confirmationId} (${expediaRes.pointOfSale || 'expedia'})`,
        metadata: {
          source: expediaRes.pointOfSale,
          currency: expediaRes.currency,
        },
      })
      .select('id')
      .single();

    if (resErr || !newRes) {
      throw new Error(`Error creando reserva: ${resErr?.message}`);
    }

    // 5. Guardar detalles específicos de Expedia
    await supabase
      .from('expedia_reservation_details')
      .insert({
        reservation_id: newRes.id,
        expedia_confirmation_id: expediaRes.confirmationId,
        expedia_property_id: expediaRes.propertyId,
        guest_requests: expediaRes.specialRequests,
        point_of_sale: expediaRes.pointOfSale,
        expedia_status: expediaRes.status,
        confirmed_at: new Date().toISOString(),
        raw_data: expediaRes as unknown as Record<string, unknown>,
      });

    console.log(`[ExpediaReservations] Reserva ${expediaRes.confirmationId} creada → ${newRes.id}`);
    return newRes.id;
  },

  /**
   * Procesar modificación de reserva existente.
   */
  async processModification(connectionId: string, expediaRes: ExpediaReservation): Promise<void> {
    const { data: detail } = await supabase
      .from('expedia_reservation_details')
      .select('reservation_id')
      .eq('expedia_confirmation_id', expediaRes.confirmationId)
      .single();

    if (!detail) {
      await this.processReservation(connectionId, expediaRes);
      return;
    }

    await supabase
      .from('reservations')
      .update({
        checkin: expediaRes.checkin,
        checkout: expediaRes.checkout,
        start_date: new Date(expediaRes.checkin + 'T14:00:00').toISOString(),
        end_date: new Date(expediaRes.checkout + 'T12:00:00').toISOString(),
        total_estimated: expediaRes.totalPrice,
        occupant_count: expediaRes.rooms.reduce((sum, r) => sum + r.adults + r.children, 0),
        notes: expediaRes.specialRequests || undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', detail.reservation_id);

    await supabase
      .from('expedia_reservation_details')
      .update({
        expedia_status: 'modified',
        guest_requests: expediaRes.specialRequests,
        raw_data: expediaRes as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })
      .eq('expedia_confirmation_id', expediaRes.confirmationId);

    console.log(`[ExpediaReservations] Reserva ${expediaRes.confirmationId} modificada`);
  },

  /**
   * Procesar cancelación de reserva.
   */
  async processCancellation(connectionId: string, expediaRes: ExpediaReservation): Promise<void> {
    const { data: detail } = await supabase
      .from('expedia_reservation_details')
      .select('reservation_id')
      .eq('expedia_confirmation_id', expediaRes.confirmationId)
      .single();

    if (!detail) {
      console.warn(`[ExpediaReservations] Cancelación de reserva inexistente: ${expediaRes.confirmationId}`);
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
      .from('expedia_reservation_details')
      .update({
        expedia_status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('expedia_confirmation_id', expediaRes.confirmationId);

    console.log(`[ExpediaReservations] Reserva ${expediaRes.confirmationId} cancelada`);
  },

  // ─── Confirmación (BR API - PUT) ──────────────────────────

  /**
   * Confirmar reserva en Expedia (PUT /eqc/br).
   * Envía el hotel confirmation number para que Expedia lo muestre al huésped.
   */
  async confirmReservation(
    credentials: { eqcUsername: string; eqcPassword: string; propertyId: string },
    expediaRes: ExpediaReservation,
    goAdminReservationId: string,
  ): Promise<boolean> {
    try {
      const xml = expediaXmlParser.buildBookingConfirmXml({
        propertyId: credentials.propertyId,
        expediaConfirmationId: expediaRes.confirmationId,
        hotelConfirmationId: goAdminReservationId.substring(0, 8).toUpperCase(),
      });

      const url = getApiUrl(EXPEDIA_ENDPOINTS.BR_CONFIRM);
      const response = await expediaAuthService.fetchWithRetry(url, {
        method: 'PUT',
        headers: getXmlHeaders(credentials.eqcUsername, credentials.eqcPassword),
        body: xml,
      });

      if (!response.ok) {
        console.error(`[ExpediaReservations] Error confirmando (${response.status})`);
        return false;
      }

      const responseXml = await response.text();
      return expediaXmlParser.isSuccessResponse(responseXml);
    } catch (err) {
      console.error('[ExpediaReservations] Error en confirmación:', err);
      return false;
    }
  },

  // ─── Customer Management ──────────────────────────────────

  /**
   * Buscar customer existente o crear uno nuevo.
   */
  async findOrCreateCustomer(
    organizationId: number,
    guest: ExpediaReservation['guest'],
  ): Promise<string> {
    const fullName = `${guest.firstName} ${guest.lastName}`.trim();

    // Buscar por email
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
        full_name: fullName || 'Huésped Expedia',
        email: guest.email || null,
        phone: guest.phone || null,
        source: 'expedia',
        metadata: {
          address: guest.address,
          created_from: 'expedia_api',
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
   * Registrar log de sincronización en expedia_sync_logs.
   */
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
      console.warn('[ExpediaReservations] Error guardando sync log:', err);
    }
  },
};
