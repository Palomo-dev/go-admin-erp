import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import {
  ServiceCharge,
  CreateServiceChargeData,
  UpdateServiceChargeData,
  ServiceChargeFilters
} from './types';
import {
  CargoServicioError,
  cambiosParaActualizar,
  errorCargo,
  filaParaInsertar,
  filtroSucursalConGlobales,
  parsearCsvCargos,
  type ErrorFilaCsv,
} from './cargosLogica';

/**
 * Cargos de servicio. Toda lectura y escritura va acotada a la organización de
 * la sesión. Escribir exige el permiso `billing_management` (RLS, migración
 * 20260925110000). Los errores salen como `CargoServicioError` con un código
 * que la pantalla traduce.
 */
export class CargosServicioService {
  /**
   * Cargos de la organización. Con sucursal, los de esa sucursal y los
   * globales, que también aplican en ella.
   */
  static async getAll(filters: ServiceChargeFilters = {}): Promise<ServiceCharge[]> {
    const organizationId = getOrganizationId();

    let query = supabase
      .from('service_charges')
      .select(`
        *,
        branch:branches (
          id,
          name
        )
      `)
      .eq('organization_id', organizationId)
      .order('name', { ascending: true });

    if (filters.is_active !== undefined) query = query.eq('is_active', filters.is_active);
    if (filters.branch_id) query = query.or(filtroSucursalConGlobales(filters.branch_id));
    if (filters.applies_to) query = query.eq('applies_to', filters.applies_to);

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching service charges:', error);
      throw errorCargo(error);
    }
    return (data || []) as ServiceCharge[];
  }

  /** Cargos activos */
  static async getActive(): Promise<ServiceCharge[]> {
    return this.getAll({ is_active: true });
  }

  /** Un cargo de la organización de la sesión, o null. */
  static async getById(id: number): Promise<ServiceCharge | null> {
    const { data, error } = await supabase
      .from('service_charges')
      .select(`
        *,
        branch:branches (
          id,
          name
        )
      `)
      .eq('id', id)
      .eq('organization_id', getOrganizationId())
      .maybeSingle();

    if (error) {
      console.error('Error in getById:', error);
      throw errorCargo(error);
    }
    return (data as ServiceCharge | null) ?? null;
  }

  /** Crear cargo de servicio */
  static async create(data: CreateServiceChargeData): Promise<ServiceCharge> {
    const { data: result, error } = await supabase
      .from('service_charges')
      .insert([{
        organization_id: getOrganizationId(),
        ...filaParaInsertar(data),
        is_active: true,
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating service charge:', error);
      throw errorCargo(error);
    }
    return result as ServiceCharge;
  }

  /**
   * Actualizar cargo. Los opcionales presentes y vacíos viajan como null
   * (volver a «Global», quitar mínimos). `updated_at` lo pone el trigger.
   */
  static async update(id: number, data: UpdateServiceChargeData): Promise<ServiceCharge> {
    // `.select()` porque un UPDATE que la RLS bloquea no da error: afecta 0 filas.
    const { data: filas, error } = await supabase
      .from('service_charges')
      .update(cambiosParaActualizar(data))
      .eq('id', id)
      .eq('organization_id', getOrganizationId())
      .select();

    if (error) {
      console.error('Error updating service charge:', error);
      throw errorCargo(error);
    }
    if (!filas || filas.length === 0) throw new CargoServicioError('SIN_PERMISO');
    return filas[0] as ServiceCharge;
  }

  /** Eliminar cargo de servicio */
  static async delete(id: number): Promise<void> {
    const { data: filas, error } = await supabase
      .from('service_charges')
      .delete()
      .eq('id', id)
      .eq('organization_id', getOrganizationId())
      .select('id');

    if (error) {
      console.error('Error deleting service charge:', error);
      throw errorCargo(error);
    }
    if (!filas || filas.length === 0) throw new CargoServicioError('SIN_PERMISO');
  }

  /** Activar/Desactivar cargo */
  static async toggleActive(id: number, isActive: boolean): Promise<ServiceCharge> {
    return this.update(id, { is_active: isActive });
  }

  /**
   * Duplicar cargo. `sufijo` es el texto traducido que se añade al nombre.
   */
  static async duplicate(id: number, sufijo = ' (copia)'): Promise<ServiceCharge> {
    const original = await this.getById(id);
    if (!original) throw new CargoServicioError('NO_ENCONTRADO');

    return this.create({
      name: `${original.name}${sufijo}`,
      charge_type: original.charge_type,
      charge_value: original.charge_value,
      min_amount: original.min_amount ?? null,
      min_guests: original.min_guests ?? null,
      applies_to: original.applies_to,
      is_taxable: original.is_taxable,
      is_optional: original.is_optional,
      branch_id: original.branch_id ?? null,
    });
  }

  /** Obtener sucursales disponibles */
  static async getBranches(): Promise<{ id: number; name: string }[]> {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name')
      .eq('organization_id', getOrganizationId())
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Error fetching branches:', error);
      throw errorCargo(error);
    }
    return data || [];
  }

  /**
   * Importar cargos desde CSV. `charge_type` admite percentage y fixed_amount
   * (y 'fixed' como alias). Devuelve cuántos se importaron, los errores por
   * fila y las columnas obligatorias que falten.
   */
  static async importFromCSV(csvData: string): Promise<{
    imported: number;
    errors: ErrorFilaCsv[];
    columnasFaltantes: string[];
  }> {
    const { filas, errores, columnasFaltantes } = parsearCsvCargos(csvData);
    if (columnasFaltantes.length > 0) return { imported: 0, errors: [], columnasFaltantes };

    let imported = 0;
    const errors: ErrorFilaCsv[] = [...errores];
    for (const { fila, datos } of filas) {
      try {
        await this.create(datos);
        imported++;
      } catch (e) {
        errors.push({ fila, codigo: errorCargo(e).codigo });
      }
    }
    errors.sort((a, b) => a.fila - b.fila);
    return { imported, errors, columnasFaltantes: [] };
  }

  /** Solo decide qué botones se muestran: la RLS vuelve a comprobarlo al escribir. */
  static async puedeGestionar(): Promise<boolean> {
    const { data, error } = await supabase.rpc('fn_tiene_permiso', {
      p_organization_id: getOrganizationId(),
      p_code: 'billing_management',
    });
    return !error && data === true;
  }

  /**
   * Calcular cargo aplicable
   */
  static calculateCharge(
    charge: ServiceCharge,
    subtotal: number,
    guests: number = 1
  ): number {
    // Verificar condiciones mínimas
    if (charge.min_amount && subtotal < charge.min_amount) {
      return 0;
    }
    if (charge.min_guests && guests < charge.min_guests) {
      return 0;
    }

    // Calcular según tipo
    if (charge.charge_type === 'percentage') {
      return (subtotal * charge.charge_value) / 100;
    } else {
      return charge.charge_value;
    }
  }
}
