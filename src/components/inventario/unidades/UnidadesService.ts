import { supabase } from '@/lib/supabase/config';
import type { Unit } from './types';

/**
 * `units` es global: la comparten todas las organizaciones. Los usuarios solo
 * la leen; la escribe service_role (migración 20260923133330). Por eso aquí
 * no hay crear, editar ni borrar.
 */
export class UnidadesService {

  static async obtenerUnidades(): Promise<Unit[]> {
    const { data, error } = await supabase
      .from('units')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error obteniendo unidades:', error);
      throw error;
    }

    // Obtener conteo de productos por unidad
    const unidadesConConteo = await Promise.all(
      (data || []).map(async (unit) => {
        const { count } = await supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .eq('unit_code', unit.code);
        
        return {
          ...unit,
          product_count: count || 0
        };
      })
    );

    return unidadesConConteo;
  }

  static async obtenerUnidadPorCodigo(code: string): Promise<Unit | null> {
    const { data, error } = await supabase
      .from('units')
      .select('*')
      .eq('code', code)
      .single();

    if (error) {
      console.error('Error obteniendo unidad:', error);
      throw error;
    }

    return data;
  }
}
