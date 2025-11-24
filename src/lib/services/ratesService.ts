import { supabase } from '@/lib/supabase/config';

export interface Rate {
  id: string;
  organization_id: number;
  space_type_id: string;
  date_from: string;
  date_to: string;
  price: number;
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
  restrictions?: any;
}

class RatesService {
  /**
   * Obtener todas las tarifas
   */
  async getRates(organizationId: number): Promise<Rate[]> {
    try {
      const { data, error } = await supabase
        .from('rates')
        .select(`
          id,
          organization_id,
          space_type_id,
          date_from,
          date_to,
          price,
          restrictions,
          created_at,
          updated_at,
          space_types (
            id,
            name
          )
        `)
        .eq('organization_id', organizationId)
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
   * Crear tarifa
   */
  async createRate(data: CreateRateData): Promise<Rate> {
    try {
      const { data: rate, error } = await supabase
        .from('rates')
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return rate as Rate;
    } catch (error) {
      console.error('Error creando tarifa:', error);
      throw error;
    }
  }

  /**
   * Actualizar tarifa
   */
  async updateRate(rateId: string, updates: Partial<CreateRateData>): Promise<Rate> {
    try {
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
  async deleteRate(rateId: string): Promise<void> {
    try {
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
}

export default new RatesService();
