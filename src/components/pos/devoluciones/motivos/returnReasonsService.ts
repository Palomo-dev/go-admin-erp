import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';
import { normalizarCodigoMotivo } from '@/lib/pos/devoluciones/motivosCsv';
import { 
  ReturnReason, 
  CreateReturnReasonData, 
  UpdateReturnReasonData,
  ReturnReasonFilters 
} from '../types';

/** Errores de negocio que la pantalla traduce: `posDevoluciones.motivos.errores.<codigo>`. */
export type CodigoErrorMotivo = 'codigoDuplicado' | 'enUso' | 'noEncontrado';

/** Contexto de la acción fallida: da el texto de respaldo cuando el error no es de negocio. */
export type AccionMotivo = 'guardar' | 'eliminar' | 'duplicar' | 'cambiarEstado' | 'importar';

/**
 * Error con código estable. El `message` en español queda para los registros;
 * la pantalla muestra la traducción del código.
 */
export class ErrorMotivoDevolucion extends Error {
  constructor(
    public readonly codigo: CodigoErrorMotivo,
    message: string,
    public readonly valores: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ErrorMotivoDevolucion';
  }
}

/** Clave (dentro de `posDevoluciones.motivos.errores`) y variables del mensaje a mostrar. */
export function claveErrorMotivo(
  error: unknown,
  accion: AccionMotivo,
): { clave: CodigoErrorMotivo | AccionMotivo; valores: Record<string, string> } {
  if (error instanceof ErrorMotivoDevolucion) return { clave: error.codigo, valores: error.valores };
  return { clave: accion, valores: {} };
}

export class ReturnReasonsService {
  private static getOrganizationId(): number {
    const org = obtenerOrganizacionActiva();
    return org.id;
  }

