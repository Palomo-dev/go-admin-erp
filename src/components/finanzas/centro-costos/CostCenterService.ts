import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';

export type AlcancePlantilla = 'base' | 'sector' | 'sucursal' | 'completo';

export interface CostCenter {
  id: string;
  organization_id: number;
  code: string;
  name: string;
  parent_id: string | null;
  branch_id: number | null;
  level: number | null;
  type: string | null;
  template_key: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  sucursal?: string | null;
}

export interface CostCenterInput {
  code: string;
  name: string;
  parent_id: string | null;
  branch_id?: number | null;
  is_active: boolean;
  is_default?: boolean;
}

export interface LineaPlantilla {
  code: string;
  name: string;
  accion: 'creado' | 'existia' | 'crear';
  branch_id?: number | null;
}

export interface ResultadoPlantilla {
  creados: number;
  ya_existian: number;
  previstos: number;
  centros: LineaPlantilla[];
}

export interface DistribucionCentro {
  id: string;
  nombre: string;
  activo: boolean;
  lineas: { cost_center_id: string; porcentaje: number }[];
}

export class CostCenterService {
  private static getOrganizationId(): number {
    const org = obtenerOrganizacionActiva();
    return org?.id || 0;
  }

  static async getAll(): Promise<CostCenter[]> {
    const orgId = this.getOrganizationId();
    const { data, error } = await supabase
      .from('cost_centers')
      .select('*, branches!cost_centers_branch_id_fkey(name)')
      .eq('organization_id', orgId)
      .order('code');
    if (error) throw error;
    return (data || []).map((fila) => {
      const sucursal = fila.branches;
      const nombre = Array.isArray(sucursal) ? sucursal[0]?.name : sucursal?.name;
      return { ...fila, sucursal: nombre ?? null, is_default: fila.is_default ?? false };
    });
  }

  /** Un solo centro por defecto por organización: el anterior deja de serlo. */
  private static async soltarDefecto(orgId: number, excepto?: string): Promise<void> {
    let consulta = supabase
      .from('cost_centers')
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq('organization_id', orgId)
      .eq('is_default', true);
    if (excepto) consulta = consulta.neq('id', excepto);
    const { error } = await consulta;
    if (error) throw error;
  }

  static async create(input: CostCenterInput): Promise<CostCenter> {
    const orgId = this.getOrganizationId();
    if (input.is_default) await this.soltarDefecto(orgId);
    const { data, error } = await supabase
      .from('cost_centers')
      .insert({ ...input, organization_id: orgId })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async update(id: string, input: Partial<CostCenterInput>): Promise<CostCenter> {
    const orgId = this.getOrganizationId();
    if (input.is_default) await this.soltarDefecto(orgId, id);
    const { data, error } = await supabase
      .from('cost_centers')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', orgId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Desactiva. El borrado físico se niega en la base si el centro ya tiene movimientos. */
  static async desactivar(id: string, activo: boolean): Promise<void> {
    const { error } = await supabase
      .from('cost_centers')
      .update({ is_active: activo, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', this.getOrganizationId());
    if (error) throw error;
  }

  static async sembrar(alcance: AlcancePlantilla, aplicar: boolean): Promise<ResultadoPlantilla> {
    const { data, error } = await supabase.rpc('fn_sembrar_centros_costo', {
      p_organization_id: this.getOrganizationId(),
      p_alcance: alcance,
      p_aplicar: aplicar,
    });
    if (error) throw error;
    const resultado = (data ?? {}) as Partial<ResultadoPlantilla>;
    return {
      creados: Number(resultado.creados ?? 0),
      ya_existian: Number(resultado.ya_existian ?? 0),
      previstos: Number(resultado.previstos ?? 0),
      centros: Array.isArray(resultado.centros) ? resultado.centros : [],
    };
  }

  static async defectoDeSucursal(branchId: number | null): Promise<string | null> {
    const orgId = this.getOrganizationId();
    if (branchId) {
      const { data, error } = await supabase
        .from('branches')
        .select('default_cost_center_id')
        .eq('id', branchId)
        .eq('organization_id', orgId)
        .maybeSingle();
      if (error) throw error;
      if (data?.default_cost_center_id) return String(data.default_cost_center_id);
    }
    const { data, error } = await supabase
      .from('cost_centers')
      .select('id')
      .eq('organization_id', orgId)
      .eq('is_default', true)
      .eq('is_active', true)
      .order('code')
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.id ? String(data.id) : null;
  }

  static async distribuciones(): Promise<DistribucionCentro[]> {
    const orgId = this.getOrganizationId();
    const { data, error } = await supabase
      .from('cost_center_distributions')
      .select('id, nombre, activo, cost_center_distribution_lines(cost_center_id, porcentaje)')
      .eq('organization_id', orgId)
      .eq('activo', true)
      .order('nombre');
    if (error) return [];
    return (data || []).map((fila) => ({
      id: String(fila.id),
      nombre: String(fila.nombre),
      activo: Boolean(fila.activo),
      lineas: (fila.cost_center_distribution_lines || []).map((linea: { cost_center_id: string; porcentaje: number }) => ({
        cost_center_id: String(linea.cost_center_id),
        porcentaje: Number(linea.porcentaje),
      })),
    }));
  }

  /** Una sola transacción: la suma de las líneas tiene que ser 100 al confirmar. */
  static async guardarDistribucion(
    nombre: string,
    lineas: { cost_center_id: string; porcentaje: number }[],
  ): Promise<string> {
    const { data, error } = await supabase.rpc('fn_distribucion_guardar', {
      p_organization_id: this.getOrganizationId(),
      p_nombre: nombre,
      p_lineas: lineas,
      p_id: null,
    });
    if (error) throw new Error(error.message);
    return String(data);
  }
}
