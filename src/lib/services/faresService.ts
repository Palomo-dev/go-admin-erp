import { supabase } from '@/lib/supabase/config';

export interface TransportFare {
  id: string;
  organization_id: number;
  route_id?: string;
  fare_name: string;
  fare_code?: string;
  fare_type: 'regular' | 'student' | 'senior' | 'child' | 'promo' | 'special';
  from_stop_id?: string;
  to_stop_id?: string;
  amount: number;
  currency: string;
  discount_percent?: number;
  discount_amount?: number;
  min_age?: number;
  max_age?: number;
  requires_id?: boolean;
  requires_approval?: boolean;
  valid_from?: string;
  valid_until?: string;
  applicable_days?: number[];
  applicable_from_time?: string;
  applicable_to_time?: string;
  is_active: boolean;
  display_order?: number;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface FareWithDetails extends TransportFare {
  transport_routes?: {
    id: string;
    name: string;
    code: string;
  };
  from_stop?: {
    id: string;
    name: string;
    code?: string;
    city?: string;
  };
  to_stop?: {
    id: string;
    name: string;
    code?: string;
    city?: string;
  };
}

export interface FareFilters {
  search?: string;
  route_id?: string;
  fare_type?: string;
  is_active?: boolean;
}

export interface CreateFareData {
  organization_id: number;
  route_id?: string;
  fare_name: string;
  fare_code?: string;
  fare_type: string;
  from_stop_id?: string;
  to_stop_id?: string;
  amount: number;
  currency?: string;
  discount_percent?: number;
  discount_amount?: number;
  min_age?: number;
  max_age?: number;
  requires_id?: boolean;
  requires_approval?: boolean;
  valid_from?: string;
  valid_until?: string;
  applicable_days?: number[];
  applicable_from_time?: string;
  applicable_to_time?: string;
  is_active?: boolean;
  display_order?: number;
}

class FaresService {
  /**
   * Obtiene todas las tarifas con filtros
   */
  async getFares(organizationId: number, filters?: FareFilters): Promise<FareWithDetails[]> {
    let query = supabase
      .from('transport_fares')
      .select(`
        *,
        transport_routes:route_id (id, name, code),
        from_stop:from_stop_id (id, name, code, city),
        to_stop:to_stop_id (id, name, code, city)
      `)
      .eq('organization_id', organizationId)
      .order('display_order', { ascending: true })
      .order('fare_name', { ascending: true });

    if (filters?.search) {
      query = query.or(`fare_name.ilike.%${filters.search}%,fare_code.ilike.%${filters.search}%`);
    }
    if (filters?.route_id) {
      query = query.eq('route_id', filters.route_id);
    }
    if (filters?.fare_type) {
      query = query.eq('fare_type', filters.fare_type);
    }
    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * Obtiene una tarifa por ID
   */
  async getFareById(fareId: string): Promise<FareWithDetails | null> {
    const { data, error } = await supabase
      .from('transport_fares')
      .select(`
        *,
        transport_routes:route_id (id, name, code),
        from_stop:from_stop_id (id, name, code, city),
        to_stop:to_stop_id (id, name, code, city)
      `)
      .eq('id', fareId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  }

  /**
   * Crea una nueva tarifa
   */
  async createFare(data: CreateFareData): Promise<FareWithDetails> {
    const { data: fare, error } = await supabase
      .from('transport_fares')
      .insert({
        ...data,
        currency: data.currency || 'COP',
        is_active: data.is_active ?? true,
        display_order: data.display_order || 0,
      })
      .select(`
        *,
        transport_routes:route_id (id, name, code),
        from_stop:from_stop_id (id, name, code, city),
        to_stop:to_stop_id (id, name, code, city)
      `)
      .single();

    if (error) throw error;
    return fare;
  }

  /**
   * Actualiza una tarifa existente
   */
  async updateFare(fareId: string, data: Partial<CreateFareData>): Promise<FareWithDetails> {
    const { data: fare, error } = await supabase
      .from('transport_fares')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', fareId)
      .select(`
        *,
        transport_routes:route_id (id, name, code),
        from_stop:from_stop_id (id, name, code, city),
        to_stop:to_stop_id (id, name, code, city)
      `)
      .single();

    if (error) throw error;
    return fare;
  }

  /**
   * Elimina una tarifa
   */
  async deleteFare(fareId: string): Promise<void> {
    const { error } = await supabase
      .from('transport_fares')
      .delete()
      .eq('id', fareId);

    if (error) throw error;
  }

  /**
   * Duplica una tarifa
   */
  async duplicateFare(fareId: string): Promise<FareWithDetails> {
    const original = await this.getFareById(fareId);
    if (!original) throw new Error('Tarifa no encontrada');

    const { id, created_at, updated_at, ...fareData } = original;
    
    return this.createFare({
      ...fareData,
      fare_name: `${fareData.fare_name} (Copia)`,
      fare_code: fareData.fare_code ? `${fareData.fare_code}-COPY` : undefined,
      is_active: false,
    });
  }

  /**
   * Activa o desactiva una tarifa
   */
  async toggleActive(fareId: string, isActive: boolean): Promise<void> {
    const { error } = await supabase
      .from('transport_fares')
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', fareId);

    if (error) throw error;
  }

  /**
   * Obtiene las rutas disponibles con sus paradas de origen/destino
   */
  async getRoutes(organizationId: number): Promise<Array<{ 
    id: string; 
    name: string; 
    code: string; 
    origin_stop_id?: string; 
    destination_stop_id?: string;
  }>> {
    const { data, error } = await supabase
      .from('transport_routes')
      .select('id, name, code, origin_stop_id, destination_stop_id')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Actualiza el orden de visualización de las tarifas
   */
  async updateDisplayOrder(fareId: string, displayOrder: number): Promise<void> {
    const { error } = await supabase
      .from('transport_fares')
      .update({
        display_order: displayOrder,
        updated_at: new Date().toISOString(),
      })
      .eq('id', fareId);

    if (error) throw error;
  }

  /**
   * Actualiza el orden de múltiples tarifas
   */
  async updateBulkDisplayOrder(updates: Array<{ id: string; display_order: number }>): Promise<void> {
    for (const update of updates) {
      await this.updateDisplayOrder(update.id, update.display_order);
    }
  }

  /**
   * Obtiene las paradas disponibles
   */
  async getStops(organizationId: number): Promise<Array<{ id: string; name: string; code?: string; city?: string }>> {
    const { data, error } = await supabase
      .from('transport_stops')
      .select('id, name, code, city')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Obtiene las paradas de una ruta específica
   */
  async getRouteStops(routeId: string): Promise<Array<{ id: string; name: string; code?: string; city?: string; sequence: number }>> {
    const { data, error } = await supabase
      .from('route_stops')
      .select(`
        sequence,
        transport_stops:stop_id (id, name, code, city)
      `)
      .eq('route_id', routeId)
      .order('sequence', { ascending: true });

    if (error) throw error;
    
    return (data || []).map((rs: any) => ({
      id: rs.transport_stops?.id,
      name: rs.transport_stops?.name,
      code: rs.transport_stops?.code,
      city: rs.transport_stops?.city,
      sequence: rs.sequence,
    })).filter((s: any) => s.id);
  }

  /**
   * Importa tarifas desde CSV
   */
  async importFares(organizationId: number, faresData: Array<Partial<CreateFareData>>): Promise<{ success: number; errors: string[] }> {
    let success = 0;
    const errors: string[] = [];

    for (const fareData of faresData) {
      try {
        await this.createFare({
          ...fareData,
          organization_id: organizationId,
          fare_name: fareData.fare_name || 'Sin nombre',
          fare_type: fareData.fare_type || 'regular',
          amount: fareData.amount || 0,
        });
        success++;
      } catch (error) {
        errors.push(`Error al importar "${fareData.fare_name}": ${error instanceof Error ? error.message : 'Error desconocido'}`);
      }
    }

    return { success, errors };
  }

  /**
   * Calcula el precio final aplicando descuentos
   */
  calculateFinalPrice(fare: TransportFare): number {
    let finalPrice = fare.amount;
    
    if (fare.discount_amount && fare.discount_amount > 0) {
      finalPrice -= fare.discount_amount;
    } else if (fare.discount_percent && fare.discount_percent > 0) {
      finalPrice -= (fare.amount * fare.discount_percent) / 100;
    }
    
    return Math.max(0, finalPrice);
  }

  /**
   * Obtiene estadísticas de tarifas
   */
  async getStats(organizationId: number): Promise<{
    total: number;
    active: number;
    inactive: number;
    byType: Record<string, number>;
  }> {
    const { data, error } = await supabase
      .from('transport_fares')
      .select('id, is_active, fare_type')
      .eq('organization_id', organizationId);

    if (error) throw error;

    const fares = data || [];
    const byType: Record<string, number> = {};
    let active = 0;
    let inactive = 0;

    fares.forEach((fare) => {
      if (fare.is_active) active++;
      else inactive++;
      
      byType[fare.fare_type] = (byType[fare.fare_type] || 0) + 1;
    });

    return {
      total: fares.length,
      active,
      inactive,
      byType,
    };
  }
}

export const faresService = new FaresService();
export default faresService;
