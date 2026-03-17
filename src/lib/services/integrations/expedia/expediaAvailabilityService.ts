// ============================================================
// Servicio de Disponibilidad y Tarifas — Expedia Group Lodging API
// Push de inventario, precios y restricciones via AR API (XML)
// ============================================================

import { supabase } from '@/lib/supabase/config';
import { expediaAuthService } from './expediaAuthService';
import { expediaXmlParser } from './expediaXmlParser';
import {
  EXPEDIA_ENDPOINTS,
  EXPEDIA_MIN_AVAILABILITY_MONTHS,
  EXPEDIA_MAX_AR_DAYS,
  getApiUrl,
  getXmlHeaders,
  generateRequestId,
} from './expediaConfig';
import type {
  ExpediaAvailabilityUpdate,
  ExpediaDateAvailability,
  ExpediaSyncType,
  ExpediaSyncDirection,
  ExpediaSyncStatus,
} from './expediaTypes';

// --- Tipo interno para room mapping ---
interface ExpediaRoomMapping {
  id: string;
  connectionId: string;
  expediaRoomTypeId: string;
  expediaRoomTypeName: string;
  expediaRatePlanId: string;
  spaceTypeId: string;
  ratePlanConfig: Record<string, unknown>;
  isActive: boolean;
}

/**
 * Servicio para gestionar disponibilidad y tarifas en Expedia Group.
 * Push desde GO Admin → Expedia via AR API (PUT /eqc/ar).
 *
 * Diferencia clave con Booking.com: Expedia AR API maneja disponibilidad
 * Y tarifas en un solo request XML (AvailRateUpdateRQ).
 */
