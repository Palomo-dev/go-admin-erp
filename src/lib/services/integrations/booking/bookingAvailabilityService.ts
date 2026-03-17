// ============================================================
// Servicio de Disponibilidad y Tarifas — Booking.com Connectivity API
// Push de inventario, precios y restricciones
// ============================================================

import { supabase } from '@/lib/supabase/config';
import { bookingAuthService } from './bookingAuthService';
import { bookingXmlParser } from './bookingXmlParser';
import {
  BOOKING_ENDPOINTS,
  BOOKING_MIN_AVAILABILITY_MONTHS,
  getSupplyUrl,
  getXmlHeaders,
  generateRuid,
} from './bookingConfig';
import type {
  BookingAvailabilityUpdate,
  BookingDateAvailability,
  BookingRateUpdate,
  BookingDateRate,
  BookingRoomMapping,
  BookingSyncLog,
} from './bookingTypes';

/**
 * Servicio para gestionar disponibilidad y tarifas en Booking.com.
 * Push desde GO Admin → Booking.com.
 */
export const bookingAvailabilityService = {

  // ─── Push Disponibilidad ──────────────────────────────────

  /**
   * Enviar actualización de disponibilidad para un room type específico.
   * Usa B.XML /xml/availability (todo en uno).
   */
  async pushAvailability(
    connectionId: string,
    update: BookingAvailabilityUpdate,
  ): Promise<{ success: boolean; message: string }> {
    const ruid = generateRuid();

    try {
      const token = await bookingAuthService.getValidToken(connectionId);
      if (!token) {
        return { success: false, message: 'No se pudo obtener token de autenticación' };
      }

      const xml = bookingXmlParser.buildAvailabilityXml(update);
      const url = getSupplyUrl(BOOKING_ENDPOINTS.AVAILABILITY_BXML);

      const response = await bookingAuthService.fetchWithRetry(url, {
        method: 'POST',
        headers: getXmlHeaders(token),
        body: xml,
      });

      const responseText = await response.text();

      if (!response.ok) {
        const error = bookingXmlParser.parseErrorResponse(responseText);
        const msg = error ? `${error.code}: ${error.message}` : `HTTP ${response.status}`;
        await this.logSync(connectionId, 'availability_push', 'outbound', url, ruid, 'error', 0, msg);
        return { success: false, message: msg };
      }

      if (!bookingXmlParser.isSuccessResponse(responseText)) {
        const error = bookingXmlParser.parseErrorResponse(responseText);
        const msg = error ? `${error.code}: ${error.message}` : 'Respuesta sin éxito';
        await this.logSync(connectionId, 'availability_push', 'outbound', url, ruid, 'error', 0, msg);
        return { success: false, message: msg };
      }

      await this.logSync(connectionId, 'availability_push', 'outbound', url, ruid, 'success', update.dates.length);
      return { success: true, message: `${update.dates.length} fecha(s) actualizadas` };

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.logSync(connectionId, 'availability_push', 'outbound',
        BOOKING_ENDPOINTS.AVAILABILITY_BXML, ruid, 'error', 0, msg);
      return { success: false, message: msg };
    }
  },

  // ─── Push Tarifas ─────────────────────────────────────────

  /**
   * Enviar actualización de tarifas (OTA_HotelRateAmountNotif).
   */
  async pushRates(
    connectionId: string,
    update: BookingRateUpdate,
  ): Promise<{ success: boolean; message: string }> {
    const ruid = generateRuid();

    try {
      const token = await bookingAuthService.getValidToken(connectionId);
      if (!token) {
        return { success: false, message: 'No se pudo obtener token de autenticación' };
      }

      const xml = bookingXmlParser.buildRateUpdateXml(update);
      const url = getSupplyUrl(BOOKING_ENDPOINTS.RATES);

      const response = await bookingAuthService.fetchWithRetry(url, {
        method: 'POST',
        headers: getXmlHeaders(token),
        body: xml,
      });

      const responseText = await response.text();

      if (!response.ok || !bookingXmlParser.isSuccessResponse(responseText)) {
        const error = bookingXmlParser.parseErrorResponse(responseText);
        const msg = error ? `${error.code}: ${error.message}` : `HTTP ${response.status}`;
        await this.logSync(connectionId, 'rate_push', 'outbound', url, ruid, 'error', 0, msg);
        return { success: false, message: msg };
      }

      await this.logSync(connectionId, 'rate_push', 'outbound', url, ruid, 'success', update.dates.length);
      return { success: true, message: `${update.dates.length} tarifa(s) actualizadas` };

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.logSync(connectionId, 'rate_push', 'outbound',
        BOOKING_ENDPOINTS.RATES, ruid, 'error', 0, msg);
      return { success: false, message: msg };
    }
  },

  // ─── Sincronización Masiva ────────────────────────────────

  /**
   * Sincronizar disponibilidad completa para una conexión.
   * Lee disponibilidad de GO Admin y la envía a Booking.com para los próximos 12 meses.
   */
  async syncFullAvailability(
    connectionId: string,
    organizationId: number,
  ): Promise<{ success: boolean; roomsProcessed: number; errors: number }> {
    let roomsProcessed = 0;
    let errors = 0;

    try {
      // 1. Obtener mapeos de room types
      const mappings = await this.getRoomMappings(connectionId);
      if (mappings.length === 0) {
        console.warn('[BookingAvailability] Sin mapeos de room types para conexión:', connectionId);
        return { success: false, roomsProcessed: 0, errors: 0 };
      }

      // 2. Obtener credenciales para el hotel_id
      const creds = await bookingAuthService.getCredentials(connectionId);
      if (!creds) return { success: false, roomsProcessed: 0, errors: 1 };

      // 3. Calcular rango de fechas (hoy + 12 meses)
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + BOOKING_MIN_AVAILABILITY_MONTHS);

      // 4. Para cada mapeo de room type
      for (const mapping of mappings) {
        try {
          // Obtener disponibilidad de GO Admin para este space_type
          const availability = await this.calculateAvailability(
            organizationId,
            mapping.spaceTypeId,
            startDate,
            endDate,
          );

          // Obtener tarifas de GO Admin para este space_type
          const rates = await this.calculateRates(
            organizationId,
            mapping.spaceTypeId,
            startDate,
            endDate,
          );

          // Combinar en update de disponibilidad (B.XML soporta todo en uno)
          const dates: BookingDateAvailability[] = availability.map(av => ({
            date: av.date,
            roomsToSell: av.roomsToSell,
            price: rates.find(r => r.date === av.date)?.price,
            closed: av.roomsToSell === 0,
            minimumStay: av.minimumStay,
          }));

          const update: BookingAvailabilityUpdate = {
            hotelId: creds.hotelId,
            roomId: mapping.bookingRoomId,
            ratePlanId: mapping.bookingRatePlanId,
            dates,
          };

          // Enviar en batches de 365 días máximo
          const batchSize = 365;
          for (let i = 0; i < dates.length; i += batchSize) {
            const batch: BookingAvailabilityUpdate = {
              ...update,
              dates: dates.slice(i, i + batchSize),
            };
            const result = await this.pushAvailability(connectionId, batch);
            if (!result.success) {
              console.error(`[BookingAvailability] Error en batch room ${mapping.bookingRoomId}:`, result.message);
              errors++;
            }
          }

          roomsProcessed++;
        } catch (err) {
          console.error(`[BookingAvailability] Error procesando room ${mapping.bookingRoomId}:`, err);
          errors++;
        }
      }

    } catch (err) {
      console.error('[BookingAvailability] Error en sync completo:', err);
      errors++;
    }

    return {
      success: errors === 0,
      roomsProcessed,
      errors,
    };
  },

  // ─── Cálculo de Disponibilidad desde GO Admin ─────────────

  /**
   * Calcular disponibilidad por fecha para un space_type.
   * Cuenta espacios totales - reservados - bloqueados = disponibles.
   */
  async calculateAvailability(
    organizationId: number,
    spaceTypeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Array<{ date: string; roomsToSell: number; minimumStay?: number }>> {
    // Obtener branches de la organización
    const { data: branches } = await supabase
      .from('branches')
      .select('id')
      .eq('organization_id', organizationId);

    const branchIds = (branches || []).map(b => b.id);
    if (branchIds.length === 0) return [];

    // Total de espacios de este tipo
    const { count: totalSpaces } = await supabase
      .from('spaces')
      .select('id', { count: 'exact', head: true })
      .in('branch_id', branchIds)
      .eq('space_type_id', spaceTypeId)
      .in('status', ['available', 'reserved', 'cleaning']);

    const total = totalSpaces || 0;

    // Obtener reservas en el rango
    const startStr = startDate.toISOString().substring(0, 10);
    const endStr = endDate.toISOString().substring(0, 10);

    const { data: reservations } = await supabase
      .from('reservations')
      .select(`
        checkin, checkout,
        reservation_spaces!inner (
          space_id,
          spaces!inner ( space_type_id )
        )
      `)
      .eq('organization_id', organizationId)
      .in('status', ['confirmed', 'checked_in'])
      .lte('checkin', endStr)
      .gte('checkout', startStr);

    // Contar reservas por fecha
    const occupiedByDate = new Map<string, number>();

    if (reservations) {
      for (const res of reservations) {
        const resSpaces = (res as any).reservation_spaces || [];
        const matchingSpaces = resSpaces.filter((rs: any) =>
          rs.spaces?.space_type_id === spaceTypeId
        );

        if (matchingSpaces.length > 0) {
          const ci = new Date(res.checkin + 'T00:00:00');
          const co = new Date(res.checkout + 'T00:00:00');
          const current = new Date(ci);

          while (current < co) {
            const dateStr = current.toISOString().substring(0, 10);
            occupiedByDate.set(dateStr, (occupiedByDate.get(dateStr) || 0) + matchingSpaces.length);
            current.setDate(current.getDate() + 1);
          }
        }
      }
    }

    // Obtener tarifas mínimas (min stay) del rates table
    const { data: rateRules } = await supabase
      .from('rates')
      .select('start_date, end_date, min_stay')
      .eq('space_type_id', spaceTypeId)
      .lte('start_date', endStr)
      .gte('end_date', startStr);

    // Generar array de fechas
    const result: Array<{ date: string; roomsToSell: number; minimumStay?: number }> = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      const dateStr = current.toISOString().substring(0, 10);
      const occupied = occupiedByDate.get(dateStr) || 0;
      const available = Math.max(0, total - occupied);

      // Buscar min_stay en rates
      let minimumStay: number | undefined;
      if (rateRules) {
        const rule = rateRules.find(r =>
          dateStr >= r.start_date && dateStr <= r.end_date && r.min_stay
        );
        if (rule?.min_stay) minimumStay = rule.min_stay;
      }

      result.push({ date: dateStr, roomsToSell: available, minimumStay });
      current.setDate(current.getDate() + 1);
    }

    return result;
  },

  /**
   * Calcular tarifas por fecha para un space_type desde la tabla rates.
   */
  async calculateRates(
    organizationId: number,
    spaceTypeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Array<{ date: string; price: number }>> {
    const startStr = startDate.toISOString().substring(0, 10);
    const endStr = endDate.toISOString().substring(0, 10);

    const { data: rates } = await supabase
      .from('rates')
      .select('start_date, end_date, price_per_night')
      .eq('space_type_id', spaceTypeId)
      .lte('start_date', endStr)
      .gte('end_date', startStr)
      .order('start_date');

    const result: Array<{ date: string; price: number }> = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      const dateStr = current.toISOString().substring(0, 10);

      // Buscar tarifa aplicable (la más específica/reciente)
      let price = 0;
      if (rates) {
        const applicableRate = rates.find(r =>
          dateStr >= r.start_date && dateStr <= r.end_date
        );
        if (applicableRate) {
          price = applicableRate.price_per_night || 0;
        }
      }

      if (price > 0) {
        result.push({ date: dateStr, price });
      }

      current.setDate(current.getDate() + 1);
    }

    return result;
  },

  // ─── Room Mappings ────────────────────────────────────────

  /**
   * Obtener mapeos de room types para una conexión.
   */
  async getRoomMappings(connectionId: string): Promise<BookingRoomMapping[]> {
    const { data, error } = await supabase
      .from('booking_room_mappings')
      .select('*')
      .eq('connection_id', connectionId)
      .eq('is_active', true);

    if (error || !data) {
      console.error('[BookingAvailability] Error obteniendo room mappings:', error?.message);
      return [];
    }

    return data.map(row => ({
      id: row.id,
      connectionId: row.connection_id,
      bookingRoomId: row.booking_room_id,
      bookingRoomName: row.booking_room_name,
      bookingRatePlanId: row.booking_rate_plan_id,
      spaceTypeId: row.space_type_id,
      ratePlanConfig: row.rate_plan_config || {},
      isActive: row.is_active,
    }));
  },

  /**
   * Crear o actualizar un mapeo de room type.
   */
  async upsertRoomMapping(mapping: BookingRoomMapping): Promise<string | null> {
    const { data, error } = await supabase
      .from('booking_room_mappings')
      .upsert({
        id: mapping.id || undefined,
        connection_id: mapping.connectionId,
        booking_room_id: mapping.bookingRoomId,
        booking_room_name: mapping.bookingRoomName,
        booking_rate_plan_id: mapping.bookingRatePlanId,
        space_type_id: mapping.spaceTypeId,
        rate_plan_config: mapping.ratePlanConfig,
        is_active: mapping.isActive,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'connection_id,booking_room_id,booking_rate_plan_id' })
      .select('id')
      .single();

    if (error) {
      console.error('[BookingAvailability] Error upserting room mapping:', error.message);
      return null;
    }

    return data?.id || null;
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
      console.warn('[BookingAvailability] Error guardando sync log:', err);
    }
  },
};
