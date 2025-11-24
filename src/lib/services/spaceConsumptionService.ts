import { supabase } from '@/lib/supabase/config';
import FoliosService from './foliosService';

export interface SpaceConsumption {
  id: string;
  space_id: string;
  reservation_id: string;
  folio_id: string;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  total: number;
  notes?: string;
  created_by: string;
  created_at: string;
}

export interface AddConsumptionData {
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  notes?: string;
}

class SpaceConsumptionService {
  /**
   * Obtener reserva activa de un espacio
   */
  async getActiveReservation(spaceId: string): Promise<{
    reservation_id: string;
    folio_id: string | null;
  } | null> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      console.log('Buscando reserva activa para espacio:', { spaceId, today });
      
      // Paso 1: Obtener reservation_ids del espacio
      const { data: reservationSpaces, error: rsError } = await supabase
        .from('reservation_spaces')
        .select('reservation_id')
        .eq('space_id', spaceId);

      if (rsError || !reservationSpaces || reservationSpaces.length === 0) {
        console.log('No hay reservation_spaces para este espacio:', rsError);
        return null;
      }

      const reservationIds = reservationSpaces.map(rs => rs.reservation_id);
      console.log('IDs de reservas encontradas:', reservationIds);

      // Paso 2: Buscar reserva activa entre esos IDs
      const { data: activeReservations, error: rError } = await supabase
        .from('reservations')
        .select('id, status, checkin, checkout')
        .in('id', reservationIds)
        .in('status', ['confirmed', 'checked_in'])
        .lte('checkin', today)
        .gte('checkout', today)
        .order('checkin', { ascending: false })
        .limit(1);

      if (rError || !activeReservations || activeReservations.length === 0) {
        console.log('No hay reserva activa:', rError);
        return null;
      }

      const reservation = activeReservations[0];
      const reservationId = reservation.id;
      
      console.log('Reserva activa encontrada:', reservation);

      // Paso 3: Buscar folio asociado
      const { data: folio } = await supabase
        .from('folios')
        .select('id')
        .eq('reservation_id', reservationId)
        .eq('status', 'open')
        .limit(1)
        .maybeSingle();

      console.log('Folio encontrado:', folio?.id || 'ninguno');

      return {
        reservation_id: reservationId,
        folio_id: folio?.id || null,
      };
    } catch (error) {
      console.error('Error obteniendo reserva activa:', error);
      return null;
    }
  }

  /**
   * Crear folio si no existe
   */
  async getOrCreateFolio(reservationId: string): Promise<string> {
    try {
      console.log('getOrCreateFolio - Buscando folio para reservation:', reservationId);
      
      // Buscar folio existente (usar maybeSingle para evitar error cuando no existe)
      const { data: existingFolio, error: searchError } = await supabase
        .from('folios')
        .select('id')
        .eq('reservation_id', reservationId)
        .eq('status', 'open')
        .maybeSingle();

      if (searchError) {
        console.error('Error buscando folio existente:', {
          message: searchError.message,
          details: searchError.details,
          hint: searchError.hint,
          code: searchError.code
        });
        throw searchError;
      }

      if (existingFolio) {
        console.log('Folio existente encontrado:', existingFolio.id);
        return existingFolio.id;
      }

      console.log('No hay folio, creando nuevo...');

      // Crear nuevo folio
      const { data: newFolio, error: createError } = await supabase
        .from('folios')
        .insert({
          reservation_id: reservationId,
          balance: 0,
          status: 'open',
        })
        .select('id')
        .single();

      if (createError) {
        console.error('Error creando nuevo folio:', {
          message: createError.message,
          details: createError.details,
          hint: createError.hint,
          code: createError.code
        });
        throw createError;
      }

      if (!newFolio) {
        throw new Error('No se pudo crear el folio - data es null');
      }
      
      console.log('Folio creado exitosamente:', newFolio.id);
      return newFolio.id;
    } catch (error: any) {
      console.error('Error completo obteniendo o creando folio:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Agregar consumos al espacio (y al folio)
   */
  async addConsumptions(
    spaceId: string,
    consumptions: AddConsumptionData[],
    userId: string
  ): Promise<void> {
    try {
      // Obtener reserva activa
      const activeReservation = await this.getActiveReservation(spaceId);
      
      if (!activeReservation) {
        throw new Error('No hay una reserva activa para este espacio. Los consumos solo se pueden agregar a espacios ocupados.');
      }

      // Obtener o crear folio
      const folioId = activeReservation.folio_id || await this.getOrCreateFolio(activeReservation.reservation_id);

      // Agregar cada consumo como folio_item
      for (const consumption of consumptions) {
        const amount = consumption.quantity * consumption.unit_price;
        
        await FoliosService.addFolioItem({
          folio_id: folioId,
          source: 'room_service',
          description: `${consumption.quantity}x ${consumption.product_name}${consumption.notes ? ` - ${consumption.notes}` : ''}`,
          amount,
          created_by: userId,
        });
      }
    } catch (error) {
      console.error('Error agregando consumos:', error);
      throw error;
    }
  }

  /**
   * Obtener consumos de un espacio en la reserva actual
   */
  async getSpaceConsumptions(spaceId: string): Promise<any[]> {
    try {
      const activeReservation = await this.getActiveReservation(spaceId);
      
      if (!activeReservation?.folio_id) {
        return [];
      }

      const { data, error } = await supabase
        .from('folio_items')
        .select('*')
        .eq('folio_id', activeReservation.folio_id)
        .eq('source', 'room_service')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error obteniendo consumos:', error);
      return [];
    }
  }
}

export default new SpaceConsumptionService();