  /**
   * Obtener todos los motivos de devolución
   */
  static async getAll(filters: ReturnReasonFilters = {}): Promise<ReturnReason[]> {
    try {
      const organizationId = this.getOrganizationId();
      
      let query = supabase
        .from('return_reasons')
        .select('*')
        .eq('organization_id', organizationId)
        .order('display_order', { ascending: true })
        .order('name', { ascending: true });

      // Sin caracteres que rompan el filtro `.or()` de PostgREST (coma, paréntesis, comodines).
      const busqueda = (filters.search ?? '').replace(/[,()%*\\]/g, ' ').trim().slice(0, 80);
      if (busqueda) {
        query = query.or(`name.ilike.%${busqueda}%,code.ilike.%${busqueda}%`);
      }

      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching return reasons:', error);
        throw new Error(`Error al obtener motivos: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Error in getAll:', error);
      throw error;
    }
  }

  /**
   * Cuántas devoluciones usan cada motivo (`pos_motivos_devolucion_usos`):
   * columna «Usos» y «desactivar en lugar de borrar».
   */
  static async getUsos(): Promise<Record<number, number>> {
    const { data, error } = await supabase.rpc('pos_motivos_devolucion_usos', {
      p_organization_id: this.getOrganizationId(),
    });
    if (error) throw new Error(`Error al contar los usos de los motivos: ${error.message}`);
    const salida: Record<number, number> = {};
    for (const [id, n] of Object.entries((data ?? {}) as Record<string, number>)) salida[Number(id)] = Number(n) || 0;
    return salida;
  }

  /**
   * Obtener solo motivos activos (para uso en formularios)
   */
  static async getActive(): Promise<ReturnReason[]> {
    return this.getAll({ is_active: true });
  }

  /**
   * Obtener un motivo por ID
   */
  static async getById(id: number): Promise<ReturnReason | null> {
    try {
      const organizationId = this.getOrganizationId();

      const { data, error } = await supabase
        .from('return_reasons')
        .select('*')
        .eq('id', id)
        .eq('organization_id', organizationId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new Error(`Error al obtener motivo: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Error in getById:', error);
      throw error;
    }
  }

  /**
   * Crear un nuevo motivo de devolución
   */
  static async create(data: CreateReturnReasonData): Promise<ReturnReason> {
    try {
      const organizationId = this.getOrganizationId();
      // El código se guarda en MAYÚSCULAS: la unicidad se compara igual (D16).
      const codigo = normalizarCodigoMotivo(data.code);

      // Verificar código único
      const { data: existing } = await supabase
        .from('return_reasons')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('code', codigo)
        .maybeSingle();

      if (existing) {
        throw new ErrorMotivoDevolucion('codigoDuplicado', `Ya existe un motivo con el código "${codigo}"`, { codigo });
      }

      const insertData = {
        organization_id: organizationId,
        code: codigo,
        name: data.name,
        description: data.description || null,
        requires_photo: data.requires_photo ?? false,
        affects_inventory: data.affects_inventory ?? true,
        is_active: data.is_active ?? true,
        display_order: data.display_order ?? 0
      };

      const { data: result, error } = await supabase
        .from('return_reasons')
        .insert([insertData])
        .select()
        .single();

      if (error) {
        console.error('Error creating return reason:', error);
        throw new Error(`Error al crear motivo: ${error.message}`);
      }

      return result;
    } catch (error) {
      console.error('Error in create:', error);
      throw error;
    }
  }

  /**
   * Actualizar un motivo de devolución
   */
  static async update(id: number, data: UpdateReturnReasonData): Promise<ReturnReason> {
    try {
      const organizationId = this.getOrganizationId();

      // Verificar código único si se está cambiando (en MAYÚSCULAS, como se guarda).
      const codigo = data.code ? normalizarCodigoMotivo(data.code) : null;
      if (codigo) {
        const { data: existing } = await supabase
          .from('return_reasons')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('code', codigo)
          .neq('id', id)
          .maybeSingle();

        if (existing) {
          throw new ErrorMotivoDevolucion('codigoDuplicado', `Ya existe un motivo con el código "${codigo}"`, { codigo });
        }
      }

      const updateData: UpdateReturnReasonData = { ...data };
      if (codigo) {
        updateData.code = codigo;
      }

      const { data: result, error } = await supabase
        .from('return_reasons')
        .update(updateData)
        .eq('id', id)
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (error) {
        console.error('Error updating return reason:', error);
        throw new Error(`Error al actualizar motivo: ${error.message}`);
      }

      return result;
    } catch (error) {
      console.error('Error in update:', error);
      throw error;
    }
  }

  /**
   * Eliminar un motivo de devolución
   */
  static async delete(id: number): Promise<void> {
    try {
      const organizationId = this.getOrganizationId();

      // Verificar si está siendo usado en devoluciones (cabecera o líneas).
      const [enDevoluciones, enLineas] = await Promise.all([
        supabase.from('returns').select('id').eq('organization_id', organizationId).eq('reason_id', id).limit(1),
        supabase.from('return_lines').select('id').eq('organization_id', organizationId).eq('reason_id', id).limit(1),
      ]);
      if (enDevoluciones.error || enLineas.error) {
        throw new Error(`Error al comprobar los usos del motivo: ${(enDevoluciones.error ?? enLineas.error)?.message}`);
      }

      if ((enDevoluciones.data?.length ?? 0) > 0 || (enLineas.data?.length ?? 0) > 0) {
        throw new ErrorMotivoDevolucion('enUso', 'No se puede eliminar el motivo porque está siendo usado en devoluciones existentes. Puede desactivarlo en su lugar.');
      }

      const { error } = await supabase
        .from('return_reasons')
        .delete()
        .eq('id', id)
        .eq('organization_id', organizationId);

      if (error) {
        console.error('Error deleting return reason:', error);
        throw new Error(`Error al eliminar motivo: ${error.message}`);
      }
    } catch (error) {
      console.error('Error in delete:', error);
      throw error;
    }
  }

  /**
   * Duplicar un motivo de devolución
   */
  static async duplicate(id: number): Promise<ReturnReason> {
    try {
      const original = await this.getById(id);
      
      if (!original) {
        throw new ErrorMotivoDevolucion('noEncontrado', 'Motivo no encontrado');
      }

      // Generar nuevo código
      const newCode = `${original.code}_COPIA`;

      return this.create({
        code: newCode,
        name: `${original.name} (Copia)`,
        description: original.description,
        requires_photo: original.requires_photo,
        affects_inventory: original.affects_inventory,
        is_active: false,
        display_order: original.display_order + 1
      });
    } catch (error) {
      console.error('Error in duplicate:', error);
      throw error;
    }
  }

  /**
   * Cambiar estado activo/inactivo
   */
  static async toggleActive(id: number): Promise<ReturnReason> {
    try {
      const reason = await this.getById(id);
      
      if (!reason) {
        throw new ErrorMotivoDevolucion('noEncontrado', 'Motivo no encontrado');
      }

      return this.update(id, { is_active: !reason.is_active });
    } catch (error) {
      console.error('Error in toggleActive:', error);
      throw error;
    }
  }

  /**
   * Reordenar motivos
   */
  static async reorder(orderedIds: number[]): Promise<void> {
    try {
      const organizationId = this.getOrganizationId();

      const updates = orderedIds.map((id, index) => 
        supabase
          .from('return_reasons')
          .update({ display_order: index })
          .eq('id', id)
          .eq('organization_id', organizationId)
      );

      await Promise.all(updates);
    } catch (error) {
      console.error('Error in reorder:', error);
      throw error;
    }
  }

  /**
   * Importar motivos desde CSV/JSON
   */
  static async importFromData(
    data: CreateReturnReasonData[],
  ): Promise<{ success: number; errors: { code: string; error: unknown }[] }> {
    const errors: { code: string; error: unknown }[] = [];
    let success = 0;

    for (const item of data) {
      try {
        await this.create(item);
        success++;
      } catch (error) {
        errors.push({ code: item.code, error });
      }
    }

    return { success, errors };
  }
}
