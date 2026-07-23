import { supabase } from '@/lib/supabase/config';

export interface UnitConversion {
  id: number;
  from_unit_code: string;
  to_unit_code: string;
  factor: number;
  organization_id: number | null;
  created_at: string;
}

export interface CreateUnitConversionData {
  from_unit_code: string;
  to_unit_code: string;
  factor: number;
  organization_id?: number | null;
}

class UnitConversionService {
  async getConversions(organizationId?: number): Promise<UnitConversion[]> {
    try {
      let query = supabase
        .from('unit_conversions')
        .select('*')
        .order('from_unit_code', { ascending: true });

      const { data, error } = await query;

      if (error) throw error;

      // Filtrar: globales (org null) + de la organización
      const filtered = (data || []).filter(
        (c) => c.organization_id === null || c.organization_id === organizationId
      );

      return filtered as UnitConversion[];
    } catch (error) {
      console.error('Error obteniendo conversiones:', error);
      throw error;
    }
  }

  async createConversion(data: CreateUnitConversionData): Promise<UnitConversion> {
    try {
      const { data: result, error } = await supabase
        .from('unit_conversions')
        .insert({
          from_unit_code: data.from_unit_code,
          to_unit_code: data.to_unit_code,
          factor: data.factor,
          organization_id: data.organization_id ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return result as UnitConversion;
    } catch (error) {
      console.error('Error creando conversión:', error);
      throw error;
    }
  }

  async deleteConversion(id: number): Promise<void> {
    try {
      const { error } = await supabase
        .from('unit_conversions')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error eliminando conversión:', error);
      throw error;
    }
  }

  async convert(
    qty: number,
    fromUnit: string,
    toUnit: string,
    organizationId?: number
  ): Promise<number | null> {
    if (fromUnit === toUnit) return qty;

    try {
      const { data, error } = await supabase
        .from('unit_conversions')
        .select('factor')
        .eq('from_unit_code', fromUnit)
        .eq('to_unit_code', toUnit)
        .or(`organization_id.is.null,organization_id.eq.${organizationId ?? 0}`)
        .order('organization_id', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!data) return null;

      return qty * Number(data.factor);
    } catch (error) {
      console.error('Error convirtiendo unidades:', error);
      return null;
    }
  }

  async getConvertibleUnits(unitCode: string): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('unit_conversions')
        .select('to_unit_code')
        .eq('from_unit_code', unitCode);

      if (error) throw error;

      return (data || []).map((c) => c.to_unit_code);
    } catch (error) {
      console.error('Error obteniendo unidades convertibles:', error);
      return [];
    }
  }
}

export const unitConversionService = new UnitConversionService();
