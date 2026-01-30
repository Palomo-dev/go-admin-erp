import { supabase } from '@/lib/supabase/config';
import type { Unit } from './types';

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

  static async crearUnidad(datos: { code: string; name: string; conversion_factor: number }): Promise<Unit> {
    const { data, error } = await supabase
      .from('units')
      .insert({
        code: datos.code.toUpperCase(),
        name: datos.name,
        conversion_factor: datos.conversion_factor
      })
      .select()
      .single();

    if (error) {
      console.error('Error creando unidad:', error);
      throw error;
    }

    return data;
  }

  static async actualizarUnidad(code: string, datos: { name: string; conversion_factor: number }): Promise<Unit> {
    const { data, error } = await supabase
      .from('units')
      .update({
        name: datos.name,
        conversion_factor: datos.conversion_factor,
        updated_at: new Date().toISOString()
      })
      .eq('code', code)
      .select()
      .single();

    if (error) {
      console.error('Error actualizando unidad:', error);
      throw error;
    }

    return data;
  }

  static async eliminarUnidad(code: string): Promise<void> {
    // Verificar si hay productos usando esta unidad
    const { count } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('unit_code', code);

    if (count && count > 0) {
      throw new Error(`No se puede eliminar: hay ${count} productos usando esta unidad`);
    }

    const { error } = await supabase
      .from('units')
      .delete()
      .eq('code', code);

    if (error) {
      console.error('Error eliminando unidad:', error);
      throw error;
    }
  }

  static async duplicarUnidad(code: string): Promise<Unit> {
    const original = await this.obtenerUnidadPorCodigo(code);
    if (!original) throw new Error('Unidad no encontrada');

    // Generar nuevo código
    let nuevoCode = `${code}2`;
    let intentos = 2;
    while (intentos < 100) {
      const { data: existe } = await supabase
        .from('units')
        .select('code')
        .eq('code', nuevoCode)
        .single();
      
      if (!existe) break;
      intentos++;
      nuevoCode = `${code}${intentos}`;
    }

    return this.crearUnidad({
      code: nuevoCode,
      name: `${original.name} (copia)`,
      conversion_factor: original.conversion_factor
    });
  }
}
