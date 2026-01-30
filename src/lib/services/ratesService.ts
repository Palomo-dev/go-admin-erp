import { supabase } from '@/lib/supabase/config';

/**
 * Configura el contexto de organización para RLS
 */
async function setOrganizationContext(organizationId: number): Promise<void> {
  await supabase.rpc('set_config', {
    setting_name: 'app.current_org_id',
    setting_value: organizationId.toString(),
  });
}

export interface Rate {
  id: string;
  organization_id: number;
  space_type_id: string;
  date_from: string;
  date_to: string;
  price: number;
  priority: number;
  is_active: boolean;
  restrictions?: {
    min_nights?: number;
    max_nights?: number;
    closed_arrival?: boolean;
    closed_departure?: boolean;
    plan?: string;
  };
  created_at: string;
  updated_at: string;
  space_types?: {
    id: string;
    name: string;
  };
}

export interface CreateRateData {
  organization_id: number;
  space_type_id: string;
  date_from: string;
  date_to: string;
  price: number;
  priority?: number;
  restrictions?: any;
  is_active?: boolean;
}

export interface RateConflict {
  conflicting_rate_id: string;
  conflicting_priority: number;
  conflicting_date_from: string;
  conflicting_date_to: string;
  conflicting_plan: string | null;
}

class RatesService {
  /**
   * Obtener todas las tarifas
   */
  async getRates(organizationId: number): Promise<Rate[]> {
    try {
      // Configurar contexto de organización para RLS
      await setOrganizationContext(organizationId);

      const { data, error } = await supabase
        .from('rates')
        .select(`
          id,
          organization_id,
          space_type_id,
          date_from,
          date_to,
          price,
          priority,
          is_active,
          restrictions,
          created_at,
          updated_at,
          space_types (
            id,
            name
          )
        `)
        .eq('organization_id', organizationId)
        .order('priority', { ascending: false })
        .order('date_from', { ascending: false });

      if (error) throw error;

      return ((data || []) as any[]).map(rate => ({
        ...rate,
        space_types: rate.space_types?.[0] || rate.space_types
      })) as Rate[];
    } catch (error) {
      console.error('Error obteniendo tarifas:', error);
      throw error;
    }
  }

  /**
   * Verificar conflictos de tarifas
   */
  async checkConflicts(
    organizationId: number,
    spaceTypeId: string,
    dateFrom: string,
    dateTo: string,
    plan?: string,
    excludeRateId?: string
  ): Promise<RateConflict[]> {
    try {
      const { data, error } = await supabase.rpc('check_rate_conflicts', {
        p_organization_id: organizationId,
        p_space_type_id: spaceTypeId,
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_plan: plan || null,
        p_exclude_rate_id: excludeRateId || null,
      });

      if (error) throw error;
      return (data || []) as RateConflict[];
    } catch (error) {
      console.error('Error verificando conflictos:', error);
      throw error;
    }
  }

  /**
   * Crear tarifa con validación de conflictos
   */
  async createRate(data: CreateRateData): Promise<Rate> {
    try {
      // Usar función RPC con validación de conflictos
      const { data: result, error: rpcError } = await supabase.rpc('create_rate_with_validation', {
        p_organization_id: data.organization_id,
        p_space_type_id: data.space_type_id,
        p_date_from: data.date_from,
        p_date_to: data.date_to,
        p_price: data.price,
        p_priority: data.priority || 0,
        p_restrictions: data.restrictions || { min_stay: 1 },
        p_is_active: data.is_active !== false,
      });

      if (rpcError) {
        console.error('Error RPC:', rpcError.message);
        throw new Error(rpcError.message || 'Error al crear tarifa');
      }

      // Verificar si hubo error de conflicto
      if (!result.success) {
        throw new Error(result.message || 'Error de conflicto de tarifas');
      }

      // Obtener la tarifa creada
      await setOrganizationContext(data.organization_id);
      const { data: rate, error } = await supabase
        .from('rates')
        .select(`
          id, organization_id, space_type_id, date_from, date_to, price, priority, is_active, restrictions, created_at, updated_at,
          space_types (id, name)
        `)
        .eq('id', result.rate_id)
        .single();

      if (error) throw new Error(error.message);

      return {
        ...rate,
        space_types: rate.space_types?.[0] || rate.space_types,
      } as Rate;
    } catch (error: any) {
      console.error('Error creando tarifa:', error?.message || error);
      throw error;
    }
  }