export const expediaAvailabilityService = {

  // ─── Push Disponibilidad + Tarifas (AR API) ────────────────

  /**
   * Enviar actualización de disponibilidad y tarifas para un room type.
   * Expedia AR API combina inventory + rates + restrictions en un solo XML.
   * PUT /eqc/ar con Basic Auth.
   */
  async pushAvailabilityAndRates(
    connectionId: string,
    update: ExpediaAvailabilityUpdate,
  ): Promise<{ success: boolean; message: string }> {
    const requestId = generateRequestId();

    try {
      const credentials = await expediaAuthService.getCredentials(connectionId);
      if (!credentials) {
        return { success: false, message: 'No se pudieron obtener credenciales EQC' };
      }

      const xml = expediaXmlParser.buildAvailabilityUpdateXml(update);
      const url = getApiUrl(EXPEDIA_ENDPOINTS.AR_SET);

      const response = await expediaAuthService.fetchWithRetry(url, {
        method: 'PUT',
        headers: getXmlHeaders(credentials.eqcUsername, credentials.eqcPassword),
        body: xml,
      });

      const responseText = await response.text();

      if (!response.ok) {
        const error = expediaXmlParser.parseErrorResponse(responseText);
        const msg = error ? `${error.code}: ${error.message}` : `HTTP ${response.status}`;
        await this.logSync(connectionId, 'availability_push', 'outbound', url, requestId, 'error', 0, msg);
        return { success: false, message: msg };
      }

      if (!expediaXmlParser.isSuccessResponse(responseText)) {
        const error = expediaXmlParser.parseErrorResponse(responseText);
        const msg = error ? `${error.code}: ${error.message}` : 'Respuesta sin éxito';
        await this.logSync(connectionId, 'availability_push', 'outbound', url, requestId, 'error', 0, msg);
        return { success: false, message: msg };
      }

      await this.logSync(connectionId, 'availability_push', 'outbound', url, requestId, 'success', update.dates.length);
      return { success: true, message: `${update.dates.length} fecha(s) actualizadas en Expedia` };

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.logSync(connectionId, 'availability_push', 'outbound',
        EXPEDIA_ENDPOINTS.AR_SET, requestId, 'error', 0, msg);
      return { success: false, message: msg };
    }
  },

  // ─── Sincronización Masiva ────────────────────────────────

  /**
   * Sincronizar disponibilidad completa para una conexión.
   * Lee disponibilidad de GO Admin y la envía a Expedia para los próximos 12 meses.
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
        console.warn('[ExpediaAvailability] Sin mapeos de room types para conexión:', connectionId);
        return { success: false, roomsProcessed: 0, errors: 0 };
      }

      // 2. Obtener credenciales para el property_id
      const creds = await expediaAuthService.getCredentials(connectionId);
      if (!creds) return { success: false, roomsProcessed: 0, errors: 1 };

      // 3. Calcular rango de fechas (hoy + 12 meses)
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + EXPEDIA_MIN_AVAILABILITY_MONTHS);

      // 4. Para cada mapeo de room type
      for (const mapping of mappings) {
        try {
          // Obtener disponibilidad de GO Admin
          const availability = await this.calculateAvailability(
            organizationId,
            mapping.spaceTypeId,
            startDate,
            endDate,
          );

          // Obtener tarifas de GO Admin
          const rates = await this.calculateRates(
            organizationId,
            mapping.spaceTypeId,
            startDate,
            endDate,
          );

          // Combinar en dates array (Expedia AR = inventory + rates en uno)
          const dates: ExpediaDateAvailability[] = availability.map(av => ({
            date: av.date,
            totalInventoryAvailable: av.roomsToSell,
            price: rates.find(r => r.date === av.date)?.price,
            closed: av.roomsToSell === 0,
            minimumStay: av.minimumStay,
          }));

          const update: ExpediaAvailabilityUpdate = {
            propertyId: creds.propertyId,
            roomTypeId: mapping.expediaRoomTypeId,
            ratePlanId: mapping.expediaRatePlanId,
            dates,
          };

          // Enviar en batches de 365 días máximo (límite Expedia AR)
          for (let i = 0; i < dates.length; i += EXPEDIA_MAX_AR_DAYS) {
            const batch: ExpediaAvailabilityUpdate = {
              ...update,
              dates: dates.slice(i, i + EXPEDIA_MAX_AR_DAYS),
            };
            const result = await this.pushAvailabilityAndRates(connectionId, batch);
            if (!result.success) {
              console.error(`[ExpediaAvailability] Error en batch room ${mapping.expediaRoomTypeId}:`, result.message);
              errors++;
            }
          }

          roomsProcessed++;
        } catch (err) {
          console.error(`[ExpediaAvailability] Error procesando room ${mapping.expediaRoomTypeId}:`, err);
          errors++;
        }
      }

    } catch (err) {
      console.error('[ExpediaAvailability] Error en sync completo:', err);
      errors++;
    }

    return { success: errors === 0, roomsProcessed, errors };
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
      .select('checkin, checkout, space_type_id')
      .eq('organization_id', organizationId)
      .eq('space_type_id', spaceTypeId)
      .in('status', ['confirmed', 'checked_in'])
      .lte('checkin', endStr)
      .gte('checkout', startStr);

    // Contar reservas por fecha
    const occupiedByDate = new Map<string, number>();

    if (reservations) {
      for (const res of reservations) {
        if (!res.checkin || !res.checkout) continue;
        const ci = new Date(res.checkin + 'T00:00:00');
        const co = new Date(res.checkout + 'T00:00:00');
        const current = new Date(ci);

        while (current < co) {
          const dateStr = current.toISOString().substring(0, 10);
          occupiedByDate.set(dateStr, (occupiedByDate.get(dateStr) || 0) + 1);
          current.setDate(current.getDate() + 1);
        }
      }
    }

    // Obtener bloqueos (reservation_blocks)
    const { data: blocks } = await supabase
      .from('reservation_blocks')
      .select('start_date, end_date, quantity')
      .eq('organization_id', organizationId)
      .eq('space_type_id', spaceTypeId)
      .eq('is_active', true)
      .lte('start_date', endStr)
      .gte('end_date', startStr);

    if (blocks) {
      for (const block of blocks) {
        const bs = new Date(block.start_date + 'T00:00:00');
        const be = new Date(block.end_date + 'T00:00:00');
        const current = new Date(bs);

        while (current <= be) {
          const dateStr = current.toISOString().substring(0, 10);
          occupiedByDate.set(dateStr, (occupiedByDate.get(dateStr) || 0) + (block.quantity || 1));
          current.setDate(current.getDate() + 1);
        }
      }
    }

    // Obtener tarifas (min stay)
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
  async getRoomMappings(connectionId: string): Promise<ExpediaRoomMapping[]> {
    const { data, error } = await supabase
      .from('expedia_room_mappings')
      .select('*')
      .eq('connection_id', connectionId)
      .eq('is_active', true);

    if (error || !data) {
      console.error('[ExpediaAvailability] Error obteniendo room mappings:', error?.message);
      return [];
    }

    return data.map(row => ({
      id: row.id,
      connectionId: row.connection_id,
      expediaRoomTypeId: row.expedia_room_type_id,
      expediaRoomTypeName: row.expedia_room_type_name,
      expediaRatePlanId: row.expedia_rate_plan_id,
      spaceTypeId: row.space_type_id,
      ratePlanConfig: row.rate_plan_config || {},
      isActive: row.is_active,
    }));
  },

  /**
   * Crear o actualizar un mapeo de room type.
   */
  async upsertRoomMapping(mapping: Omit<ExpediaRoomMapping, 'id'> & { id?: string }): Promise<string | null> {
    const { data, error } = await supabase
      .from('expedia_room_mappings')
      .upsert({
        id: mapping.id || undefined,
        connection_id: mapping.connectionId,
        expedia_room_type_id: mapping.expediaRoomTypeId,
        expedia_room_type_name: mapping.expediaRoomTypeName,
        expedia_rate_plan_id: mapping.expediaRatePlanId,
        space_type_id: mapping.spaceTypeId,
        rate_plan_config: mapping.ratePlanConfig,
        is_active: mapping.isActive,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'connection_id,expedia_room_type_id,expedia_rate_plan_id' })
      .select('id')
      .single();

    if (error) {
      console.error('[ExpediaAvailability] Error upserting room mapping:', error.message);
      return null;
    }

    return data?.id || null;
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
      console.warn('[ExpediaAvailability] Error guardando sync log:', err);
    }
  },
};