  /**
   * Actualizar tarifa
   */
  async updateRate(rateId: string, updates: Partial<CreateRateData>, organizationId: number): Promise<Rate> {
    try {
      // Configurar contexto de organización para RLS
      await setOrganizationContext(organizationId);

      const { data, error } = await supabase
        .from('rates')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rateId)
        .select()
        .single();

      if (error) throw error;
      return data as Rate;
    } catch (error) {
      console.error('Error actualizando tarifa:', error);
      throw error;
    }
  }

  /**
   * Eliminar tarifa
   */
  async deleteRate(rateId: string, organizationId: number): Promise<void> {
    try {
      // Configurar contexto de organización para RLS
      await setOrganizationContext(organizationId);

      const { error } = await supabase
        .from('rates')
        .delete()
        .eq('id', rateId);

      if (error) throw error;
    } catch (error) {
      console.error('Error eliminando tarifa:', error);
      throw error;
    }
  }

  /**
   * Activar/Desactivar tarifa
   */
  async toggleRateActive(rateId: string, organizationId: number): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('toggle_rate_active', {
        p_rate_id: rateId,
        p_organization_id: organizationId,
      });

      if (error) throw error;
      return data as boolean;
    } catch (error) {
      console.error('Error cambiando estado de tarifa:', error);
      throw error;
    }
  }

  /**
   * Importar tarifas desde CSV
   */
  async importRatesFromCSV(
    organizationId: number,
    csvData: Array<{
      space_type_id: string;
      date_from: string;
      date_to: string;
      price: number;
      restrictions?: any;
    }>
  ): Promise<{ success: number; errors: number }> {
    try {
      // Configurar contexto de organización para RLS
      await setOrganizationContext(organizationId);

      let success = 0;
      let errors = 0;

      for (const row of csvData) {
        try {
          await this.createRate({
            organization_id: organizationId,
            ...row,
          });
          success++;
        } catch (error) {
          console.error('Error importando fila:', error);
          errors++;
        }
      }

      return { success, errors };
    } catch (error) {
      console.error('Error en importación:', error);
      throw error;
    }
  }

  /**
   * Obtener tarifa aplicable para una fecha y tipo de espacio
   */
  async getRateForDate(
    organizationId: number,
    spaceTypeId: string,
    date: string,
    plan?: string
  ): Promise<{
    rateId: string | null;
    price: number;
    restrictions: any;
    isFromRates: boolean;
  }> {
    try {
      const { data, error } = await supabase.rpc('get_rate_for_date', {
        p_organization_id: organizationId,
        p_space_type_id: spaceTypeId,
        p_date: date,
        p_plan: plan || null,
      });

      if (error) throw error;

      const result = data?.[0];
      return {
        rateId: result?.rate_id || null,
        price: parseFloat(result?.price) || 0,
        restrictions: result?.restrictions || null,
        isFromRates: result?.is_from_rates || false,
      };
    } catch (error) {
      console.error('Error obteniendo tarifa para fecha:', error);
      throw error;
    }
  }

  /**
   * Calcular total de reserva usando tarifas dinámicas
   */
  async calculateReservationTotal(
    organizationId: number,
    spaceTypeId: string,
    checkin: string,
    checkout: string,
    plan?: string
  ): Promise<{
    totalAmount: number;
    nights: number;
    dailyRate: number;
    rateSource: 'tarifa' | 'base_rate';
  }> {
    try {
      const { data, error } = await supabase.rpc('calculate_reservation_total', {
        p_organization_id: organizationId,
        p_space_type_id: spaceTypeId,
        p_checkin: checkin,
        p_checkout: checkout,
        p_plan: plan || null,
      });

      if (error) throw error;

      const result = data?.[0];
      return {
        totalAmount: parseFloat(result?.total_amount) || 0,
        nights: result?.nights || 0,
        dailyRate: parseFloat(result?.daily_rate) || 0,
        rateSource: result?.rate_source || 'base_rate',
      };
    } catch (error) {
      console.error('Error calculando total de reserva:', error);
      throw error;
    }
  }

  /**
   * Validar restricciones de tarifa
   */
  validateRestrictions(
    restrictions: any,
    nights: number,
    checkinDate: Date
  ): { valid: boolean; message?: string } {
    if (!restrictions) return { valid: true };

    // Validar mínimo de noches
    if (restrictions.min_nights && nights < restrictions.min_nights) {
      return {
        valid: false,
        message: `Mínimo ${restrictions.min_nights} noche(s) requeridas`,
      };
    }

    // Validar máximo de noches
    if (restrictions.max_nights && nights > restrictions.max_nights) {
      return {
        valid: false,
        message: `Máximo ${restrictions.max_nights} noche(s) permitidas`,
      };
    }

    // Validar cierre de llegada (no se puede hacer check-in este día)
    if (restrictions.closed_arrival) {
      return {
        valid: false,
        message: 'No se permite llegada en esta fecha',
      };
    }

    return { valid: true };
  }
}

export default new RatesService();
